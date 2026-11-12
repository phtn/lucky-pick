import { ConvexError, v } from 'convex/values'
import { stakesForCost } from '../../src/lib/game-settings'
import { GAME_IDS } from '../../src/lib/games'
import { mutation } from '../_generated/server'
import { betTypeSchema, gameIdSchema } from './d'
import {
  defaultGameRow,
  ensureGameRow,
  getGameByGameId,
  readStakes,
  readTicketCost,
  requireGodIdentity,
  withBetType
} from './helpers'

/**
 * Writes a row for every game the table is missing, from the static config in
 * `src/lib/games.ts`. Idempotent: a game that already has a row is left exactly
 * as configured, so seeding never resets a price someone set.
 */
export const seed = mutation({
  args: {},
  returns: v.object({ created: v.number() }),
  handler: async (ctx) => {
    const identity = await requireGodIdentity(ctx)
    const now = Date.now()
    let created = 0

    for (const gameId of GAME_IDS) {
      if (await getGameByGameId(ctx, gameId)) continue

      await ctx.db.insert('games', defaultGameRow(gameId, identity.tokenIdentifier, now))
      created += 1
    }

    return { created }
  }
})

/** Puts a whole game on or off sale. Off hides it and refuses new bets on it. */
export const setGameEnabled = mutation({
  args: { gameId: gameIdSchema, enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { gameId, enabled }) => {
    const identity = await requireGodIdentity(ctx)
    const row = await ensureGameRow(ctx, gameId, identity.tokenIdentifier)

    await ctx.db.patch('games', row._id, {
      enabled,
      updatedAt: Date.now(),
      updatedBy: identity.tokenIdentifier
    })

    return null
  }
})

/**
 * One cell of the price grid: whether this bet type is on sale for this game,
 * what one of its tickets costs, and the stakes a player may pick between.
 *
 * Every field is optional, so the console can toggle a cell without resending
 * its price. Sending a price without stakes resets the stakes to that price's
 * multiples. A call that changes nothing is refused rather than writing a row
 * and an operator trail for no change.
 */
export const updateBetType = mutation({
  args: {
    gameId: gameIdSchema,
    betType: betTypeSchema,
    enabled: v.optional(v.boolean()),
    ticketCost: v.optional(v.number()),
    stakes: v.optional(v.array(v.number()))
  },
  returns: v.null(),
  handler: async (ctx, { gameId, betType, enabled, ticketCost, stakes }) => {
    if (enabled === undefined && ticketCost === undefined && stakes === undefined) {
      throw new ConvexError('Nothing to change.')
    }

    const identity = await requireGodIdentity(ctx)
    const row = await ensureGameRow(ctx, gameId, identity.tokenIdentifier)

    const betTypes = withBetType(row, betType, (cell) => {
      // The cost is settled first: the stakes a cell offers always include what
      // a ticket actually costs, so the new cost is what they are checked against.
      const nextCost = ticketCost === undefined ? cell.ticketCost : readTicketCost(ticketCost)
      // Setting a price resets the stakes to its multiples (30 → 30, 60, 90,
      // 120). Stakes sent in the same call are an explicit override and win.
      const nextStakes =
        stakes !== undefined
          ? readStakes(stakes, nextCost)
          : ticketCost !== undefined
            ? stakesForCost(nextCost)
            : readStakes(cell.stakes, nextCost)

      return {
        betType: cell.betType,
        enabled: enabled === undefined ? cell.enabled : enabled,
        ticketCost: nextCost,
        stakes: nextStakes
      }
    })

    await ctx.db.patch('games', row._id, {
      betTypes,
      updatedAt: Date.now(),
      updatedBy: identity.tokenIdentifier
    })

    return null
  }
})
