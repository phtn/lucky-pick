/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, expect, test, vi } from 'vitest'
import { GAMES } from '../../src/lib/games'
import { api, internal } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import { auditWallets } from '../ledger/audit'
import { god, member } from '../lib/testIdentities'
import schema from '../schema'
import { SETTLE_BATCH, ticketPrize } from './settle'

const modules = import.meta.glob('/convex/**/*.ts')

const owner = member('owner', 'owner@example.com')
const ana = member('ana', 'ana@example.com')
const importer = { issuer: 'https://securetoken.google.com/lucky-pick-345', subject: 'importer' }

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** An active house, Ana playing there with `credits`. */
const setup = async (credits = 1_000) => {
  const t = convexTest(schema, modules)
  const accountId = await t.withIdentity(god).mutation(api.accounts.m.create, {
    name: 'Casa Uno',
    initialCredits: 50_000,
    primaryContact: { name: 'Owner', email: 'owner@example.com' }
  })
  await t.run((ctx) => ctx.db.patch(accountId, { status: 'active' }))
  for (const who of [owner, ana]) await t.withIdentity(who).mutation(api.users.m.ensureCurrent, {})
  await t.withIdentity(ana).mutation(api.users.m.selectBanker, { accountId })
  const anaId = (await t.run(async (ctx) => (await ctx.db.query('users').collect()).find((u) => u.subject === 'ana')))!._id
  await t
    .withIdentity(owner)
    .mutation(api.ledger.m.allocateToPlayer, { accountId, userId: anaId, amount: credits, requestId: 'seed-0000001' })
  return { t, accountId, anaId }
}
type T = Awaited<ReturnType<typeof setup>>['t']

let request = 0
const buy = (t: T, picks: number[][], betType: 1 | 2 | 3 | 4 | 5 | 6 = 6) =>
  t.withIdentity(ana).mutation(api.tickets.m.buy, {
    game: '6/42', betType, cost: 25, picks, requestId: `req-${String(++request).padStart(8, '0')}`
  })

const balances = (t: T, accountId: Id<'accounts'>, anaId: Id<'users'>) =>
  t.run(async (ctx) => {
    const wallets = await ctx.db.query('wallets').collect()
    const player = wallets.find((w) => w.accountId === accountId && w.userId === anaId)!
    const earnings = wallets.find((w) => w.accountId === accountId && w.kind === 'partnerEarnings')
    return { available: player.available, held: player.held, earnings: earnings?.available ?? 0 }
  })

/** `2099-11-20` → `11/20/2099`, the form a pasted PCSO row carries. */
const pcsoDate = (date: string) => {
  const [y, m, d] = date.split('-')
  return `${Number(m)}/${Number(d)}/${y}`
}
const importResult = (t: T, date: string, numbers: string, jackpot = '10,000.00') =>
  t.withIdentity(importer).mutation(api.resultsImport.save, { text: `Lotto 6/42\t${numbers}\t${pcsoDate(date)}\t${jackpot}\t0` })

const runScheduled = async (t: T) => {
  await t.finishAllScheduledFunctions(vi.runAllTimers)
}

test('prize rules match the board: jackpot tiers for six-number tickets, all-or-nothing for pick bets', () => {
  const rules = GAMES['6/42']
  const drawn = [1, 2, 3, 4, 5, 6]
  const six = (numbers: number[]) => ticketPrize({ betType: 6, numbers, cost: 25 }, drawn, rules, 10_000)
  expect(six([1, 2, 3, 4, 5, 6])).toEqual({ hits: 6, prize: 10_000 })
  expect(six([1, 2, 3, 4, 5, 40])).toEqual({ hits: 5, prize: rules.secondary[5] })
  expect(six([1, 2, 3, 4, 30, 40])).toEqual({ hits: 4, prize: rules.secondary[4] })
  expect(six([1, 2, 3, 20, 30, 40])).toEqual({ hits: 3, prize: rules.secondary[3] })
  expect(six([1, 2, 10, 20, 30, 40])).toEqual({ hits: 2, prize: 0 })

  expect(ticketPrize({ betType: 2, numbers: [1, 6], cost: 25 }, drawn, rules, 10_000)).toEqual({ hits: 2, prize: Math.round(rules.payout[2] * 25) })
  expect(ticketPrize({ betType: 2, numbers: [1, 7], cost: 25 }, drawn, rules, 10_000)).toEqual({ hits: 1, prize: 0 })
})

