import { v } from 'convex/values'
import { query } from '../_generated/server'
import { requireStaffIdentity } from '../accounts/helpers'
import { creditsDocumentSchema } from './d'
import { listCreditsForAccount, listCreditsForUser } from './helpers'

/** Every wallet an account holds, one per linked user plus its unlinked one. */
export const listForAccount = query({
  args: { accountId: v.id('accounts') },
  returns: v.array(creditsDocumentSchema),
  handler: async (ctx, { accountId }) => {
    await requireStaffIdentity(ctx)
    return await listCreditsForAccount(ctx, accountId)
  }
})

export const listForUser = query({
  args: { userId: v.id('users') },
  returns: v.array(creditsDocumentSchema),
  handler: async (ctx, { userId }) => {
    await requireStaffIdentity(ctx)
    return await listCreditsForUser(ctx, userId)
  }
})

/** What the signed-in user can actually spend on one account. */
export const balanceForCurrentUser = query({
  args: { accountSlug: v.string() },
  returns: v.number(),
  handler: async (ctx, { accountSlug }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return 0

    const wallet = await ctx.db
      .query('credits')
      .withIndex('by_accountSlug_and_userTokenIdentifier', (q) =>
        q.eq('accountSlug', accountSlug.trim().toLowerCase()).eq('userTokenIdentifier', identity.tokenIdentifier)
      )
      .unique()

    return wallet?.balance ?? 0
  }
})
