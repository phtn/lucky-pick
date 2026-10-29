/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { api } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import { auditWallets } from '../ledger/audit'
import { god, godB, staff } from '../lib/testIdentities'
import schema from '../schema'
import { createTopupRequest } from './topups'

// A root-absolute glob: `../**/*.ts` keys this directory's own files as `./x.ts`, which convex-test cannot place.
const modules = import.meta.glob('/convex/**/*.ts')

const setup = async () => {
  const t = convexTest(schema, modules)
  const accountId = await t
    .withIdentity(god)
    .mutation(api.accounts.m.create, { name: 'Ana Store', primaryContact: { name: 'Ana', email: 'ana@example.com' } })
  await t.run((ctx) => ctx.db.patch(accountId, { status: 'active' }))
  return { t, accountId }
}

const request = (
  t: ReturnType<typeof convexTest>,
  accountId: Id<'accounts'>,
  amount = 5_000,
  extra: { note?: string; paymentReference?: string } = {}
) =>
  t.withIdentity(god).mutation(api.money.topups.request, { accountId, amount, paymentReference: 'GCASH-001', ...extra })

const counts = (t: ReturnType<typeof convexTest>) =>
  t.run(async (ctx) => ({
    requests: (await ctx.db.query('topupRequests').collect()).length,
    txns: (await ctx.db.query('ledgerTransactions').collect()).length,
    entries: (await ctx.db.query('ledgerEntries').collect()).length
  }))

test('approving mints into the partner float', async () => {
  const { t, accountId } = await setup()
  const id = await request(t, accountId, 5_000)

  await t.withIdentity(godB).mutation(api.money.topups.approve, { id, decisionNote: 'Seen in the bank.' })

  const state = await t.run(async (ctx) => {
    const wallets = await ctx.db.query('wallets').collect()
    return {
      float: wallets.find((w) => w.kind === 'partnerFloat')!.available,
      issuance: wallets.find((w) => w.systemKey === 'issuance')!.available,
      doc: (await ctx.db.get('topupRequests', id))!,
      audit: await auditWallets(ctx)
    }
  })
  expect(state.float).toBe(5_000)
  expect(state.issuance).toBe(-5_000)
  expect(state.doc).toMatchObject({
    status: 'approved',
    currency: 'PHP',
    makerTokenIdentifier: god.tokenIdentifier,
    checkerTokenIdentifier: godB.tokenIdentifier,
    decisionNote: 'Seen in the bank.'
  })
  expect(state.doc.txnId).not.toBeNull()
  expect(state.doc.decidedAt).not.toBeNull()
  expect(state.audit).toEqual({ total: 0, mismatched: [] })

  const txn = await t.run((ctx) => ctx.db.get('ledgerTransactions', state.doc.txnId!))
  expect(txn).toMatchObject({ kind: 'mint', idempotencyKey: `topup:${id}`, ref: { type: 'topup', id } })
})

test('maker cannot approve own request', async () => {
  const { t, accountId } = await setup()
  const id = await request(t, accountId)

  await expect(t.withIdentity(god).mutation(api.money.topups.approve, { id })).rejects.toThrow(
    'A top-up must be approved by someone other than the god who requested it.'
  )
  expect((await t.run((ctx) => ctx.db.get('topupRequests', id)))!.status).toBe('pending')
  expect(await counts(t)).toMatchObject({ txns: 0, entries: 0 })
})

test('approving twice mints once', async () => {
  const { t, accountId } = await setup()
  const id = await request(t, accountId)
  await t.withIdentity(godB).mutation(api.money.topups.approve, { id })

  await expect(t.withIdentity(godB).mutation(api.money.topups.approve, { id })).rejects.toThrow(
    'This top-up is already approved.'
  )
  const mints = await t.run(async (ctx) =>
    (await ctx.db.query('ledgerTransactions').collect()).filter((txn) => txn.kind === 'mint')
  )
  expect(mints).toHaveLength(1)
})

test('rejects malformed amounts', async () => {
  const { t, accountId } = await setup()
  for (const amount of [0, -5, 1.5, NaN, Infinity, 10_000_001]) {
    await expect(request(t, accountId, amount)).rejects.toThrow()
  }
  expect((await counts(t)).requests).toBe(0)
  // The boundary values are accepted.
  await request(t, accountId, 1)
  await request(t, accountId, 10_000_000)
  expect((await counts(t)).requests).toBe(2)
})

test('request validates account, reference and note lengths', async () => {
  const { t, accountId } = await setup()
  await expect(request(t, accountId, 100, { paymentReference: '   ' })).rejects.toThrow(
    'A payment reference of 1 to 120 characters is required.'
  )
  await expect(request(t, accountId, 100, { paymentReference: 'x'.repeat(121) })).rejects.toThrow(
    'A payment reference of 1 to 120 characters is required.'
  )
  await expect(request(t, accountId, 100, { note: 'x'.repeat(2_001) })).rejects.toThrow(
    'Notes must be 2,000 characters or fewer.'
  )
  // An id that once pointed at an account, so it is well-formed but gone.
  const gone = await t.run(async (ctx) => {
    const account = (await ctx.db.get('accounts', accountId))!
    const { _id, _creationTime, ...fields } = account
    const id = await ctx.db.insert('accounts', { ...fields, slug: 'gone-store' })
    await ctx.db.delete('accounts', id)
    return id
  })
  await expect(request(t, gone)).rejects.toThrow('Account not found.')
  expect((await counts(t)).requests).toBe(0)
})

