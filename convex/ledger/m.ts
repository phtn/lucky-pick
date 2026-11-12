import { ConvexError, v } from 'convex/values'
import { mutation } from '../_generated/server'
import { isTopupAmount } from '../../src/lib/money/credits'
import { requireAccountManager, requireGodIdentity } from '../accounts/helpers'
import { notify } from '../notifications/helpers'
import { walletStatusSchema } from './d'
import { post, reverse } from './post'
import { findUserWallet, getPartnerWallets, getUserWallet } from './wallets'

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

    // A replayed retry changed nothing, so it is not news a second time.
    if (!result.replayed) {
      const original = await ctx.db.get('ledgerTransactions', txnId)
      const account = original?.accountId ? await ctx.db.get('accounts', original.accountId) : null
      if (account) {
        await notify(ctx, {
          userId: account.primaryContact.userId,
          kind: 'transaction-reversed',
          accountId: account._id,
          accountName: account.name
        })
      }
    }
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

const REQUEST_ID_MAX_LENGTH = 64

/**
 * A banker hands credits from their house's float to one of its players. Only
 * the house's linked contact may, and only to someone who plays there: a user
 * who has chosen the house, or who already holds a wallet at it. The float
 * cannot go below zero, so a banker can give out only what the house holds.
 *
 * `requestId` is made up by the client once per press of the button, so a
 * retried request replays the same movement instead of paying twice.
 */
export const allocateToPlayer = mutation({
  args: {
    accountId: v.id('accounts'),
    userId: v.id('users'),
    amount: v.number(),
    requestId: v.string(),
    note: v.optional(v.string())
  },
  returns: v.null(),
  handler: async (ctx, { accountId, userId, amount, requestId, note }) => {
    const { identity } = await requireAccountManager(ctx, accountId)

    if (!isTopupAmount(amount)) {
      throw new ConvexError('Enter a whole number of credits, at least 1.')
    }
    if (!/^[A-Za-z0-9-]{8,}$/.test(requestId) || requestId.length > REQUEST_ID_MAX_LENGTH) {
      throw new ConvexError('This request is malformed. Reload and try again.')
    }
    const memo = note?.trim() || null
    if (memo && memo.length > MEMO_MAX_LENGTH) {
      throw new ConvexError(`A note must be ${MEMO_MAX_LENGTH} characters or fewer.`)
    }

    const player = await ctx.db.get('users', userId)
    const plays = player && (player.selectedAccountId === accountId || (await findUserWallet(ctx, accountId, userId)))
    if (!player || !plays) {
      throw new ConvexError('That player does not play at this house.')
    }

    const { float } = await getPartnerWallets(ctx, accountId)
    if (float.available < amount) {
      throw new ConvexError(
        `The house holds ${float.available.toLocaleString('en-US')} credits, so it cannot give ${amount.toLocaleString('en-US')}.`
      )
    }
    const wallet = await getUserWallet(ctx, accountId, userId)

    await post(ctx, {
      kind: 'allocate',
      idempotencyKey: `allocate:${accountId}:${userId}:${requestId}`,
      actorTokenIdentifier: identity.tokenIdentifier,
      accountId,
      ref: null,
      memo,
      legs: [
        { walletId: float._id, bucket: 'available', amount: -amount },
        { walletId: wallet._id, bucket: 'available', amount }
      ]
    })

    return null
  }
})
