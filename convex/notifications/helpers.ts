import type { Id } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'
import { NOTIFICATION_HISTORY_LIMIT, type NotificationKind } from './d'

/**
 * The only way a notification is written. It is a helper, not a mutation, so
 * nothing client-side can create one. A null `userId` is an unlinked contact
 * (the account exists before they ever sign in): nobody to address, so it
 * returns without writing and the producing mutation still commits.
 */
export async function notify(
  ctx: MutationCtx,
  args: {
    userId: Id<'users'> | null
    kind: NotificationKind
    accountId: Id<'accounts'> | null
    accountName: string
    amount?: number
  }
): Promise<void> {
  const { userId } = args
  if (userId === null) return

  await ctx.db.insert('notifications', {
    userId,
    kind: args.kind,
    accountId: args.accountId,
    accountName: args.accountName,
    // Convex rejects `undefined` against `v.union(v.number(), v.null())`.
    amount: args.amount ?? null,
    readAt: null,
    createdAt: Date.now()
  })

  // Oldest first, so anything past the limit is the excess to delete.
  const oldest = await ctx.db
    .query('notifications')
    .withIndex('by_userId_and_createdAt', (q) => q.eq('userId', userId))
    .take(NOTIFICATION_HISTORY_LIMIT + 1)
  for (const row of oldest.slice(0, Math.max(oldest.length - NOTIFICATION_HISTORY_LIMIT, 0))) {
    await ctx.db.delete('notifications', row._id)
  }
}
