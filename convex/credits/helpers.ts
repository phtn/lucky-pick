import { ConvexError } from 'convex/values'
import type { Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import type { CreditsReason } from './d'

/** The wallet for one account-and-user pairing, or null when there is none. */
export const getCreditsForPair = async (
  ctx: QueryCtx | MutationCtx,
  accountId: Id<'accounts'>,
  userId: Id<'users'> | null
) =>
  await ctx.db
    .query('credits')
    .withIndex('by_accountId_and_userId', (q) => q.eq('accountId', accountId).eq('userId', userId))
    .unique()

export const listCreditsForAccount = async (ctx: QueryCtx | MutationCtx, accountId: Id<'accounts'>) =>
  await ctx.db
    .query('credits')
    .withIndex('by_accountId', (q) => q.eq('accountId', accountId))
    .collect()

export const listCreditsForUser = async (ctx: QueryCtx | MutationCtx, userId: Id<'users'>) =>
  await ctx.db
    .query('credits')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .collect()

const assertGrantableAmount = (amount: number) => {
  if (!Number.isFinite(amount) || !Number.isInteger(amount)) {
    throw new ConvexError('A credit amount must be a whole number.')
  }

  if (amount < 0) {
    throw new ConvexError('A credit grant cannot be negative. Use an adjustment to take credits back.')
  }
}

export type OpenCreditsArgs = {
  accountId: Id<'accounts'>
  accountSlug: string
  userId: Id<'users'> | null
  userTokenIdentifier: string | null
  amount: number
  reason: CreditsReason
  actorTokenIdentifier: string
}

/**
 * Opens the account's first wallet, or tops up the one it already has. Creating
 * an account calls this with the opening grant, so a brand-new account always
 * has a wallet — even a zero-credit one, which is what makes a later grant a
 * balance change rather than a first appearance.
 */
export async function openCredits(ctx: MutationCtx, args: OpenCreditsArgs) {
  assertGrantableAmount(args.amount)

  const now = Date.now()
  const existing = await getCreditsForPair(ctx, args.accountId, args.userId)

  if (existing) {
    await ctx.db.patch(existing._id, {
      balance: existing.balance + args.amount,
      granted: existing.granted + args.amount,
      lastReason: args.reason,
      updatedAt: now,
      updatedBy: args.actorTokenIdentifier,
      // A wallet opened before its contact signed in has no token to credit;
      // fill it in as soon as one is known rather than leaving it null.
      ...(existing.userTokenIdentifier === null && args.userTokenIdentifier !== null
        ? { userTokenIdentifier: args.userTokenIdentifier }
        : {})
    })

    return existing._id
  }

  return await ctx.db.insert('credits', {
    accountId: args.accountId,
    accountSlug: args.accountSlug,
    userId: args.userId,
    userTokenIdentifier: args.userTokenIdentifier,
    balance: args.amount,
    granted: args.amount,
    spent: 0,
    lastReason: args.reason,
    createdAt: now,
    createdBy: args.actorTokenIdentifier,
    updatedAt: now,
    updatedBy: args.actorTokenIdentifier
  })
}
