/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { api } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import { auditWallets } from '../ledger/audit'
import { requireAccountManager } from './helpers'
import { god, godB, member, staff, topg } from '../lib/testIdentities'
import schema from '../schema'

// A root-absolute glob: `../**/*.ts` keys this directory's own files as `./x.ts`, which convex-test cannot place.
const modules = import.meta.glob('/convex/**/*.ts')

const makeT = () => convexTest(schema, modules)
type T = ReturnType<typeof makeT>

const create = (t: T, extra: { initialCredits?: number; testCredits?: number; slug?: string } = {}) =>
  t.withIdentity(god).mutation(api.accounts.m.create, {
    name: 'Ana Store',
    primaryContact: { name: 'Ana', email: 'ana@example.com' },
    ...extra
  })

const snapshot = (t: T, accountId: Id<'accounts'>) =>
  t.run(async (ctx) => ({
    account: await ctx.db.get('accounts', accountId),
    wallets: await ctx.db
      .query('wallets')
      .withIndex('by_accountId_and_kind', (q) => q.eq('accountId', accountId))
      .collect(),
    requests: await ctx.db
      .query('topupRequests')
      .withIndex('by_accountId_and_createdAt', (q) => q.eq('accountId', accountId))
      .collect(),
    credits: await ctx.db
      .query('credits')
      .withIndex('by_accountId', (q) => q.eq('accountId', accountId))
      .collect()
  }))

test('create opens float and earnings at zero', async () => {
  const t = makeT()
  const accountId = await create(t)

  const { wallets, requests, credits } = await snapshot(t, accountId)
  expect(wallets.map((w) => w.kind).sort()).toEqual(['partnerEarnings', 'partnerFloat'])
  expect(wallets.every((w) => w.available === 0 && w.held === 0)).toBe(true)
  expect(requests).toEqual([])
  // The account's credits row is opened too, empty and not yet linked to anyone.
  expect(credits).toHaveLength(1)
  expect(credits[0]).toMatchObject({
    accountSlug: 'ana-store',
    userId: null,
    userTokenIdentifier: null,
    balance: 0,
    granted: 0,
    spent: 0,
    lastReason: 'initial-grant',
    createdBy: god.tokenIdentifier
  })
})

test('a test grant mints into float at creation, with no request to approve', async () => {
  const t = makeT()
  const accountId = await create(t, { testCredits: 25_000 })

  const { requests, wallets } = await snapshot(t, accountId)
  expect(requests).toEqual([])
  expect(wallets.find((w) => w.kind === 'partnerFloat')!.available).toBe(25_000)
  expect(wallets.find((w) => w.kind === 'partnerEarnings')!.available).toBe(0)
  expect(await t.run((ctx) => auditWallets(ctx))).toEqual({ total: 0, mismatched: [] })
})

test('a custom opening grant off the ladder is accepted and minted', async () => {
  const t = makeT()
  const accountId = await create(t, { initialCredits: 73_500 })

  const { account, requests, wallets } = await snapshot(t, accountId)
  expect(account!.initialCredits).toBe(73_500)
  expect(requests).toEqual([])
  expect(wallets.find((w) => w.kind === 'partnerFloat')!.available).toBe(73_500)
})

test('an opening grant past the top-up ceiling is refused', async () => {
  const t = makeT()

  await expect(create(t, { initialCredits: 10_000_001 })).rejects.toThrow(
    'An opening grant must be a whole number of credits from 0 to 10,000,000.'
  )
  await expect(create(t, { testCredits: 2_500.5 })).rejects.toThrow(
    'A test grant must be a whole number of credits from 0 to 10,000,000.'
  )
})

test('the opening grant is the float balance the account starts with', async () => {
  const t = makeT()
  const accountId = await create(t, { initialCredits: 50_000, testCredits: 5_000 })

  const { account, requests, wallets } = await snapshot(t, accountId)
  expect(account!.initialCredits).toBe(50_000)
  // Nothing waits on a second god: the grant is minted, not promised.
  expect(requests).toEqual([])
  expect(wallets.find((w) => w.kind === 'partnerFloat')!.available).toBe(55_000)
  expect(wallets.find((w) => w.kind === 'partnerEarnings')!.available).toBe(0)

  // Both grants land as their own transaction, so the memos keep the opening
  // grant and the test money apart in the books.
  const memos = await t.run(async (ctx) =>
    (await ctx.db.query('ledgerTransactions').collect()).map((txn) => txn.memo).sort()
  )
  expect(memos).toEqual(['Opening grant', 'Test credits'])
  expect(await t.run((ctx) => auditWallets(ctx))).toEqual({ total: 0, mismatched: [] })
})

test('create with 0 credits mints nothing', async () => {
  const t = makeT()
  const accountId = await create(t, { initialCredits: 0 })

  const { requests, wallets } = await snapshot(t, accountId)
  expect(requests).toEqual([])
  expect(wallets.every((w) => w.available === 0)).toBe(true)
})

test('remove refuses with ledger history', async () => {
  const t = makeT()
  // An opening grant is ledger history the moment the account exists.
  const accountId = await create(t, { initialCredits: 50_000 })

  await expect(t.withIdentity(topg).mutation(api.accounts.m.remove, { id: accountId })).rejects.toThrow(
    'This account has ledger history and cannot be deleted. Close it instead.'
  )
  const after = await snapshot(t, accountId)
  expect(after.account).not.toBeNull()
  expect(after.wallets).toHaveLength(2)
})

