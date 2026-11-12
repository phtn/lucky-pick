/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { api } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import { auditWallets } from '../ledger/audit'
import { god, godB, member, staff, topg } from '../lib/testIdentities'
import schema from '../schema'
import { createTopupRequest } from './topups'

// A root-absolute glob: `../**/*.ts` keys this directory's own files as `./x.ts`, which convex-test cannot place.
const modules = import.meta.glob('/convex/**/*.ts')

const ana = member('ana', 'ana@example.com')
const bo = member('bo', 'bo@example.com')

const setup = async () => {
  const t = convexTest(schema, modules)
  const accountId = await t
    .withIdentity(god)
    .mutation(api.accounts.m.create, { name: 'Ana Store', primaryContact: { name: 'Ana', email: 'ana@example.com' } })
  // Signing in links Ana to the house by her verified email, which is what lets her claim.
  await t.withIdentity(ana).mutation(api.users.m.ensureCurrent, {})
  await t.run((ctx) => ctx.db.patch(accountId, { status: 'active' }))
  return { t, accountId }
}

const claim = (t: ReturnType<typeof convexTest>, id: Id<'topupRequests'>, who = ana) =>
  t.withIdentity(who).mutation(api.money.topups.claim, { id })

const floatOf = (t: ReturnType<typeof convexTest>) =>
  t.run(async (ctx) => (await ctx.db.query('wallets').collect()).find((w) => w.kind === 'partnerFloat')!.available)

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

test('approving mints nothing; the contact claiming it mints into the partner float', async () => {
  const { t, accountId } = await setup()
  const id = await request(t, accountId, 5_000)

  await t.withIdentity(godB).mutation(api.money.topups.approve, { id, decisionNote: 'Seen in the bank.' })

  expect(await floatOf(t)).toBe(0)
  expect(await counts(t)).toMatchObject({ txns: 0, entries: 0 })
  expect(await t.run((ctx) => ctx.db.get('topupRequests', id))).toMatchObject({ status: 'approved', txnId: null })

  await claim(t, id)

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
    status: 'claimed',
    currency: 'PHP',
    makerTokenIdentifier: god.tokenIdentifier,
    checkerTokenIdentifier: godB.tokenIdentifier,
    decisionNote: 'Seen in the bank.',
    claimedBy: ana.tokenIdentifier
  })
  expect(state.doc.claimedAt).toBeTypeOf('number')
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

