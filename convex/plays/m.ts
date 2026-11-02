import { v } from 'convex/values'
import { mutation } from '../_generated/server'
import { getUserByTokenIdentifier } from '../users/q'
import { PLAY_HISTORY_LIMIT, practicePlayFields, TICKET_DETAIL_LIMIT } from './d'

const { userId: _userId, ...clientFields } = practicePlayFields

/**
 * Stores one resolved draw for the signed-in user, then prunes their history
 * to the newest `PLAY_HISTORY_LIMIT`. A practice row is not worth an error, so
 * a caller with no identity or no user row gets `null`, not a throw.
 *
 * The owner comes from the identity, never from an argument. `tickets` is cut
 * to `TICKET_DETAIL_LIMIT` here too: the client caps it, but a client can lie.
 */
export const record = mutation({
  args: clientFields,
  returns: v.union(v.id('practicePlays'), v.null()),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null

    const user = await getUserByTokenIdentifier(ctx, identity.tokenIdentifier)
    if (!user) return null

    const id = await ctx.db.insert('practicePlays', {
      ...args,
      tickets: args.tickets.slice(0, TICKET_DETAIL_LIMIT),
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