test('remove refuses when the account has a user wallet', async () => {
  const t = makeT()
  const accountId = await create(t)
  const userId = await t.withIdentity(member('ben', 'ben@example.com')).mutation(api.users.m.ensureCurrent, {})
  await t.run(async (ctx) => {
    await ctx.db.insert('wallets', {
      kind: 'user',
      accountId,
      userId,
      systemKey: null,
      available: 0,
      held: 0,
      floor: 0,
      status: 'active',
      createdAt: 0,
      updatedAt: 0
    })
  })

  await expect(t.withIdentity(topg).mutation(api.accounts.m.remove, { id: accountId })).rejects.toThrow(
    'This account has ledger history and cannot be deleted. Close it instead.'
  )
})

test('remove deletes an unfunded account with its wallets and unapproved requests', async () => {
  const t = makeT()
  const accountId = await create(t)
  await t
    .withIdentity(god)
    .mutation(api.money.topups.request, { accountId, amount: 5_000, paymentReference: 'ref-1' })
  expect((await snapshot(t, accountId)).requests).toHaveLength(1)
  // A cancelled one alongside the pending one.
  await t.run(async (ctx) => {
    const [pending] = await ctx.db
      .query('topupRequests')
      .withIndex('by_accountId_and_createdAt', (q) => q.eq('accountId', accountId))
      .take(1)
    const { _id, _creationTime, ...rest } = pending
    await ctx.db.insert('topupRequests', { ...rest, status: 'cancelled' })
  })

  await t.withIdentity(topg).mutation(api.accounts.m.remove, { id: accountId })

  const after = await snapshot(t, accountId)
  expect(after.account).toBeNull()
  expect(after.wallets).toEqual([])
  expect(after.requests).toEqual([])
})

/** Puts a balance on the row `create` opened, as the retired table would have held it. */
const fundLegacyCreditsRow = async (t: T, accountId: Id<'accounts'>, balance: number) =>
  await t.run(async (ctx) => {
    const [row] = await ctx.db
      .query('credits')
      .withIndex('by_accountId', (q) => q.eq('accountId', accountId))
      .take(1)
    await ctx.db.patch('credits', row._id, { balance, granted: balance })
  })

test('remove refuses while a legacy credits row still holds a balance', async () => {
  const t = makeT()
  const accountId = await create(t)
  await fundLegacyCreditsRow(t, accountId, 300)

  await expect(t.withIdentity(topg).mutation(api.accounts.m.remove, { id: accountId })).rejects.toThrow(
    'This account has ledger history and cannot be deleted. Close it instead.'
  )

  const after = await snapshot(t, accountId)
  expect(after.account).not.toBeNull()
  expect(after.wallets).toHaveLength(2)
  expect(after.credits).toHaveLength(1)
  expect(after.credits[0].balance).toBe(300)
})

test('remove deletes zero-balance legacy credits rows with an unfunded account', async () => {
  const t = makeT()
  const accountId = await create(t)
  expect((await snapshot(t, accountId)).credits).toHaveLength(1)

  await t.withIdentity(topg).mutation(api.accounts.m.remove, { id: accountId })
  const after = await snapshot(t, accountId)
  expect(after.account).toBeNull()
  expect(after.credits).toEqual([])
})

const ana = () => member('ana', 'ana@example.com')

// An active account whose contact (ana) has signed in and is linked.
const linkedActive = async (t: T) => {
  const accountId = await create(t, { initialCredits: 0 })
  await t.withIdentity(ana()).mutation(api.users.m.ensureCurrent, {})
  await t.withIdentity(god).mutation(api.accounts.m.update, { id: accountId, status: 'active' })
  return accountId
}

test('staff cannot change the primary contact', async () => {
  const t = makeT()
  const accountId = await create(t)

  await expect(
    t.withIdentity(staff).mutation(api.accounts.m.update, {
      id: accountId,
      primaryContact: { name: 'Mallory', email: 'mallory@example.com' }
    })
  ).rejects.toThrow('This action requires a god account.')

  const updated = await t.withIdentity(staff).mutation(api.accounts.m.update, { id: accountId, name: 'Renamed' })
  expect(updated.name).toBe('Renamed')
  expect(updated.primaryContact.email).toBe('ana@example.com')
})

test('changing the contact email unlinks the previous contact', async () => {
  const t = makeT()
  const accountId = await linkedActive(t)
  await t.withIdentity(ana()).run((ctx) => requireAccountManager(ctx, accountId))

  const updated = await t.withIdentity(god).mutation(api.accounts.m.update, {
    id: accountId,
    primaryContact: { name: 'Bea', email: 'bea@example.com' }
  })

  expect(updated.primaryContact).toMatchObject({
    email: 'bea@example.com',
    tokenIdentifier: null,
    firebaseUid: null,
    userId: null,
    emailVerified: null
  })
  await expect(t.withIdentity(ana()).run((ctx) => requireAccountManager(ctx, accountId))).rejects.toThrow(
    'Unauthorized.'
  )
})

test('editing the contact name keeps the link', async () => {
  const t = makeT()
  const accountId = await linkedActive(t)
  const before = (await snapshot(t, accountId)).account!.primaryContact

  const updated = await t.withIdentity(god).mutation(api.accounts.m.update, {
    id: accountId,
    primaryContact: { name: 'Ana Reyes', email: 'Ana@Example.com' }
  })

  expect(updated.primaryContact.name).toBe('Ana Reyes')
  expect(updated.primaryContact).toMatchObject({
    tokenIdentifier: before.tokenIdentifier,
    firebaseUid: before.firebaseUid,
    userId: before.userId
  })
  expect(before.tokenIdentifier).not.toBeNull()
  await t.withIdentity(ana()).run((ctx) => requireAccountManager(ctx, accountId))
})