test('approving twice and claiming twice mints once', async () => {
  const { t, accountId } = await setup()
  const id = await request(t, accountId)
  await t.withIdentity(godB).mutation(api.money.topups.approve, { id })

  await expect(t.withIdentity(godB).mutation(api.money.topups.approve, { id })).rejects.toThrow(
    'This top-up is already approved.'
  )
  await claim(t, id)
  await expect(claim(t, id)).rejects.toThrow('This top-up has already been claimed.')
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
  // Accounts open their two partner wallets at birth, so what matters is that they stayed empty.
  const wallets = await t.run((ctx) => ctx.db.query('wallets').collect())
  expect(wallets.map((w) => w.kind).sort()).toEqual(['partnerEarnings', 'partnerFloat'])
  expect(wallets.every((w) => w.available === 0)).toBe(true)
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

test('viewer answers with the caller’s own identifier, and only to staff', async () => {
  const { t } = await setup()

  expect(await t.withIdentity(god).query(api.money.topups.viewer, {})).toBe(god.tokenIdentifier)
  expect(await t.withIdentity(godB).query(api.money.topups.viewer, {})).toBe(godB.tokenIdentifier)
  await expect(t.query(api.money.topups.viewer, {})).rejects.toThrow('Unauthorized.')
})

test('the second-god rule starts on, and only a top god can switch it', async () => {
  const { t } = await setup()

  expect(await t.withIdentity(staff).query(api.money.topups.policy, {})).toEqual({
    requireSecondGod: true,
    updatedAt: null,
    updatedBy: null
  })
  await expect(
    t.withIdentity(god).mutation(api.money.topups.setSecondGodRule, { requireSecondGod: false })
  ).rejects.toThrow('Changing the approval rule requires a top-god account.')

  await t.withIdentity(topg).mutation(api.money.topups.setSecondGodRule, { requireSecondGod: false })

  expect(await t.withIdentity(staff).query(api.money.topups.policy, {})).toMatchObject({
    requireSecondGod: false,
    updatedBy: topg.tokenIdentifier
  })
})

test('with the rule off the maker may approve or reject their own request', async () => {
  const { t, accountId } = await setup()
  const approved = await request(t, accountId, 5_000)
  const rejected = await request(t, accountId, 700)
  await t.withIdentity(topg).mutation(api.money.topups.setSecondGodRule, { requireSecondGod: false })

  await t.withIdentity(god).mutation(api.money.topups.approve, { id: approved })
  await t.withIdentity(god).mutation(api.money.topups.reject, { id: rejected, decisionNote: 'Typo.' })
  await claim(t, approved)

  const state = await t.run(async (ctx) => ({
    float: (await ctx.db.query('wallets').collect()).find((w) => w.kind === 'partnerFloat')!.available,
    approved: (await ctx.db.get('topupRequests', approved))!,
    rejected: (await ctx.db.get('topupRequests', rejected))!,
    audit: await auditWallets(ctx)
  }))
  expect(state.float).toBe(5_000)
  // The record still names the same god twice, which is what marks a self-approval.
  expect(state.approved).toMatchObject({
    status: 'claimed',
    makerTokenIdentifier: god.tokenIdentifier,
    checkerTokenIdentifier: god.tokenIdentifier
  })
  expect(state.rejected.status).toBe('rejected')
  expect(state.audit).toEqual({ total: 0, mismatched: [] })
})

test('switching the rule back on restores the check', async () => {
  const { t, accountId } = await setup()
  const id = await request(t, accountId)
  await t.withIdentity(topg).mutation(api.money.topups.setSecondGodRule, { requireSecondGod: false })
  await t.withIdentity(topg).mutation(api.money.topups.setSecondGodRule, { requireSecondGod: true })

  await expect(t.withIdentity(god).mutation(api.money.topups.approve, { id })).rejects.toThrow(
    'A top-up must be approved by someone other than the god who requested it.'
  )
})

test('every flip of the rule is logged, newest first, and a no-op is not', async () => {
  const { t } = await setup()
  const flip = (requireSecondGod: boolean) =>
    t.withIdentity(topg).mutation(api.money.topups.setSecondGodRule, { requireSecondGod })

  await flip(true)
  await flip(false)
  await flip(false)
  await flip(true)

  const changes = await t.withIdentity(staff).query(api.money.topups.policyChanges, {})
  expect(changes.map((change) => change.requireSecondGod)).toEqual([true, false])
  expect(changes[0]).toMatchObject({ actorTokenIdentifier: topg.tokenIdentifier, actorLabel: 'topg' })
})

test('only the house’s linked contact can claim, and only what was approved', async () => {
  const { t, accountId } = await setup()
  const pending = await request(t, accountId, 100)
  const approved = await request(t, accountId, 5_000)
  await t.withIdentity(godB).mutation(api.money.topups.approve, { id: approved })
  await t.withIdentity(bo).mutation(api.users.m.ensureCurrent, {})

  // Neither a stranger nor the gods who made and checked it may take the credits.
  for (const who of [bo, god, godB]) {
    await expect(t.withIdentity(who).mutation(api.money.topups.claim, { id: approved })).rejects.toThrow('Unauthorized.')
  }
  await expect(t.mutation(api.money.topups.claim, { id: approved })).rejects.toThrow('Unauthorized.')
  await expect(claim(t, pending)).rejects.toThrow('This top-up is pending and cannot be claimed.')
  expect(await floatOf(t)).toBe(0)

  // A suspended house cannot claim until it is usable again.
  await t.run((ctx) => ctx.db.patch(accountId, { status: 'suspended' }))
  await expect(claim(t, approved)).rejects.toThrow('Unauthorized.')
  await t.run((ctx) => ctx.db.patch(accountId, { status: 'active' }))

  await claim(t, approved)
  expect(await floatOf(t)).toBe(5_000)
})

test('claimable lists a contact’s approved, unminted top-ups and nobody else’s', async () => {
  const { t, accountId } = await setup()
  await request(t, accountId, 100)
  const approved = await request(t, accountId, 5_000)
  const taken = await request(t, accountId, 900)
  await t.withIdentity(godB).mutation(api.money.topups.approve, { id: approved })
  await t.withIdentity(godB).mutation(api.money.topups.approve, { id: taken })
  await claim(t, taken)
  // A request approved before claiming existed: still `approved`, but already minted.
  const legacy = await request(t, accountId, 300)
  const txnId = (await t.run((ctx) => ctx.db.get('topupRequests', taken)))!.txnId
  await t.run((ctx) => ctx.db.patch('topupRequests', legacy, { status: 'approved', decidedAt: 1, txnId }))

  expect(await t.withIdentity(ana).query(api.money.topups.claimable, {})).toMatchObject([
    { id: approved, accountId, accountName: 'Ana Store', amount: 5_000 }
  ])
  expect(await t.withIdentity(bo).query(api.money.topups.claimable, {})).toEqual([])
  await expect(claim(t, legacy)).rejects.toThrow('This top-up has already been claimed.')

  await t.run((ctx) => ctx.db.patch(accountId, { status: 'suspended' }))
  expect(await t.withIdentity(ana).query(api.money.topups.claimable, {})).toEqual([])
})

test('a claimed top-up shows in the contact’s house balance, with its movement', async () => {
  const { t, accountId } = await setup()
  const id = await request(t, accountId, 5_000)
  await t.withIdentity(godB).mutation(api.money.topups.approve, { id })

  expect(await t.withIdentity(ana).query(api.ledger.q.myHouseWallets, {})).toMatchObject([
    { accountId, name: 'Ana Store', float: { available: 0, held: 0 }, entries: [] }
  ])

  await claim(t, id)

  const [house] = await t.withIdentity(ana).query(api.ledger.q.myHouseWallets, {})
  expect(house).toMatchObject({ float: { available: 5_000, held: 0 }, earnings: { available: 0, held: 0 } })
  expect(house.entries).toMatchObject([{ amount: 5_000, balanceAfter: 5_000, kind: 'mint', memo: 'GCASH-001' }])
  // Someone who fronts no house has no house balance to read.
  expect(await t.withIdentity(bo).query(api.ledger.q.myHouseWallets, {})).toEqual([])
})
