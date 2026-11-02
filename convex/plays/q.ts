import { v } from 'convex/values'
import { query } from '../_generated/server'
import schema from '../schema'
import { getUserByTokenIdentifier } from '../users/q'
import { DEFAULT_PLAY_PAGE, PLAY_HISTORY_LIMIT } from './d'

/**
 * The signed-in user's practice plays, newest first. Draws that share a
 * `drawnAt` come back newest-created first, because the index ends in
 * `_creationTime`. Signed out, or no user row yet, reads as no plays.
 */
export const mine = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(schema.doc('practicePlays')),
  handler: async (ctx, { limit }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []

    const user = await getUserByTokenIdentifier(ctx, identity.tokenIdentifier)
    if (!user) return []

    // A non-positive or non-finite limit is a malformed ask, not a request for none.
    const wanted = limit !== undefined && Number.isFinite(limit) && limit >= 1 ? Math.floor(limit) : DEFAULT_PLAY_PAGE
    return await ctx.db
      .query('practicePlays')
      .withIndex('by_userId_and_drawnAt', (q) => q.eq('userId', user._id))
      .order('desc')
      .take(Math.min(wanted, PLAY_HISTORY_LIMIT))
  }
})
