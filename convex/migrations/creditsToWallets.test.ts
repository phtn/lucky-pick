/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { api, internal } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import { auditWallets } from '../ledger/audit'
import { god } from '../lib/testIdentities'
import schema from '../schema'

// A root-absolute glob: `../**/*.ts` keys this directory's own files as `./x.ts`, which convex-test cannot place.
const modules = import.meta.glob('/convex/**/*.ts')

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const createAccount = async (t: ReturnType<typeof convexTest>, name: string) => {
  const accountId = await t
    .withIdentity(god)
    .mutation(api.accounts.m.create, {
      name,
      primaryContact: { name, email: `${name.toLowerCase().replace(/\s/g, '')}@example.com` }
    })
  const account = (await t.run((ctx) => ctx.db.get('accounts', accountId)))!
  return { accountId, slug: account.slug }
}

const legacyRow = (
  accountId: Id<'accounts'>,
  accountSlug: string,
  balance: number,
  extra: {
    userTokenIdentifier?: string | null
    lastReason?: 'initial-grant' | 'manual-grant' | 'adjustment' | 'spend'
  } = {}
) => ({
  accountId,
  accountSlug,
  userId: null,
  userTokenIdentifier: extra.userTokenIdentifier ?? null,
  balance,
  granted: balance,
  spent: 0,
  lastReason: extra.lastReason ?? ('manual-grant' as const),
  createdAt: 1,
  createdBy: 'legacy',
  updatedAt: 1,
  updatedBy: 'legacy'
})

const runMigration = async (t: ReturnType<typeof convexTest>) => {
  const result = await t.mutation(internal.migrations.creditsToWallets.run, {})
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  return result
}

test('moves positive balances into float and clears the credits table', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const t = convexTest(schema, modules)
  const { accountId, slug } = await createAccount(t, 'Ana Store')
  const { accountId: orphanId, slug: orphanSlug } = await createAccount(t, 'Gone Store')

  await t.run(async (ctx) => {
    await ctx.db.insert('credits', legacyRow(accountId, slug, 300, { userTokenIdentifier: 'tok|user' }))
    await ctx.db.insert('credits', legacyRow(accountId, slug, 200, { lastReason: 'initial-grant' }))
    await ctx.db.insert('credits', legacyRow(accountId, slug, 0, { userTokenIdentifier: 'tok|zero' }))
    await ctx.db.insert('credits', legacyRow(orphanId, orphanSlug, 75))
    // Deleted directly: `accounts.m.remove` would take its credits rows with it.
    await ctx.db.delete(orphanId)
  })

  expect(await runMigration(t)).toEqual({ migrated: 2, done: true })

  const state = await t.run(async (ctx) => {
    const wallets = await ctx.db.query('wallets').collect()
    return {
      credits: await ctx.db.query('credits').collect(),
      float: wallets.find((w) => w.kind === 'partnerFloat' && w.accountId === accountId)!.available,
      issuance: wallets.find((w) => w.systemKey === 'issuance')!.available,
      txns: await ctx.db.query('ledgerTransactions').collect(),
      audit: await auditWallets(ctx)
    }
  })
  expect(state.credits).toEqual([])
  expect(state.float).toBe(500)
  expect(state.issuance).toBe(-500)
  expect(state.txns).toHaveLength(2)
  expect(state.txns.every((txn) => txn.kind === 'migration' && txn.actorTokenIdentifier === 'system:migration')).toBe(
    true
  )
  expect(state.txns.map((txn) => txn.memo).sort()).toEqual(['credits.initial-grant', 'credits.manual-grant'])
  expect(
    state.txns.every((txn) => txn.ref?.type === 'migration' && txn.idempotencyKey === `migration:credits:${txn.ref.id}`)
  ).toBe(true)
  expect(state.audit).toEqual({ total: 0, mismatched: [] })
  expect(warn).toHaveBeenCalledTimes(1)
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('1'))

  // Nothing left to move.
  expect(await runMigration(t)).toEqual({ migrated: 0, done: true })
  const after = await t.run(async (ctx) => ({
    txns: (await ctx.db.query('ledgerTransactions').collect()).length,
    audit: await auditWallets(ctx)
  }))
  expect(after.txns).toBe(2)
  expect(after.audit).toEqual({ total: 0, mismatched: [] })
})

test('creates wallets for a legacy account that has none', async () => {
  const t = convexTest(schema, modules)
  const { accountId, slug } = await createAccount(t, 'Old Store')
  await t.run(async (ctx) => {
    for (const wallet of await ctx.db.query('wallets').collect()) await ctx.db.delete(wallet._id)
    await ctx.db.insert('credits', legacyRow(accountId, slug, 40))
  })

  expect(await runMigration(t)).toEqual({ migrated: 1, done: true })

  const float = await t.run(async (ctx) =>
    (await ctx.db.query('wallets').collect()).find((w) => w.kind === 'partnerFloat' && w.accountId === accountId)
  )
  expect(float?.available).toBe(40)
})

test('continues in further batches until every row is migrated', async () => {
  const t = convexTest(schema, modules)
  const accounts = [await createAccount(t, 'One'), await createAccount(t, 'Two'), await createAccount(t, 'Three')]
  await t.run(async (ctx) => {
    for (let i = 0; i < 101; i++) {
      const { accountId, slug } = accounts[i % accounts.length]
      await ctx.db.insert('credits', legacyRow(accountId, slug, 1))
    }
  })

  // The first batch is full, so it reports more to come.
  expect(await t.mutation(internal.migrations.creditsToWallets.run, {})).toEqual({ migrated: 100, done: false })
  await t.finishAllScheduledFunctions(vi.runAllTimers)

  const state = await t.run(async (ctx) => {
    const wallets = await ctx.db.query('wallets').collect()
    return {
      credits: (await ctx.db.query('credits').collect()).length,
      floatTotal: wallets.filter((w) => w.kind === 'partnerFloat').reduce((sum, w) => sum + w.available, 0),
      txns: (await ctx.db.query('ledgerTransactions').collect()).filter((txn) => txn.kind === 'migration').length,
      audit: await auditWallets(ctx)
    }
  })
  expect(state).toMatchObject({ credits: 0, floatTotal: 101, txns: 101, audit: { total: 0, mismatched: [] } })
})