test('createTopupRequest applies the same validation and allows a null reference', async () => {
  const { t, accountId } = await setup()
  const make = (amount: number, paymentReference: string | null = null, note: string | null = null) =>
    t.run((ctx) =>
      createTopupRequest(ctx, { accountId, amount, paymentReference, note, makerTokenIdentifier: god.tokenIdentifier })
    )

  await expect(make(0)).rejects.toThrow('A top-up must be a whole number of credits from 1 to 10,000,000.')
  await expect(make(1.5)).rejects.toThrow('A top-up must be a whole number of credits')
  await expect(make(10, 'x'.repeat(121))).rejects.toThrow('A payment reference of 1 to 120 characters is required.')
  await expect(make(10, null, 'x'.repeat(2_001))).rejects.toThrow('Notes must be 2,000 characters or fewer.')

  const id = await make(25_000)
  const doc = await t.run((ctx) => ctx.db.get('topupRequests', id))
  expect(doc).toMatchObject({ status: 'pending', paymentReference: null, amount: 25_000, currency: 'PHP' })
})

test('cannot request or approve for a closed account', async () => {
  const { t, accountId } = await setup()
  const id = await request(t, accountId)
  await t.run((ctx) => ctx.db.patch(accountId, { status: 'closed' }))

  await expect(t.withIdentity(godB).mutation(api.money.topups.approve, { id })).rejects.toThrow(
    'This account is closed.'
  )
  await expect(request(t, accountId)).rejects.toThrow('This account is closed.')

  expect((await t.run((ctx) => ctx.db.get('topupRequests', id)))!.status).toBe('pending')
  expect(await counts(t)).toMatchObject({ txns: 0, entries: 0 })
  expect(await t.run((ctx) => ctx.db.query('wallets').collect())).toHaveLength(0)
})

test('only gods act; staff can list', async () => {
  const { t, accountId } = await setup()
  const id = await request(t, accountId)

  await expect(
    t.withIdentity(staff).mutation(api.money.topups.request, { accountId, amount: 10, paymentReference: 'ref' })
  ).rejects.toThrow()
  await expect(t.withIdentity(staff).mutation(api.money.topups.approve, { id })).rejects.toThrow()
  await expect(t.withIdentity(staff).mutation(api.money.topups.reject, { id, decisionNote: 'no' })).rejects.toThrow()
  await expect(t.withIdentity(staff).mutation(api.money.topups.cancel, { id })).rejects.toThrow()
  await expect(t.mutation(api.money.topups.request, { accountId, amount: 10, paymentReference: 'ref' })).rejects.toThrow()

  const listed = await t.withIdentity(staff).query(api.money.topups.list, {})
  expect(listed.map((row) => row._id)).toEqual([id])
  await expect(t.query(api.money.topups.list, {})).rejects.toThrow()
})

test('reject needs a note and a different god; only the maker cancels', async () => {
  const { t, accountId } = await setup()
  const id = await request(t, accountId)

  await expect(t.withIdentity(godB).mutation(api.money.topups.reject, { id, decisionNote: '   ' })).rejects.toThrow(
    'A rejection needs a reason.'
  )
  await expect(t.withIdentity(god).mutation(api.money.topups.reject, { id, decisionNote: 'mine' })).rejects.toThrow(
    'A top-up must be rejected by someone other than the god who requested it.'
  )
  await expect(t.withIdentity(godB).mutation(api.money.topups.cancel, { id })).rejects.toThrow(
    'Only the god who requested a top-up can cancel it.'
  )

  await t.withIdentity(godB).mutation(api.money.topups.reject, { id, decisionNote: 'No payment found.' })
  expect(await t.run((ctx) => ctx.db.get('topupRequests', id))).toMatchObject({
    status: 'rejected',
    checkerTokenIdentifier: godB.tokenIdentifier,
    decisionNote: 'No payment found.'
  })
  await expect(t.withIdentity(god).mutation(api.money.topups.cancel, { id })).rejects.toThrow(
    'This top-up is already rejected.'
  )
  await expect(t.withIdentity(godB).mutation(api.money.topups.approve, { id })).rejects.toThrow(
    'This top-up is already rejected.'
  )

  const second = await request(t, accountId, 100)
  await t.withIdentity(god).mutation(api.money.topups.cancel, { id: second })
  expect((await t.run((ctx) => ctx.db.get('topupRequests', second)))!.status).toBe('cancelled')
  expect(await counts(t)).toMatchObject({ txns: 0, entries: 0 })
})

test('list filters by status and account, newest first, with a bounded limit', async () => {
  const { t, accountId } = await setup()
  const first = await request(t, accountId, 100)
  const second = await request(t, accountId, 200)
  await t.withIdentity(god).mutation(api.money.topups.cancel, { id: first })

  const all = await t.withIdentity(staff).query(api.money.topups.list, {})
  expect(all.map((row) => row._id)).toEqual([second, first])
  const pending = await t.withIdentity(staff).query(api.money.topups.list, { status: 'pending' })
  expect(pending.map((row) => row._id)).toEqual([second])
  const forAccount = await t.withIdentity(staff).query(api.money.topups.list, { accountId, limit: 1 })
  expect(forAccount.map((row) => row._id)).toEqual([second])
  const both = await t.withIdentity(staff).query(api.money.topups.list, { accountId, status: 'cancelled' })
  expect(both.map((row) => row._id)).toEqual([first])
  expect(await t.withIdentity(staff).query(api.money.topups.list, { limit: -3 })).toHaveLength(1)
})
