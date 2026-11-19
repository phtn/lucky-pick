import { ConvexError, v } from 'convex/values'
import { GAMES } from '../../src/lib/games'
import type { Doc, Id } from '../_generated/dataModel'
import { query } from '../_generated/server'
import { accountStatusSchema } from '../accounts/d'
import { gameIdSchema } from '../games/d'
import { requireStaffIdentity } from '../games/helpers'
import { DRAW_TIME, RESULT_GAME_IDS, nextDrawDate } from './d'

/** How far back the console's sales and outcomes reach. */
export const OVERVIEW_WINDOW_DAYS = 30
/** Accounts the overview reads, newest first. */
export const OVERVIEW_ACCOUNTS_LIMIT = 100
/** Tickets read per account in the window, and per upcoming draw; past either the figures carry a `+`. */
export const OVERVIEW_TICKETS_LIMIT = 2_000

const DAY_MS = 24 * 60 * 60 * 1000

const salesFields = {
  tickets: v.number(),
  /** What those tickets cost, in whole credits. */
  sales: v.number()
}

const accountRef = { accountId: v.id('accounts'), name: v.string() }

/**
 * The console's business overview: what every account has sold and paid out
 * over the last `OVERVIEW_WINDOW_DAYS`, and the next draw of every game on sale
 * with what each account has sold into it so far. Staff only.
 *
 * `now` is an argument because a query must not read the clock: the caller
 * sends it, which also decides which draw is "next".
 */
export const forAsgard = query({
  args: { now: v.number() },
  returns: v.object({
    windowDays: v.number(),
    totals: v.object({
      ...salesFields,
      won: v.number(),
      lost: v.number(),
      pending: v.number(),
      payout: v.number()
    }),
    accounts: v.array(
      v.object({
        ...accountRef,
        slug: v.string(),
        status: accountStatusSchema,
        ...salesFields,
        won: v.number(),
        lost: v.number(),
        pending: v.number(),
        /** Prizes paid on this account's tickets, in whole credits. */
        payout: v.number(),
        /** Sold into the upcoming draws, across every game. */
        upcoming: v.object(salesFields),
        partial: v.boolean()
      })
    ),
    upcoming: v.array(
      v.object({
        game: gameIdSchema,
        name: v.string(),
        drawDate: v.string(),
        drawTime: v.string(),
        ...salesFields,
        byAccount: v.array(v.object({ ...accountRef, ...salesFields })),
        partial: v.boolean()
      })
    )
  }),
  handler: async (ctx, { now }) => {
    await requireStaffIdentity(ctx)
    if (!Number.isFinite(now)) throw new ConvexError('This request is malformed. Reload and try again.')

    const accounts = await ctx.db.query('accounts').withIndex('by_createdAt').order('desc').take(OVERVIEW_ACCOUNTS_LIMIT)
    const nameOf = new Map<Id<'accounts'>, string>(accounts.map((account) => [account._id, account.name]))
    const since = now - OVERVIEW_WINDOW_DAYS * DAY_MS

    // The next draw of every game on sale, read across every account at once.
    const upcoming = []
    const upcomingByAccount = new Map<Id<'accounts'>, { tickets: number; sales: number }>()
    for (const game of Object.values(RESULT_GAME_IDS)) {
      const row = await ctx.db
        .query('games')
        .withIndex('by_gameId', (q) => q.eq('gameId', game))
        .unique()
      if (row?.enabled === false) continue
      const drawDate = nextDrawDate(row?.drawDays ?? GAMES[game].drawDays, now)
      if (drawDate === null) continue

      const held = await ctx.db
        .query('tickets')
        .withIndex('by_game_and_drawDate_and_status', (q) =>
          q.eq('game', game).eq('drawDate', drawDate).eq('status', 'pending')
        )
        .take(OVERVIEW_TICKETS_LIMIT + 1)
      const counted = held.slice(0, OVERVIEW_TICKETS_LIMIT)

      const byAccount = new Map<Id<'accounts'>, { tickets: number; sales: number }>()
      for (const ticket of counted) {
        for (const map of [byAccount, upcomingByAccount]) {
          const entry = map.get(ticket.accountId) ?? { tickets: 0, sales: 0 }
          entry.tickets += 1
          entry.sales += ticket.cost
          map.set(ticket.accountId, entry)
        }
      }
      for (const accountId of byAccount.keys()) {
        if (!nameOf.has(accountId)) nameOf.set(accountId, (await ctx.db.get(accountId))?.name ?? 'Unknown account')
      }

      upcoming.push({
        game,
        name: row?.name ?? GAMES[game].name,
        drawDate,
        drawTime: DRAW_TIME,
        tickets: counted.length,
        sales: counted.reduce((sum, ticket) => sum + ticket.cost, 0),
        byAccount: [...byAccount]
          .map(([accountId, figures]) => ({ accountId, name: nameOf.get(accountId)!, ...figures }))
          .sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name)),
        partial: held.length > OVERVIEW_TICKETS_LIMIT
      })
    }
    upcoming.sort((a, b) => a.drawDate.localeCompare(b.drawDate) || a.game.localeCompare(b.game))

    const totals = { tickets: 0, sales: 0, won: 0, lost: 0, pending: 0, payout: 0 }
    const rows = []
    for (const account of accounts) {
      const recent: Doc<'tickets'>[] = await ctx.db
        .query('tickets')
        .withIndex('by_accountId_and_createdAt', (q) => q.eq('accountId', account._id).gte('createdAt', since))
        .order('desc')
        .take(OVERVIEW_TICKETS_LIMIT + 1)
      const counted = recent.slice(0, OVERVIEW_TICKETS_LIMIT)

      const figures = { tickets: counted.length, sales: 0, won: 0, lost: 0, pending: 0, payout: 0 }
      for (const ticket of counted) {
        figures.sales += ticket.cost
        figures[ticket.status] += 1
        figures.payout += ticket.prizeWon ?? 0
      }
      for (const key of Object.keys(totals) as (keyof typeof totals)[]) totals[key] += figures[key]

      rows.push({
        accountId: account._id,
        name: account.name,
        slug: account.slug,
        status: account.status,
        ...figures,
        upcoming: upcomingByAccount.get(account._id) ?? { tickets: 0, sales: 0 },
        partial: recent.length > OVERVIEW_TICKETS_LIMIT
      })
    }
    // Busiest first; idle accounts keep a stable alphabetical order beneath.
    rows.sort((a, b) => b.sales - a.sales || b.upcoming.sales - a.upcoming.sales || a.name.localeCompare(b.name))

    return { windowDays: OVERVIEW_WINDOW_DAYS, totals, accounts: rows, upcoming }
  }
})
