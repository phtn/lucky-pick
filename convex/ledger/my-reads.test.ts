/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { api } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import { god, member } from '../lib/testIdentities'
import schema from '../schema'
import { post } from './post'
import { getSystemWallet } from './wallets'

// A root-absolute glob: `../**/*.ts` keys this directory's own files as `./x.ts`, which convex-test cannot place.
const modules = import.meta.glob('/convex/**/*.ts')

const ana = member('ana', 'ana@example.com')
const ben = member('ben', 'ben@example.com')
const cat = member('cat', 'cat@example.com')

/** Ana and Ben have user rows; Cat is signed in but has never been seen, so she has no row. */
const setup = async () => {
  const t = convexTest(schema, modules)
  for (const who of [ana, ben]) await t.withIdentity(who).mutation(api.users.m.ensureCurrent, {})
  const userId = async (who: typeof ana) => (await t.withIdentity(who).query(api.users.q.current, {}))!._id
  return { t, anaId: await userId(ana), benId: await userId(ben) }
}

type Harness = Awaited<ReturnType<typeof setup>>['t']

const insertUserWallet = (t: Harness, userId: Id<'users'>) =>
  t.run((ctx) =>
    ctx.db.insert('wallets', {
      kind: 'user',
      accountId: null,
      userId,
      systemKey: null,
      available: 0,
      held: 0,
      floor: 0,
      status: 'active',
      createdAt: 1,
      updatedAt: 1
    })
  )

/** Credits a user wallet from issuance, one transaction per amount, oldest first. */
const credit = (t: Harness, walletId: Id<'wallets'>, amounts: number[], memoFor: (n: number) => string | null = () => null) =>
  t.run(async (ctx) => {
    const issuance = await getSystemWallet(ctx, 'issuance')
    for (const [i, n] of amounts.entries()) {
      await post(ctx, {
        kind: 'mint',
        idempotencyKey: `my-reads:${walletId}:${i}`,
        actorTokenIdentifier: god.tokenIdentifier,
        accountId: null,
        ref: null,
        memo: memoFor(n),
        legs: [
          { walletId: issuance._id, bucket: 'available', amount: -n },
          { walletId, bucket: 'available', amount: n }
        ]
      })
    }
  })

test('myWallet is null when signed out and null before a wallet exists', async () => {
  const { t } = await setup()

  expect(await t.query(api.ledger.q.myWallet, {})).toBeNull()
  // Ana has a user row but has never been allocated credits.
  expect(await t.withIdentity(ana).query(api.ledger.q.myWallet, {})).toBeNull()
  // Cat is signed in with no user row at all.
  expect(await t.withIdentity(cat).query(api.ledger.q.myWallet, {})).toBeNull()
})

test("myWallet returns the caller's own user wallet once allocated", async () => {
  const { t, anaId } = await setup()
  const walletId = await insertUserWallet(t, anaId)
  await credit(t, walletId, [40])

  const wallet = await t.withIdentity(ana).query(api.ledger.q.myWallet, {})
  expect(wallet).toMatchObject({ _id: walletId, kind: 'user', userId: anaId, available: 40 })
})

test("myWallet never returns another user's wallet", async () => {
  const { t, anaId, benId } = await setup()
  const anaWallet = await insertUserWallet(t, anaId)
  await credit(t, anaWallet, [40])

  // Ben has no wallet of his own, and Ana's is not his to see.
  expect(await t.withIdentity(ben).query(api.ledger.q.myWallet, {})).toBeNull()

  const benWallet = await insertUserWallet(t, benId)
  const seen = await t.withIdentity(ben).query(api.ledger.q.myWallet, {})
  expect(seen?._id).toBe(benWallet)
  expect(seen?._id).not.toBe(anaWallet)
  expect((await t.withIdentity(ana).query(api.ledger.q.myWallet, {}))?._id).toBe(anaWallet)
})

test('myLedgerHistory is empty when signed out or without a wallet', async () => {
  const { t, benId } = await setup()
  // Someone else's wallet carries entries, so an empty result is not just an empty ledger.
  const benWallet = await insertUserWallet(t, benId)
  await credit(t, benWallet, [10, 20])
  expect(await t.withIdentity(ben).query(api.ledger.q.myLedgerHistory, {})).toHaveLength(2)

  expect(await t.query(api.ledger.q.myLedgerHistory, {})).toEqual([])
  expect(await t.withIdentity(ana).query(api.ledger.q.myLedgerHistory, {})).toEqual([])
  expect(await t.withIdentity(cat).query(api.ledger.q.myLedgerHistory, {})).toEqual([])
})

test("myLedgerHistory returns the caller's entries newest first with kind and memo", async () => {
  const { t, anaId, benId } = await setup()
  const anaWallet = await insertUserWallet(t, anaId)
  const benWallet = await insertUserWallet(t, benId)
  await credit(t, anaWallet, [10, 20, 30], (n) => (n === 20 ? null : `grant ${n}`))
  await credit(t, benWallet, [999], () => 'not ana')

  const history = await t.withIdentity(ana).query(api.ledger.q.myLedgerHistory, {})
  expect(history.map((e) => [e.amount, e.balanceAfter, e.bucket, e.kind, e.memo])).toEqual([
    [30, 60, 'available', 'mint', 'grant 30'],
    [20, 30, 'available', 'mint', null],
    [10, 10, 'available', 'mint', 'grant 10']
  ])
  for (const entry of history) {
    expect(Object.keys(entry).sort()).toEqual(['_id', 'amount', 'balanceAfter', 'bucket', 'createdAt', 'kind', 'memo'])
  }
  expect(history.map((e) => e.memo)).not.toContain('not ana')
})

test('myLedgerHistory clamps limit and caps at the history limit', async () => {
  const { t, anaId } = await setup()
  const walletId = await insertUserWallet(t, anaId)
  // 25 entries, so the cap of 20 is the thing that bounds the result.
  await credit(t, walletId, Array.from({ length: 25 }, (_, i) => i + 1))
  const read = (limit?: number) => t.withIdentity(ana).query(api.ledger.q.myLedgerHistory, limit === undefined ? {} : { limit })

  expect(await read()).toHaveLength(20)
  expect(await read(500)).toHaveLength(20)
  expect(await read(5)).toHaveLength(5)
  expect(await read(0)).toHaveLength(1)
  expect(await read(-3)).toHaveLength(1)
  expect(await read(2.9)).toHaveLength(2)
  // Newest first: the limit trims the old end, not the new one.
  expect((await read(3)).map((e) => e.amount)).toEqual([25, 24, 23])
})
