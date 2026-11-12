/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { api } from '../_generated/api'
import { auditWallets } from '../ledger/audit'
import { god, member } from '../lib/testIdentities'
import schema from '../schema'

// A root-absolute glob: `../**/*.ts` keys this directory's own files as `./x.ts`, which convex-test cannot place.
const modules = import.meta.glob('/convex/**/*.ts')

const owner = member('owner', 'owner@example.com')
const ana = member('ana', 'ana@example.com')
const ben = member('ben', 'ben@example.com')

/** An active house with 5,000 in its float, and Ana playing there with 1,000. */
const setup = async () => {
  const t = convexTest(schema, modules)
  const accountId = await t.withIdentity(god).mutation(api.accounts.m.create, {
    name: 'Casa Uno',
    initialCredits: 5_000,
    primaryContact: { name: 'Owner', email: 'owner@example.com' }
  })
  await t.run((ctx) => ctx.db.patch(accountId, { status: 'active' }))
  for (const who of [owner, ana, ben]) await t.withIdentity(who).mutation(api.users.m.ensureCurrent, {})
  await t.withIdentity(ana).mutation(api.users.m.selectBanker, { accountId })
  const anaId = (await t.run(async (ctx) => (await ctx.db.query('users').collect()).find((u) => u.subject === 'ana')))!._id
  await t
    .withIdentity(owner)
    .mutation(api.ledger.m.allocateToPlayer, { accountId, userId: anaId, amount: 1_000, requestId: 'seed-0000001' })
  return { t, accountId, anaId }
}

type T = Awaited<ReturnType<typeof setup>>['t']
const buy = (t: T, who: typeof ana, picks: number[][], extra: Partial<{ cost: number; requestId: string; betType: 1 | 2 | 3 | 4 | 5 | 6 }> = {}) =>
  t.withIdentity(who).mutation(api.tickets.m.buy, {
    game: '6/42',
    betType: 6,
    cost: 25,
    picks,
    requestId: 'req-00000001',
    ...extra
  })

const walletOf = (t: T, accountId: string, userId: string) =>
  t.run(async (ctx) => {
    const wallet = (await ctx.db.query('wallets').collect()).find((w) => w.accountId === accountId && w.userId === userId)!
    return { available: wallet.available, held: wallet.held }
  })

test('buying tickets holds the stake and stores each ticket as pending', async () => {
  const { t, accountId, anaId } = await setup()

  expect(await buy(t, ana, [[6, 5, 4, 3, 2, 1], [10, 20, 30, 40, 41, 42]])).toEqual({ bought: 2, spent: 50 })

  expect(await walletOf(t, accountId, anaId)).toEqual({ available: 950, held: 50 })
  const mine = await t.withIdentity(ana).query(api.tickets.q.mine, {})
  expect(mine).toHaveLength(2)
  expect(mine.map((ticket) => ticket.numbers).sort((a, b) => a[0] - b[0])).toEqual([
    [1, 2, 3, 4, 5, 6],
    [10, 20, 30, 40, 41, 42]
  ])
  expect(mine[0]).toMatchObject({ accountId, game: '6/42', betType: 6, cost: 25, status: 'pending', hits: 0, prizeWon: null })
  expect(await t.run((ctx) => auditWallets(ctx))).toEqual({ total: 0, mismatched: [] })
  // Nobody else sees them.
  expect(await t.withIdentity(ben).query(api.tickets.q.mine, {})).toEqual([])
})

test('a retried purchase replays instead of buying twice', async () => {
  const { t, accountId, anaId } = await setup()
  await buy(t, ana, [[1, 2, 3, 4, 5, 6]])
  await buy(t, ana, [[1, 2, 3, 4, 5, 6]])

  expect(await walletOf(t, accountId, anaId)).toEqual({ available: 975, held: 25 })
  expect(await t.withIdentity(ana).query(api.tickets.q.mine, {})).toHaveLength(1)
})

test('a purchase is refused when it costs more than the player holds', async () => {
  const { t, accountId, anaId } = await setup()
  const picks = Array.from({ length: 41 }, () => [1, 2, 3, 4, 5, 6])

  await expect(buy(t, ana, picks)).rejects.toThrow('You have 1,000 credits at Casa Uno, and this costs 1,025.')
  expect(await walletOf(t, accountId, anaId)).toEqual({ available: 1_000, held: 0 })
  expect(await t.withIdentity(ana).query(api.tickets.q.mine, {})).toEqual([])
})

test('picks, price and house are all checked on the server', async () => {
  const { t, accountId } = await setup()

  await expect(buy(t, ana, [[1, 2, 3, 4, 5]])).rejects.toThrow('Each ticket needs 6 different numbers from 1 to 42.')
  await expect(buy(t, ana, [[1, 1, 3, 4, 5, 6]])).rejects.toThrow('Each ticket needs 6 different numbers')
  await expect(buy(t, ana, [[1, 2, 3, 4, 5, 43]])).rejects.toThrow('Each ticket needs 6 different numbers')
  await expect(buy(t, ana, [[1, 2, 3, 4, 5, 6]], { cost: 1 })).rejects.toThrow('That stake is not offered for this bet.')
  await expect(buy(t, ana, [])).rejects.toThrow('Buy between 1 and 200 tickets at a time.')
  // Ben has chosen no banker; a signed-out caller is nobody.
  await expect(buy(t, ben, [[1, 2, 3, 4, 5, 6]])).rejects.toThrow('Choose a banker to play against first.')
  await expect(
    t.mutation(api.tickets.m.buy, { game: '6/42', betType: 6, cost: 25, picks: [[1, 2, 3, 4, 5, 6]], requestId: 'req-00000001' })
  ).rejects.toThrow('Sign in to buy tickets.')

  await t.run((ctx) => ctx.db.patch(accountId, { status: 'suspended' }))
  await expect(buy(t, ana, [[1, 2, 3, 4, 5, 6]])).rejects.toThrow('Your banker is not taking bets right now.')
})

test('a game or bet type the house switched off cannot be bought', async () => {
  const { t } = await setup()
  await t.withIdentity(god).mutation(api.games.m.updateBetType, { gameId: '6/42', betType: 3, enabled: false })

  await expect(buy(t, ana, [[1, 2, 3]], { betType: 3 })).rejects.toThrow('That game is not on sale right now.')
  expect(await buy(t, ana, [[1, 2]], { betType: 2, requestId: 'req-00000002' })).toEqual({ bought: 1, spent: 25 })
})
