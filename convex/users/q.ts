import { v } from 'convex/values'
import { type MutationCtx, type QueryCtx, query } from '../_generated/server'
import schema from '../schema'

export const current = query({
  args: {},
  returns: v.union(schema.doc('users'), v.null()),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null
    return await getUserByTokenIdentifier(ctx, identity.tokenIdentifier)
  }
})

export async function getUserByTokenIdentifier(ctx: QueryCtx | MutationCtx, tokenIdentifier: string) {
  return await ctx.db
    .query('users')
    .withIndex('by_tokenIdentifier', (q) => q.eq('tokenIdentifier', tokenIdentifier))
    .unique()
}

export async function getUserByFirebaseUid(ctx: QueryCtx | MutationCtx, firebaseUid: string) {
  return await ctx.db
    .query('users')
    .withIndex('by_firebaseUid', (q) => q.eq('firebaseUid', firebaseUid))
    .unique()
}

/**
 * Whether the signed-in user's row exists and still has no TRON address. The
 * client reads this before generating a keypair, so a returning user does not
 * mint one on every sign-in — `claimTrxAddress` is what makes the decision
 * binding, since this answer is already stale by the time it is acted on.
 */
export const needsTrxAddress = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return false

    const user = await getUserByTokenIdentifier(ctx, identity.tokenIdentifier)
    return user !== null && user.trxAddress === undefined
  }
})
