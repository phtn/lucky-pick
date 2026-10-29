/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { api } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import { god } from '../lib/testIdentities'
import schema from '../schema'
import { auditWallets } from './audit'
import { post, reverse, type Leg, type PostInput } from './post'
import { getPartnerWallets, getSystemWallet } from './wallets'

// A root-absolute glob: `../**/*.ts` keys this directory's own files as `./x.ts`, which convex-test cannot place.
const modules = import.meta.glob('/convex/**/*.ts')

const createAccount = async (t: ReturnType<typeof convexTest>, name: string, email: string) =>
  await t.withIdentity(god).mutation(api.accounts.m.create, { name, primaryContact: { name, email } })

/** Two partner accounts and the issuance wallet, which is all a posting needs. */
const setup = async () => {
  const t = convexTest(schema, modules)
  const accountA = await createAccount(t, 'Ana Store', 'ana@example.com')
  const accountB = await createAccount(t, 'Ben Store', 'ben@example.com')
  const wallets = await t.run(async (ctx) => {
    const issuance = await getSystemWallet(ctx, 'issuance')
    const a = await getPartnerWallets(ctx, accountA)
    const b = await getPartnerWallets(ctx, accountB)
    return { issuance: issuance._id, floatA: a.float._id, earningsA: a.earnings._id, floatB: b.float._id }
  })
  return { t, accountA, accountB, ...wallets }
}

const leg = (walletId: Id<'wallets'>, amount: number, bucket: Leg['bucket'] = 'available'): Leg => ({
  walletId,
  bucket,
  amount
})

const input = (idempotencyKey: string, legs: Leg[], overrides: Partial<PostInput> = {}): PostInput => ({
  kind: 'mint',
  idempotencyKey,
  actorTokenIdentifier: god.tokenIdentifier,
  accountId: null,
  ref: null,
  memo: null,
  legs,
  ...overrides
})

const balances = async (t: ReturnType<typeof convexTest>, ids: Id<'wallets'>[]) =>
  await t.run(async (ctx) =>
    Promise.all(
      ids.map(async (id) => {
        const wallet = (await ctx.db.get('wallets', id))!
        return { available: wallet.available, held: wallet.held }
      })
    )
  )

const counts = async (t: ReturnType<typeof convexTest>) =>
  await t.run(async (ctx) => ({
    txns: (await ctx.db.query('ledgerTransactions').take(100)).length,
    entries: (await ctx.db.query('ledgerEntries').take(100)).length
  }))

test('mint then move keeps the ledger balanced', async () => {
  const { t, accountA, issuance, floatA, floatB } = await setup()

  await t.run((ctx) => post(ctx, input('mint:1', [leg(issuance, -500), leg(floatA, 500)], { accountId: accountA })))
  await t.run((ctx) =>
    post(ctx, input('move:1', [leg(floatA, -200), leg(floatB, 200)], { kind: 'allocate', accountId: accountA }))
  )

  expect((await balances(t, [issuance, floatA, floatB])).map((b) => b.available)).toEqual([-500, 300, 200])
  expect(await t.run((ctx) => auditWallets(ctx))).toEqual({ total: 0, mismatched: [] })

  const entries = await t.run(async (ctx) => await ctx.db.query('ledgerEntries').take(10))
  expect(entries.map((e) => [e.walletId, e.bucket, e.amount, e.balanceAfter])).toEqual([
    [issuance, 'available', -500, -500],
    [floatA, 'available', 500, 500],
    [floatA, 'available', -200, 300],
    [floatB, 'available', 200, 200]
  ])
})

test('replaying the same key returns the same txn', async () => {
  const { t, issuance, floatA } = await setup()
  const legs = [leg(issuance, -500), leg(floatA, 500)]

  const first = await t.run((ctx) => post(ctx, input('mint:1', legs)))
  const second = await t.run((ctx) => post(ctx, input('mint:1', legs)))

  expect(first.replayed).toBe(false)
  expect(second).toEqual({ txnId: first.txnId, replayed: true })
  expect(await counts(t)).toEqual({ txns: 1, entries: 2 })
  expect((await balances(t, [floatA]))[0].available).toBe(500)
})

