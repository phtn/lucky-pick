import { ConvexError, v } from 'convex/values'
import { canUseAccount } from '../../src/lib/accounts/accounts'
import type { Doc, Id } from '../_generated/dataModel'
import { query } from '../_generated/server'
import { betTypeSchema, gameIdSchema } from '../games/d'
import { getUserByTokenIdentifier } from '../users/q'
import {
  HOUSE_TICKETS_LIMIT,
  MY_TICKET_HOUSES_LIMIT,
  MY_TICKETS_LIMIT,
  RECENT_RESULTS_LIMIT,
  RESULT_GAME_IDS,
  RESULT_HOUSES_LIMIT,
  RESULT_TICKETS_LIMIT,
  RESULT_WINNING_NUMBERS_LIMIT,
  ticketStatusSchema
} from './d'

/**
 * The caller's own tickets, newest first. Derived from the identity, so there
 * is no id to probe. Capped rather than paged: it feeds one fixed list.
 */
export const mine = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      ticketId: v.id('tickets'),
      accountId: v.id('accounts'),
      game: gameIdSchema,
      betType: betTypeSchema,
      numbers: v.array(v.number()),
      cost: v.number(),
      status: ticketStatusSchema,
      hits: v.number(),
      prizeWon: v.union(v.number(), v.null()),
      /** `null` for a ticket bought before draws were recorded on tickets. */
      drawDate: v.union(v.string(), v.null()),
      drawTime: v.union(v.string(), v.null()),
      createdAt: v.number()
    })
  ),
  handler: async (ctx, { limit }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new ConvexError('Unauthorized.')

    // A brand-new sign-in reads its tickets before its users row exists.
    const user = await getUserByTokenIdentifier(ctx, identity.tokenIdentifier)
    if (!user) return []

    const take = Math.min(Math.max(Math.floor(limit ?? MY_TICKETS_LIMIT), 1), MY_TICKETS_LIMIT)
    const rows = await ctx.db
      .query('tickets')
      .withIndex('by_userId_and_createdAt', (q) => q.eq('userId', user._id))
      .order('desc')
      .take(take)

    return rows.map((row) => ({
      ticketId: row._id,
      accountId: row.accountId,
      game: row.game,
      betType: row.betType,
      numbers: row.numbers,
      cost: row.cost,
      status: row.status,
      hits: row.hits,
      prizeWon: row.prizeWon ?? null,
      drawDate: row.drawDate ?? null,
      drawTime: row.drawTime ?? null,
      createdAt: row.createdAt
    }))
  }
})

/**
 * The newest tickets placed at every house the caller is the linked contact
 * of, each with the player who bought it. Matched on the identity's token like
 * `accounts.q.myPlayers`, so a stranger gets an empty list rather than anyone's
 * book, and like it only a usable house is listed.
 *
 * The `returns` validator is the privacy boundary: a banker sees a player's
 * display name and picture, never their email, phone or sign-in identifiers.
 */
export const atMyHouses = query({
  args: {},
  returns: v.array(
    v.object({
      accountId: v.id('accounts'),
      name: v.string(),
      /** True when the house holds more tickets than the list carries. */
      truncated: v.boolean(),
      tickets: v.array(
        v.object({
          ticketId: v.id('tickets'),
          userId: v.id('users'),
          playerName: v.string(),
          playerImageUrl: v.union(v.string(), v.null()),
          game: gameIdSchema,
          betType: betTypeSchema,
          numbers: v.array(v.number()),
          cost: v.number(),
          status: ticketStatusSchema,
          hits: v.number(),
          prizeWon: v.union(v.number(), v.null()),
          drawDate: v.union(v.string(), v.null()),
          drawTime: v.union(v.string(), v.null()),
          createdAt: v.number()
        })
      )
    })
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new ConvexError('Unauthorized.')

    const accounts = await ctx.db
      .query('accounts')
      .withIndex('by_primaryContact_tokenIdentifier', (q) =>
        q.eq('primaryContact.tokenIdentifier', identity.tokenIdentifier)
      )
      .take(MY_TICKET_HOUSES_LIMIT)

    // One player usually holds many of a house's tickets, so each is read once.
    const players = new Map<Id<'users'>, Doc<'users'> | null>()
    const readPlayer = async (userId: Id<'users'>) => {
      if (!players.has(userId)) players.set(userId, await ctx.db.get('users', userId))
      return players.get(userId) ?? null
    }

    const houses = []
    for (const account of accounts) {
      if (!canUseAccount(account.status)) continue

      const rows = await ctx.db
        .query('tickets')
        .withIndex('by_accountId_and_createdAt', (q) => q.eq('accountId', account._id))
        .order('desc')
        .take(HOUSE_TICKETS_LIMIT + 1)

      const tickets = []
      for (const row of rows.slice(0, HOUSE_TICKETS_LIMIT)) {
        const player = await readPlayer(row.userId)
        tickets.push({
          ticketId: row._id,
          userId: row.userId,
          playerName: player?.nickname ?? player?.name ?? player?.preferredUsername ?? 'Player',
          playerImageUrl: player?.imageUrl ?? null,
          game: row.game,
          betType: row.betType,
          numbers: row.numbers,
          cost: row.cost,
          status: row.status,
          hits: row.hits,
          prizeWon: row.prizeWon ?? null,
          drawDate: row.drawDate ?? null,
          drawTime: row.drawTime ?? null,
          createdAt: row.createdAt
        })
      }

      houses.push({
        accountId: account._id,
        name: account.name,
        truncated: rows.length > HOUSE_TICKETS_LIMIT,
        tickets
      })
    }

    return houses.sort((a, b) => a.name.localeCompare(b.name))
  }
})