test('a new result settles every ticket in its draw, moving stakes and prizes through the ledger', async () => {
  vi.useFakeTimers()
  const { t, accountId, anaId } = await setup()
  await buy(t, [[1, 2, 3, 4, 5, 6], [1, 2, 3, 20, 30, 40], [10, 20, 30, 40, 41, 42]])
  await buy(t, [[1, 2]], 2)
  const tickets = await t.withIdentity(ana).query(api.tickets.q.mine, {})
  const drawDate = tickets[0]!.drawDate!
  expect(await balances(t, accountId, anaId)).toEqual({ available: 900, held: 100, earnings: 0 })

  // A result for another day touches nothing.
  await importResult(t, '2000-01-01', '01-02-03-04-05-06')
  await runScheduled(t)
  expect((await t.withIdentity(ana).query(api.tickets.q.mine, {})).every((ticket) => ticket.status === 'pending')).toBe(true)

  await importResult(t, drawDate, '06-05-04-03-02-01', '10,000.00')
  await runScheduled(t)

  const pick2 = Math.round(GAMES['6/42'].payout[2] * 25)
  const consolation = GAMES['6/42'].secondary[3]
  const settled = new Map((await t.withIdentity(ana).query(api.tickets.q.mine, {})).map((ticket) => [ticket.numbers.join('-'), ticket]))
  expect(settled.get('1-2-3-4-5-6')).toMatchObject({ status: 'won', hits: 6, prizeWon: 10_000 })
  expect(settled.get('1-2-3-20-30-40')).toMatchObject({ status: 'won', hits: 3, prizeWon: consolation })
  expect(settled.get('10-20-30-40-41-42')).toMatchObject({ status: 'lost', hits: 0, prizeWon: null })
  expect(settled.get('1-2')).toMatchObject({ status: 'won', hits: 2, prizeWon: pick2 })

  const prizes = 10_000 + consolation + pick2
  expect(await balances(t, accountId, anaId)).toEqual({ available: 900 + prizes, held: 0, earnings: 100 - prizes })
  expect(await t.run((ctx) => auditWallets(ctx))).toEqual({ total: 0, mismatched: [] })

  // Ana hears once about all three wins, with their prizes together.
  expect(await t.withIdentity(ana).query(api.notifications.q.mine, {})).toEqual([
    expect.objectContaining({
      kind: 'ticket-won', accountId, accountName: 'Casa Uno', amount: prizes, readAt: null,
      draw: { game: '6/42', drawDate, tickets: 3 }
    })
  ])

  // Settling the same draw again changes nothing.
  expect(await t.mutation(internal.tickets.settle.settleDraw, { game: '6/42', drawDate })).toMatchObject({ settled: 0 })
  expect(await balances(t, accountId, anaId)).toEqual({ available: 900 + prizes, held: 0, earnings: 100 - prizes })
  expect(await t.withIdentity(ana).query(api.notifications.q.mine, {})).toHaveLength(1)
})

test('a large draw settles in batches, and a frozen wallet is passed over until its draw is scheduled again', async () => {
  vi.useFakeTimers()
  const { t, accountId, anaId } = await setup(5_000)
  const count = SETTLE_BATCH + 10
  await buy(t, Array.from({ length: count }, () => [10, 20, 30, 40, 41, 42]))
  const drawDate = (await t.withIdentity(ana).query(api.tickets.q.mine, {}))[0]!.drawDate!

  const walletId = await t.run(async (ctx) => (await ctx.db.query('wallets').collect()).find((w) => w.userId === anaId)!._id)
  await t.run((ctx) => ctx.db.patch(walletId, { status: 'frozen' }))
  await importResult(t, drawDate, '01-02-03-04-05-06')
  await runScheduled(t)
  expect((await t.withIdentity(ana).query(api.tickets.q.mine, {})).every((ticket) => ticket.status === 'pending')).toBe(true)

  await t.run((ctx) => ctx.db.patch(walletId, { status: 'active' }))
  await t.mutation(internal.tickets.settle.settleDraw, { game: '6/42', drawDate })
  await runScheduled(t)
  const mine = await t.withIdentity(ana).query(api.tickets.q.mine, {})
  expect(mine).toHaveLength(count)
  expect(mine.every((ticket) => ticket.status === 'lost')).toBe(true)
  // Nobody won, so nobody is notified.
  expect(await t.withIdentity(ana).query(api.notifications.q.mine, {})).toEqual([])
  expect(await balances(t, accountId, anaId)).toEqual({ available: 5_000 - count * 25, held: 0, earnings: count * 25 })
})