test('same key with different legs throws', async () => {
  const { t, issuance, floatA } = await setup()

  await t.run((ctx) => post(ctx, input('mint:1', [leg(issuance, -500), leg(floatA, 500)])))
  await expect(
    t.run((ctx) => post(ctx, input('mint:1', [leg(issuance, -600), leg(floatA, 600)])))
  ).rejects.toThrow('This request was already recorded with different details.')
  expect((await balances(t, [floatA]))[0].available).toBe(500)
})

test('rejects non-integer, zero and unbalanced legs', async () => {
  const { t, issuance, floatA } = await setup()
  const seventeen = [leg(issuance, -16), ...Array.from({ length: 16 }, () => leg(floatA, 1))]

  const cases: [string, Leg[], string][] = [
    ['fraction', [leg(issuance, -1.5), leg(floatA, 1.5)], 'Every leg must move a whole, non-zero number of credits.'],
    ['zero', [leg(issuance, 0), leg(floatA, 0)], 'Every leg must move a whole, non-zero number of credits.'],
    ['nan', [leg(issuance, NaN), leg(floatA, NaN)], 'Every leg must move a whole, non-zero number of credits.'],
    ['unbalanced', [leg(issuance, -500), leg(floatA, 501)], 'The legs of a transaction must add up to zero.'],
    ['empty', [], 'A transaction needs between 1 and 16 legs.'],
    ['seventeen', seventeen, 'A transaction needs between 1 and 16 legs.']
  ]
  for (const [key, legs, message] of cases) {
    await expect(t.run((ctx) => post(ctx, input(key, legs))), key).rejects.toThrow(message)
  }
  await expect(t.run((ctx) => post(ctx, input('', [leg(issuance, -1), leg(floatA, 1)])))).rejects.toThrow(
    'An idempotency key must be 1 to 200 characters.'
  )

  expect(await counts(t)).toEqual({ txns: 0, entries: 0 })
  expect(await balances(t, [issuance, floatA])).toEqual([
    { available: 0, held: 0 },
    { available: 0, held: 0 }
  ])
})

test('rejects overdraft on a floor-0 wallet', async () => {
  const { t, issuance, floatA, floatB } = await setup()

  await t.run((ctx) => post(ctx, input('mint:1', [leg(issuance, -300), leg(floatA, 300)])))
  await expect(
    t.run((ctx) => post(ctx, input('move:1', [leg(floatA, -301), leg(floatB, 301)], { kind: 'allocate' })))
  ).rejects.toThrow('This wallet holds 300 credits, so it cannot give up 301.')

  expect(await counts(t)).toEqual({ txns: 1, entries: 2 })
  expect((await balances(t, [floatA, floatB])).map((b) => b.available)).toEqual([300, 0])
})

test('lets earnings go negative', async () => {
  const { t, issuance, earningsA } = await setup()

  await t.run((ctx) => post(ctx, input('prize:1', [leg(earningsA, -50), leg(issuance, 50)], { kind: 'prize' })))

  expect((await balances(t, [earningsA]))[0].available).toBe(-50)
  expect(await t.run((ctx) => auditWallets(ctx))).toEqual({ total: 0, mismatched: [] })
})

