import { ConvexError, v } from 'convex/values'
import { query } from '../_generated/server'
import { getUserByTokenIdentifier } from '../users/q'
import { NOTIFICATION_HISTORY_LIMIT, notificationKindSchema } from './d'

/**
 * The caller's inbox, newest first. Explicitly narrow: only the seven fields a
 * player needs, with the row id projected as `notificationId`.
 */
export const mine = query({
  args: {},
  returns: v.array(
    v.object({
      notificationId: v.id('notifications'),
      kind: notificationKindSchema,
      accountId: v.union(v.id('accounts'), v.null()),
      accountName: v.string(),
      amount: v.union(v.number(), v.null()),
      readAt: v.union(v.number(), v.null()),
      createdAt: v.number()
    })
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new ConvexError('Unauthorized.')

    // A brand-new sign-in reads the inbox before their users row exists.
    const user = await getUserByTokenIdentifier(ctx, identity.tokenIdentifier)
    if (!user) return []

    const rows = await ctx.db
      .query('notifications')
      .withIndex('by_userId_and_createdAt', (q) => q.eq('userId', user._id))
      .order('desc')
      .take(NOTIFICATION_HISTORY_LIMIT)

    return rows.map((row) => ({
      notificationId: row._id,
      kind: row.kind,
      accountId: row.accountId,
      accountName: row.accountName,
      amount: row.amount,
      readAt: row.readAt,
      createdAt: row.createdAt
    }))
  }
})
