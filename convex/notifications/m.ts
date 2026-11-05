import { ConvexError, v } from 'convex/values'
import { mutation, type MutationCtx } from '../_generated/server'
import { getUserByTokenIdentifier } from '../users/q'
import { NOTIFICATION_HISTORY_LIMIT } from './d'

const requireCallerUser = async (ctx: MutationCtx) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new ConvexError('Unauthorized.')

  const user = await getUserByTokenIdentifier(ctx, identity.tokenIdentifier)
  if (!user) throw new ConvexError('Unauthorized.')

  return user
}

/** Marks one of the caller's own notifications read; refuses anyone else's. */
export const markRead = mutation({
  args: { notificationId: v.id('notifications') },
  returns: v.null(),
  handler: async (ctx, { notificationId }) => {
    const user = await requireCallerUser(ctx)

    const row = await ctx.db.get('notifications', notificationId)
    // A notification id is not a secret, so ownership is checked, not assumed.
    if (!row || row.userId !== user._id) throw new ConvexError('Unauthorized.')

    if (row.readAt === null) await ctx.db.patch('notifications', notificationId, { readAt: Date.now() })
    return null
  }
})

/** Marks every unread notification of the caller's, and only theirs, read. */
export const markAllRead = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const user = await requireCallerUser(ctx)

    const rows = await ctx.db
      .query('notifications')
      .withIndex('by_userId_and_createdAt', (q) => q.eq('userId', user._id))
      .order('desc')
      .take(NOTIFICATION_HISTORY_LIMIT)

    const now = Date.now()
    for (const row of rows) {
      if (row.readAt === null) await ctx.db.patch('notifications', row._id, { readAt: now })
    }
    return null
  }
})