test('checks held on the final state', async () => {
  const { t, issuance, earningsA, floatB } = await setup()

  await t.run((ctx) => post(ctx, input('mint:1', [leg(issuance, -100), leg(floatB, 100)])))
  await t.run((ctx) =>
    post(ctx, input('hold:1', [leg(floatB, -25), leg(floatB, 25, 'held')], { kind: 'ticketHold' }))
  )
  // A win settles the stake and the prize together.
  await t.run((ctx) =>
    post(
      ctx,
      input(
        'settle:1',
        [leg(floatB, -25, 'held'), leg(earningsA, 25), leg(earningsA, -100), leg(floatB, 100)],
        { kind: 'ticketCapture' }
      )
    )
  )
  expect(await balances(t, [floatB, earningsA])).toEqual([
    { available: 175, held: 0 },
    { available: -75, held: 0 }
  ])

  // Held dips below zero mid-transaction and recovers by the last leg: only the final state counts.
  await t.run((ctx) =>
    post(
      ctx,
      input(
        'shuffle:1',
        [leg(floatB, -10, 'held'), leg(floatB, 10), leg(floatB, -10), leg(floatB, 10, 'held')],
        { kind: 'ticketRelease' }
      )
    )
  )
  const shuffle = await t.run(async (ctx) => {
    const txn = (await ctx.db
      .query('ledgerTransactions')
      .withIndex('by_idempotencyKey', (q) => q.eq('idempotencyKey', 'shuffle:1'))
      .unique())!
    return await ctx.db
      .query('ledgerEntries')
      .withIndex('by_txnId', (q) => q.eq('txnId', txn._id))
      .take(16)
  })
  expect(shuffle.map((e) => e.balanceAfter)).toEqual([-10, 185, 175, 0])
  expect(await t.run((ctx) => auditWallets(ctx))).toEqual({ total: 0, mismatched: [] })

  // A held bucket that ends below zero is still refused.
  await expect(
    t.run((ctx) => post(ctx, input('release:1', [leg(floatB, -1, 'held'), leg(floatB, 1)], { kind: 'ticketRelease' })))
  ).rejects.toThrow('This wallet has 0 credits on hold, so it cannot release 1.')
})

test('rejects a frozen wallet', async () => {
  const { t, issuance, floatA } = await setup()

  await t.run((ctx) => ctx.db.patch('wallets', floatA, { status: 'frozen' }))
  await expect(t.run((ctx) => post(ctx, input('mint:1', [leg(issuance, -100), leg(floatA, 100)])))).rejects.toThrow(
    'This wallet is frozen.'
  )
  expect(await counts(t)).toEqual({ txns: 0, entries: 0 })
})

test('reverse restores balances and refuses to reverse a reversal', async () => {
  const { t, accountA, issuance, floatA } = await setup()

  const { txnId } = await t.run((ctx) =>
    post(ctx, input('mint:1', [leg(issuance, -500), leg(floatA, 500)], { accountId: accountA }))
  )
  const reversal = await t.run((ctx) =>
    reverse(ctx, { txnId, actorTokenIdentifier: god.tokenIdentifier, memo: 'Wrong amount' })
  )

  expect(reversal.replayed).toBe(false)
  expect(await balances(t, [issuance, floatA])).toEqual([
    { available: 0, held: 0 },
    { available: 0, held: 0 }
  ])
  const txn = await t.run(async (ctx) => (await ctx.db.get('ledgerTransactions', reversal.txnId))!)
  expect(txn).toMatchObject({
    kind: 'reversal',
    idempotencyKey: `reversal:${txnId}`,
    reversesTxnId: txnId,
    accountId: accountA,
    ref: null,
    memo: 'Wrong amount'
  })
  expect(await t.run((ctx) => auditWallets(ctx))).toEqual({ total: 0, mismatched: [] })

  // Reversing again replays rather than reversing twice.
  expect(
    await t.run((ctx) => reverse(ctx, { txnId, actorTokenIdentifier: god.tokenIdentifier, memo: 'Again' }))
  ).toEqual({ txnId: reversal.txnId, replayed: true })

  await expect(
    t.run((ctx) => reverse(ctx, { txnId: reversal.txnId, actorTokenIdentifier: god.tokenIdentifier, memo: 'Undo' }))
  ).rejects.toThrow('A reversal cannot be reversed.')
})
