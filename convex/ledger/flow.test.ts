/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { api, internal } from '../_generated/api'
import { god, godB, member, staff } from '../lib/testIdentities'
import schema from '../schema'
import { auditWallets } from './audit'

// A root-absolute glob: `../**/*.ts` keys this directory's own files as `./x.ts`, which convex-test cannot place.
const modules = import.meta.glob('/convex/**/*.ts')

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// The whole Phase 0-1 path in order: provision, link, activate, approve the
// opening grant, read as the partner, then fold a legacy balance into the float.
test('opening grant to partner reads to legacy migration', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const t = convexTest(schema, modules)
  const ana = member('ana', 'ana@example.com')

  const accountId = await t.withIdentity(god).mutation(api.accounts.m.create, {
    name: 'Ana Store',
    initialCredits: 50_000,
    primaryContact: { name: 'Ana', email: 'ana@example.com' }
  })

  await t.withIdentity(ana).mutation(api.users.m.ensureCurrent, {})
  await t.withIdentity(staff).mutation(api.accounts.m.update, { id: accountId, status: 'active' })

  const [request] = await t.run((ctx) =>
    ctx.db
      .query('topupRequests')
      .withIndex('by_accountId_and_createdAt', (q) => q.eq('accountId', accountId))
      .collect()
  )
  expect(request).toMatchObject({ status: 'pending', amount: 50_000 })
  await t.withIdentity(godB).mutation(api.money.topups.approve, { id: request._id })

  const asAna = t.withIdentity(ana)
  const { float } = await asAna.query(api.ledger.q.partnerWallets, { accountId })
  expect(float).toMatchObject({ kind: 'partnerFloat', available: 50_000 })

  const entries = await asAna.query(api.ledger.q.walletEntries, {
    walletId: float!._id,
    paginationOpts: { numItems: 10, cursor: null }
  })
  expect(entries.page).toHaveLength(1)
  expect(entries.page[0]).toMatchObject({ walletId: float!._id, amount: 50_000 })

  const account = (await t.run((ctx) => ctx.db.get('accounts', accountId)))!
  await t.run((ctx) =>
    ctx.db.insert('credits', {
      accountId,
      accountSlug: account.slug,
      userId: null,
      userTokenIdentifier: null,
      balance: 300,
      granted: 300,
      spent: 0,
      lastReason: 'manual-grant',
      createdAt: 1,
      createdBy: 'legacy',
      updatedAt: 1,
      updatedBy: 'legacy'
    })
  )
  expect(await t.mutation(internal.migrations.creditsToWallets.run, {})).toEqual({ migrated: 1, done: true })
  await t.finishAllScheduledFunctions(vi.runAllTimers)

  const after = await asAna.query(api.ledger.q.partnerWallets, { accountId })
  expect(after.float!.available).toBe(50_300)
  expect(await t.run((ctx) => auditWallets(ctx))).toEqual({ total: 0, mismatched: [] })
})
