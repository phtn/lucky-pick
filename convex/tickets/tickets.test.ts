/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { api } from '../_generated/api'
import { auditWallets } from '../ledger/audit'
import { god, member } from '../lib/testIdentities'
import schema from '../schema'
import { nextDrawDate } from './d'

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
  // Both tickets of one purchase are entered in the same draw.
  expect(mine[0].drawDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  expect(mine[1].drawDate).toBe(mine[0].drawDate)
  expect(mine.map((ticket) => ticket.drawTime)).toEqual(['21:00', '21:00'])
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

test('a ticket is entered in the next 9PM Manila draw of its game', () => {
  // 6/42 draws on Tuesday, Thursday and Saturday. 2026-11-15 is a Sunday.
  const days = [2, 4, 6]
  const at = (iso: string) => Date.parse(iso)

  expect(nextDrawDate(days, at('2026-11-15T12:00:00Z'))).toBe('2026-11-17')
  // Already Tuesday in Manila, though still Monday in UTC.
  expect(nextDrawDate(days, at('2026-11-16T16:30:00Z'))).toBe('2026-11-17')
  // A minute before the draw is still tonight's; at 9PM it is the next one's.
  expect(nextDrawDate(days, at('2026-11-17T12:59:00Z'))).toBe('2026-11-17')
  expect(nextDrawDate(days, at('2026-11-17T13:00:00Z'))).toBe('2026-11-19')
  // Saturday night rolls over a week boundary to Tuesday.
  expect(nextDrawDate(days, at('2026-11-21T13:00:00Z'))).toBe('2026-11-24')
  expect(nextDrawDate([], at('2026-11-15T12:00:00Z'))).toBeNull()
})

test('atMyHouses shows a banker the tickets placed at their house, and nobody else', async () => {
  const { t, accountId, anaId } = await setup()
  await buy(t, ana, [[1, 2, 3, 4, 5, 6], [10, 20, 30, 40, 41, 42]])

  const houses = await t.withIdentity(owner).query(api.tickets.q.atMyHouses, {})
  expect(houses.map((h) => [h.accountId, h.name, h.truncated, h.tickets.length])).toEqual([[accountId, 'Casa Uno', false, 2]])
  expect(houses[0].tickets[0]).toMatchObject({ userId: anaId, game: '6/42', cost: 25, status: 'pending', drawTime: '21:00' })
  // A display name and picture, and nothing else about the player.
  expect(Object.keys(houses[0].tickets[0]).sort()).toEqual([
    'betType', 'cost', 'createdAt', 'drawDate', 'drawTime', 'game', 'hits', 'numbers',
    'playerImageUrl', 'playerName', 'prizeWon', 'status', 'ticketId', 'userId'
  ])

  // A player is nobody's banker, a suspended house lists nothing, and a signed-out caller is refused.
  expect(await t.withIdentity(ana).query(api.tickets.q.atMyHouses, {})).toEqual([])
  await t.run((ctx) => ctx.db.patch(accountId, { status: 'suspended' }))
  expect(await t.withIdentity(owner).query(api.tickets.q.atMyHouses, {})).toEqual([])
  await expect(t.query(api.tickets.q.atMyHouses, {})).rejects.toThrow('Unauthorized.')
})

test('recentResults lists the newest draws with what the banker’s house held against each', async () => {
  const { t, accountId } = await setup()
  await buy(t, ana, [[1, 2, 3, 4, 5, 6], [10, 20, 30, 40, 41, 42]])
  const [first, second] = await t.withIdentity(ana).query(api.tickets.q.mine, {})
  const drawDate = first.drawDate!

  const result = (drawId: string, game: 'lotto' | 'mega' | '3d', date: string) => ({
    drawId, game, date, time: null, numbers: [1, 2, 3, 4, 5, 6], rawNumbers: null,
    jackpotCents: 0, winners: 0, importedBy: 'test', importedAt: 0
  })
  await t.run(async (ctx) => {
    await ctx.db.insert('historicalResults', result('lotto:draw', 'lotto', drawDate))
    await ctx.db.insert('historicalResults', result('mega:draw', 'mega', drawDate))
    await ctx.db.insert('historicalResults', result('lotto:old', 'lotto', '2001-01-01'))
    // A digit game sells no tickets, so its results are left out.
    await ctx.db.insert('historicalResults', result('3d:draw', '3d', drawDate))
    for (let day = 1; day <= 12; day++) {
      await ctx.db.insert('historicalResults', result(`mega:${day}`, 'mega', `2000-01-${String(day).padStart(2, '0')}`))
    }
  })

  let results = await t.withIdentity(owner).query(api.tickets.q.recentResults, {})
  expect(results).toHaveLength(10)
  expect(results.slice(0, 3).map((r) => [r.drawId, r.game, r.tickets, r.winners, r.payout, r.status])).toEqual([
    ['lotto:draw', '6/42', 2, 0, 0, 'pending'],
    ['mega:draw', '6/45', 0, 0, 0, 'none'],
    ['lotto:old', '6/42', 0, 0, 0, 'none']
  ])
  expect(results[0]).toMatchObject({ date: drawDate, numbers: [1, 2, 3, 4, 5, 6], sales: 50, winningNumbers: [], partial: false })

  // One ticket still pending keeps the draw pending; once both are settled it reads as settled.
  await t.run((ctx) => ctx.db.patch(first.ticketId, { status: 'won', hits: 6, prizeWon: 500 }))
  results = await t.withIdentity(owner).query(api.tickets.q.recentResults, {})
  expect(results[0]).toMatchObject({ tickets: 2, sales: 50, winners: 1, winningNumbers: [first.numbers], payout: 500, status: 'pending' })
  await t.run((ctx) => ctx.db.patch(second.ticketId, { status: 'lost' }))
  results = await t.withIdentity(owner).query(api.tickets.q.recentResults, {})
  expect(results[0]).toMatchObject({ tickets: 2, winners: 1, payout: 500, status: 'settled' })

  // A player sees the public results with nothing against them, as does the banker of a suspended house.
  expect((await t.withIdentity(ana).query(api.tickets.q.recentResults, {}))[0]).toMatchObject({ drawId: 'lotto:draw', tickets: 0, status: 'none' })
  await t.run((ctx) => ctx.db.patch(accountId, { status: 'suspended' }))
  expect((await t.withIdentity(owner).query(api.tickets.q.recentResults, {}))[0]).toMatchObject({ tickets: 0, status: 'none' })
  await expect(t.query(api.tickets.q.recentResults, {})).rejects.toThrow('Unauthorized.')
})

test('upcomingDraws lists the next draw of each game with what the banker’s house has sold into it', async () => {
  const { t } = await setup()
  await buy(t, ana, [[1, 2, 3, 4, 5, 6], [10, 20, 30, 40, 41, 42]])

  // Sunday 8PM in Manila: the Sunday games draw tonight, the rest later in the week.
  const sunday = Date.parse('2026-11-15T12:00:00Z')
  expect(
    (await t.withIdentity(owner).query(api.tickets.q.upcomingDraws, { now: sunday })).map((d) => [d.game, d.drawDate, d.drawTime])
  ).toEqual([
    ['6/49', '2026-11-15', '21:00'],
    ['6/58', '2026-11-15', '21:00'],
    ['6/45', '2026-11-16', '21:00'],
    ['6/55', '2026-11-16', '21:00'],
    ['6/42', '2026-11-17', '21:00']
  ])
  // An hour later those draws have been held, and the next ones take their place.
  expect((await t.withIdentity(owner).query(api.tickets.q.upcomingDraws, { now: sunday + 3_600_000 }))[0]).toMatchObject({
    game: '6/45', drawDate: '2026-11-16'
  })

  // Asked at the hour the tickets were bought, their draw carries them.
  const now = Math.floor(Date.now() / 3_600_000) * 3_600_000
  const lotto = (who: typeof ana) =>
    t.withIdentity(who).query(api.tickets.q.upcomingDraws, { now }).then((draws) => draws.find((d) => d.game === '6/42'))
  expect(await lotto(owner)).toMatchObject({ tickets: 2, sales: 50, partial: false })
  // A player sees the schedule with nothing against it; a signed-out caller is refused.
  expect(await lotto(ana)).toMatchObject({ tickets: 0, sales: 0 })
  await expect(t.query(api.tickets.q.upcomingDraws, { now })).rejects.toThrow('Unauthorized.')

  // A game switched off sells into no draw.
  await t.withIdentity(god).mutation(api.games.m.setGameEnabled, { gameId: '6/49', enabled: false })
  expect((await t.withIdentity(owner).query(api.tickets.q.upcomingDraws, { now: sunday })).map((d) => d.game)).toEqual([
    '6/58', '6/45', '6/55', '6/42'
  ])
})
