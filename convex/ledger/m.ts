import { ConvexError, v } from 'convex/values'
import { mutation } from '../_generated/server'
import { requireGodIdentity } from '../accounts/helpers'
import { walletStatusSchema } from './d'
import { reverse } from './post'

const MEMO_MAX_LENGTH = 500

/**
 * Undoes a transaction by posting its legs negated. A reversal is a
 * correction to the books, so it must say why: the memo is the audit trail.
 * Retrying returns the original reversal rather than applying a second one.
 */
export const reverseTransaction = mutation({
  args: { txnId: v.id('ledgerTransactions'), memo: v.string() },
  returns: v.id('ledgerTransactions'),
  handler: async (ctx, { txnId, memo }) => {
    const identity = await requireGodIdentity(ctx)

    const reason = memo.trim()
    if (reason.length < 1 || reason.length > MEMO_MAX_LENGTH) {
      throw new ConvexError(`A reversal needs a reason of 1 to ${MEMO_MAX_LENGTH} characters.`)
    }

    const result = await reverse(ctx, { txnId, actorTokenIdentifier: identity.tokenIdentifier, memo: reason })
    return result.txnId
  }
})

/** Freezing stops a wallet from being posted to until it is made active again. */
export const setWalletStatus = mutation({
  args: { walletId: v.id('wallets'), status: walletStatusSchema },
  returns: v.null(),
  handler: async (ctx, { walletId, status }) => {
    await requireGodIdentity(ctx)

    const wallet = await ctx.db.get('wallets', walletId)
    if (!wallet) throw new ConvexError('Wallet not found.')
    // Issuance and fees back every other wallet; freezing one would stop the whole ledger.
    if (wallet.kind === 'system' && status === 'frozen') throw new ConvexError('System wallets cannot be frozen.')

    // Not a balance change, so the one direct wallet patch allowed outside post().
    await ctx.db.patch('wallets', walletId, { status, updatedAt: Date.now() })
    return null
  }
})