/**
 * The most recent draw results of the games tickets are sold on, each with
 * what the caller's houses held against it: how many tickets were entered,
 * how many won, and what they paid.
 *
 * The results themselves are public (`resultsImport.list` serves them to
 * anyone); the ticket figures come only from houses the caller is the linked
 * contact of, matched on the identity's token like `atMyHouses`. Someone who
 * fronts no house sees the results with nothing against them.
 */
export const recentResults = query({
  args: {},
  returns: v.array(
    v.object({
      drawId: v.string(),
      game: gameIdSchema,
      date: v.string(),
      time: v.union(v.string(), v.null()),
      /** The drawn numbers, or `null` for a result imported without them. */
      numbers: v.union(v.array(v.number()), v.null()),
      /** Tickets entered in this draw at the caller's houses. */
      tickets: v.number(),
      /** What those tickets cost in all, in whole credits. */
      sales: v.number(),
      /** How many of those won. */
      winners: v.number(),
      /** The numbers on the winning tickets, one array each; capped, so it can be shorter than `winners`. */
      winningNumbers: v.array(v.array(v.number())),
      /** What those winners were paid, in whole credits. */
      payout: v.number(),
      /** `none`: no tickets. `pending`: some still unsettled. `settled`: all won or lost. */
      status: v.union(v.literal('none'), v.literal('pending'), v.literal('settled')),
      /** True when a house holds more tickets on this draw than were counted. */
      partial: v.boolean()
    })
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new ConvexError('Unauthorized.')

    // The newest of each game, merged: the index orders one game at a time.
    const newest = []
    for (const [resultGame, game] of Object.entries(RESULT_GAME_IDS) as [
      keyof typeof RESULT_GAME_IDS,
      (typeof RESULT_GAME_IDS)[keyof typeof RESULT_GAME_IDS]
    ][]) {
      const rows = await ctx.db
        .query('historicalResults')
        .withIndex('by_game_and_date', (q) => q.eq('game', resultGame))
        .order('desc')
        .take(RECENT_RESULTS_LIMIT)
      for (const row of rows) newest.push({ row, game })
    }
    newest.sort((a, b) => b.row.date.localeCompare(a.row.date) || a.game.localeCompare(b.game))

    const accounts = await ctx.db
      .query('accounts')
      .withIndex('by_primaryContact_tokenIdentifier', (q) =>
        q.eq('primaryContact.tokenIdentifier', identity.tokenIdentifier)
      )
      .take(RESULT_HOUSES_LIMIT)
    const houses = accounts.filter((account) => canUseAccount(account.status))

    const results = []
    for (const { row, game } of newest.slice(0, RECENT_RESULTS_LIMIT)) {
      let tickets = 0
      let sales = 0
      let winners = 0
      const winningNumbers: number[][] = []
      let payout = 0
      let pending = 0
      let partial = false

      for (const house of houses) {
        const held = await ctx.db
          .query('tickets')
          .withIndex('by_accountId_and_game_and_drawDate', (q) =>
            q.eq('accountId', house._id).eq('game', game).eq('drawDate', row.date)
          )
          .take(RESULT_TICKETS_LIMIT + 1)
        if (held.length > RESULT_TICKETS_LIMIT) partial = true

        for (const ticket of held.slice(0, RESULT_TICKETS_LIMIT)) {
          tickets += 1
          sales += ticket.cost
          if (ticket.status === 'pending') pending += 1
          if (ticket.status === 'won') {
            winners += 1
            if (winningNumbers.length < RESULT_WINNING_NUMBERS_LIMIT) winningNumbers.push(ticket.numbers)
            payout += ticket.prizeWon ?? 0
          }
        }
      }

      results.push({
        drawId: row.drawId,
        game,
        date: row.date,
        time: row.time,
        numbers: row.numbers,
        tickets,
        sales,
        winners,
        winningNumbers,
        payout,
        status: tickets === 0 ? ('none' as const) : pending > 0 ? ('pending' as const) : ('settled' as const),
        partial
      })
    }

    return results
  }
})
