import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { ConvexError, v } from 'convex/values'
import { query } from '../_generated/server'
import { getAccountBySlug, requireAccountManager } from '../accounts/helpers'
import { isPlatformStaff } from '../lib/auth'
import schema from '../schema'
import { getUserByTokenIdentifier } from '../users/q'
import { findPartnerWallets } from './wallets'

/** What the signed-in user can spend on one account: 0 until they have a wallet there. */
export const balanceForCurrentUser = query({
  args: { accountSlug: v.string() },
  returns: v.number(),
  handler: async (ctx, { accountSlug }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return 0

    const account = await getAccountBySlug(ctx, accountSlug.trim().toLowerCase())
    const user = account && (await getUserByTokenIdentifier(ctx, identity.tokenIdentifier))
    if (!account || !user) return 0

    const wallet = await ctx.db
      .query('wallets')
      .withIndex('by_accountId_and_userId', (q) => q.eq('accountId', account._id).eq('userId', user._id))
      .unique()
    return wallet?.available ?? 0
  }
})

/** A partner's two wallets, `null` for one that has not been used yet. */
export const partnerWallets = query({
  args: { accountId: v.id('accounts') },
  returns: v.object({
    float: v.union(schema.doc('wallets'), v.null()),
    earnings: v.union(schema.doc('wallets'), v.null())
  }),
  handler: async (ctx, { accountId }) => {
    const identity = await ctx.auth.getUserIdentity()
    // Staff may read any account; everyone else must manage this one.
    if (!identity || !isPlatformStaff(identity)) await requireAccountManager(ctx, accountId)
    return await findPartnerWallets(ctx, accountId)
  }
})

/**
 * A wallet's history, newest first. Readable by staff, by the manager of the
 * wallet's account, and by the person a user wallet belongs to. System wallets
 * have no account and no owner, so only staff reach them. Every refusal reads
 * the same, so a caller cannot probe which wallet ids exist.
 */
export const walletEntries = query({
  args: { walletId: v.id('wallets'), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(schema.doc('ledgerEntries')),
  handler: async (ctx, { walletId, paginationOpts }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new ConvexError('Unauthorized.')

    if (!isPlatformStaff(identity)) {
      const wallet = await ctx.db.get('wallets', walletId)
      if (!wallet) throw new ConvexError('Unauthorized.')

      const owner = wallet.kind === 'user' && wallet.userId ? await ctx.db.get('users', wallet.userId) : null
      if (owner?.tokenIdentifier !== identity.tokenIdentifier) {
        if (!wallet.accountId) throw new ConvexError('Unauthorized.')
        await requireAccountManager(ctx, wallet.accountId)
      }
    }

    return await ctx.db
      .query('ledgerEntries')
      .withIndex('by_walletId_and_createdAt', (q) => q.eq('walletId', walletId))
      .order('desc')
      .paginate(paginationOpts)
  }
})
