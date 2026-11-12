import { ConvexError, v } from 'convex/values'
import { query } from '../_generated/server'
import { betTypeSchema, gameIdSchema } from '../games/d'
import { getUserByTokenIdentifier } from '../users/q'
import { MY_TICKETS_LIMIT, ticketStatusSchema } from './d'

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
      createdAt: row.createdAt
    }))
  }
})
