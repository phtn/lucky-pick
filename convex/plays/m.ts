import { ConvexError, v } from 'convex/values'
import { MAX_STAKE, MIN_TICKET_COST, isStake } from '../../src/lib/game-settings'
import { mutation } from '../_generated/server'
import { getUserByTokenIdentifier } from '../users/q'
import {
  DRAWN_BALL_LIMIT,
  PLAY_HISTORY_LIMIT,
  PLAYER_NAME_LIMIT,
  practicePlayFields,
  SEED_STRING_LIMIT,
  TICKET_DETAIL_LIMIT,
  TICKET_NUMBER_LIMIT
} from './d'

const { userId: _userId, ...clientFields } = practicePlayFields

/**
 * A stake the house could actually have charged: whole pesos, within the bounds
 * a configured stake lives in (a ticket price or one of its multiples). Unlike the arrays above this is refused
 * rather than trimmed — a made-up price would misstate what a session spent.
 */
const readTicketCost = (cost: number) => {
  if (!isStake(cost)) {
    throw new ConvexError(`A ticket cost must be a whole number of pesos between ${MIN_TICKET_COST} and ${MAX_STAKE}.`)
  }

  return cost
}

/**
 * Stores one resolved draw for the signed-in user, then prunes their history
 * to the newest `PLAY_HISTORY_LIMIT`. A practice row is not worth an error, so
 * a caller with no identity or no user row gets `null`, not a throw.
 *
 * The owner comes from the identity, never from an argument. Every array and
 * string is cut to its bound here too — the client caps them, but a client can
 * lie, and this mutation is public.
 */
export const record = mutation({
  args: clientFields,
  returns: v.union(v.id('practicePlays'), v.null()),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null

    const user = await getUserByTokenIdentifier(ctx, identity.tokenIdentifier)
    if (!user) return null

    const { seed } = args
    const id = await ctx.db.insert('practicePlays', {
      ...args,
      drawnBalls: args.drawnBalls.slice(0, DRAWN_BALL_LIMIT),
      seed:
        seed === null
          ? null
          : {
              ...seed,
              clientSeed: seed.clientSeed.slice(0, SEED_STRING_LIMIT),
              serverSeed: seed.serverSeed.slice(0, SEED_STRING_LIMIT)
            },
      tickets: args.tickets.slice(0, TICKET_DETAIL_LIMIT).map((ticket) => ({
        ...ticket,
        cost: readTicketCost(ticket.cost),
        numbers: ticket.numbers.slice(0, TICKET_NUMBER_LIMIT),
        playerName: ticket.playerName.slice(0, PLAYER_NAME_LIMIT)
      })),
      // The draw happened in the browser, so `drawnAt` is the client's clock and
      // orders the history. A clock running fast would date rows in the future,
      // and then every new row is the "oldest" and is pruned by the very insert
      // that created it — a history that silently stops updating forever. The
      // future is refused; a slow clock is still the player's own order.
      drawnAt: Math.min(args.drawnAt, Date.now()),
      userId: user._id
    })

    // Oldest first, so anything past the limit is the excess to delete.
    const oldest = await ctx.db
      .query('practicePlays')
      .withIndex('by_userId_and_drawnAt', (q) => q.eq('userId', user._id))
      .take(PLAY_HISTORY_LIMIT + 1)
    for (const row of oldest.slice(0, Math.max(oldest.length - PLAY_HISTORY_LIMIT, 0))) {
      await ctx.db.delete('practicePlays', row._id)
    }

    return id
  }
})
