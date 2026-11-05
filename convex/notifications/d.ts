import { v } from 'convex/values'

/** What happened. A row stores this and its parameters, never rendered text. */
export const notificationKindSchema = v.union(
  v.literal('house-awaiting-confirmation'),
  v.literal('house-suspended'),
  v.literal('house-closed'),
  v.literal('house-activated'),
  v.literal('topup-approved'),
  v.literal('topup-rejected'),
  v.literal('transaction-reversed')
)

export type NotificationKind = typeof notificationKindSchema.type

/** Rows kept per user; `notify` deletes the oldest past this, bounding the inbox. */
export const NOTIFICATION_HISTORY_LIMIT = 100

export const notificationFields = {
  // The recipient.
  userId: v.id('users'),
  kind: notificationKindSchema,
  // The house concerned; null when the event has no house.
  accountId: v.union(v.id('accounts'), v.null()),
  // The house's name when the event happened, denormalized like `credits.accountSlug`.
  accountName: v.string(),
  // Money involved, when the kind has any.
  amount: v.union(v.number(), v.null()),
  // When the recipient read it; null while unread.
  readAt: v.union(v.number(), v.null()),
  createdAt: v.number()
}
