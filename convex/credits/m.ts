import { ConvexError, v } from 'convex/values'
import { mutation } from '../_generated/server'
import { requireGodIdentity } from '../accounts/helpers'
import { creditsDocumentSchema } from './d'
import { getCreditsForPair, openCredits } from './helpers'

/**
 * Adds credits to an account's wallet. The wallet is identified by the account
 * and, optionally, the user it belongs to — omitting the user tops up the
 * account-level wallet the create flow opened.
 */
export const grant = mutation({
  args: {
    accountId: v.id('accounts'),
    userId: v.optional(v.union(v.id('users'), v.null())),
    amount: v.number()
  },
  returns: v.id('credits'),
  handler: async (ctx, { accountId, userId = null, amount }) => {
    const identity = await requireGodIdentity(ctx)

    const account = await ctx.db.get(accountId)
    if (!account) throw new ConvexError('Account not found.')

    const user = userId === null ? null : await ctx.db.get(userId)
    if (userId !== null && !user) throw new ConvexError('User not found.')

    return await openCredits(ctx, {
      accountId,
      accountSlug: account.slug,
      userId,
      userTokenIdentifier: user?.tokenIdentifier ?? null,
      amount,
      reason: 'manual-grant',
      actorTokenIdentifier: identity.tokenIdentifier
    })
  }
})

/**
 * Takes credits back. Separate from `grant` because a negative grant reads as a
 * mistake, and because an adjustment must never drive a balance below zero.
 */
export const adjust = mutation({
  args: {
    accountId: v.id('accounts'),
    userId: v.optional(v.union(v.id('users'), v.null())),
    amount: v.number()
  },
  returns: creditsDocumentSchema,
  handler: async (ctx, { accountId, userId = null, amount }) => {
    const identity = await requireGodIdentity(ctx)

    if (!Number.isInteger(amount) || amount >= 0) {
      throw new ConvexError('An adjustment must be a negative whole number. Use a grant to add credits.')
    }

    const wallet = await getCreditsForPair(ctx, accountId, userId)
    if (!wallet) throw new ConvexError('This account has no credit wallet to adjust.')

    const balance = wallet.balance + amount
    if (balance < 0) {
      throw new ConvexError(`This wallet holds ${wallet.balance} credits, so it cannot give up ${Math.abs(amount)}.`)
    }

    await ctx.db.patch(wallet._id, {
      balance,
      spent: wallet.spent - amount,
      lastReason: 'adjustment',
      updatedAt: Date.now(),
      updatedBy: identity.tokenIdentifier
    })

    const updated = await ctx.db.get(wallet._id)
    if (!updated) throw new ConvexError('Credit wallet not found.')
    return updated
  }
})
