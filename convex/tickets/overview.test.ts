/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { api } from '../_generated/api'
import { god, member, staff } from '../lib/testIdentities'
import schema from '../schema'

const modules = import.meta.glob('/convex/**/*.ts')

const ana = member('ana', 'ana@example.com')
const ben = member('ben', 'ben@example.com')

/** Two active houses: Ana plays at Casa Uno, Ben at Casa Dos. */
const setup = async () => {
  const t = convexTest(schema, modules)
  const house = async (name: string, email: string) => {
    const accountId = await t.withIdentity(god).mutation(api.accounts.m.create, {
      name, initialCredits: 5_000, primaryContact: { name, email }
    })
    await t.run((ctx) => ctx.db.patch(accountId, { status: 'active' }))
    return accountId
  }
  const uno = await house('Casa Uno', 'uno@example.com')
  const dos = await house('Casa Dos', 'dos@example.com')
  for (const [who, accountId] of [[ana, uno], [ben, dos]] as const) {
    await t.withIdentity(who).mutation(api.users.m.ensureCurrent, {})
    await t.withIdentity(who).mutation(api.users.m.selectBanker, { accountId })
  }
  const users = await t.run((ctx) => ctx.db.query('users').collect())
  const idOf = (subject: string) => users.find((u) => u.subject === subject)!._id
  for (const [contact, accountId, subject] of [[member('uno', 'uno@example.com'), uno, 'ana'], [member('dos', 'dos@example.com'), dos, 'ben']] as const) {
    await t.withIdentity(contact).mutation(api.users.m.ensureCurrent, {})
    await t.withIdentity(contact).mutation(api.ledger.m.allocateToPlayer, { accountId, userId: idOf(subject), amount: 1_000, requestId: `seed-${subject}-0001` })
  }
  return { t, uno, dos }
}

let request = 0
const buy = (t: Awaited<ReturnType<typeof setup>>['t'], who: typeof ana, count: number) =>
  t.withIdentity(who).mutation(api.tickets.m.buy, {
    game: '6/42', betType: 6, cost: 25,
    picks: Array.from({ length: count }, (_, i) => [1, 2, 3, 4, 5, 6 + i]),
    requestId: `req-${String(++request).padStart(8, '0')}`
  })

test('forAsgard reports each account’s sales and outcomes, and the upcoming draws split by account', async () => {
  const { t, uno, dos } = await setup()
  await buy(t, ana, 3)
  await buy(t, ben, 1)

  // One of Ana's tickets has already settled as a win, one as a loss.
  const tickets = await t.run((ctx) => ctx.db.query('tickets').collect())
  const anas = tickets.filter((ticket) => ticket.accountId === uno)
  await t.run(async (ctx) => {
    await ctx.db.patch(anas[0]!._id, { status: 'won', hits: 3, prizeWon: 100 })
    await ctx.db.patch(anas[1]!._id, { status: 'lost' })
  })

  const now = Date.now()
  const overview = await t.withIdentity(god).query(api.tickets.overview.forAsgard, { now })
  expect(overview.totals).toEqual({ tickets: 4, sales: 100, won: 1, lost: 1, pending: 2, payout: 100 })

  // Busiest account first.
  expect(overview.accounts.map((a) => [a.name, a.tickets, a.sales, a.won, a.lost, a.pending, a.payout, a.upcoming])).toEqual([
    ['Casa Uno', 3, 75, 1, 1, 1, 100, { tickets: 1, sales: 25 }],
    ['Casa Dos', 1, 25, 0, 0, 1, 0, { tickets: 1, sales: 25 }]
  ])

  const lotto = overview.upcoming.find((draw) => draw.game === '6/42')!
  expect(lotto).toMatchObject({ drawDate: tickets[0]!.drawDate, tickets: 2, sales: 50, partial: false })
  expect(lotto.byAccount.map((share) => [share.accountId, share.tickets, share.sales]).sort()).toEqual(
    [[uno, 1, 25], [dos, 1, 25]].sort()
  )
  // Every game on sale is listed, even with nothing sold into it yet.
  expect(overview.upcoming.map((draw) => draw.game).sort()).toEqual(['6/42', '6/45', '6/49', '6/55', '6/58'])

  // Admin staff can read it; bankers, players and anonymous callers cannot.
  expect((await t.withIdentity(staff).query(api.tickets.overview.forAsgard, { now })).totals.tickets).toBe(4)
  for (const who of [ana, member('uno', 'uno@example.com')]) {
    await expect(t.withIdentity(who).query(api.tickets.overview.forAsgard, { now })).rejects.toThrow('Unauthorized.')
  }
  await expect(t.query(api.tickets.overview.forAsgard, { now })).rejects.toThrow('Unauthorized.')

  // Tickets bought before the window are left out.
  const later = now + 31 * 24 * 60 * 60 * 1000
  expect((await t.withIdentity(god).query(api.tickets.overview.forAsgard, { now: later })).totals.tickets).toBe(0)
})
