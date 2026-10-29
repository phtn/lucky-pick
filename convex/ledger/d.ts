import { v } from 'convex/values'

/**
 * Who a wallet belongs to. A partner has two: `partnerFloat` is credits bought
 * to hand out, `partnerEarnings` is what its draws have won from players.
 * Keeping them apart is what stops a partner paying itself out of float.
 */
export const walletKindSchema = v.union(
  v.literal('user'),
  v.literal('partnerFloat'),
  v.literal('partnerEarnings'),
  v.literal('system')
)

/** `held` is money committed but not yet settled, e.g. a ticket's stake before the draw. */
export const walletBucketSchema = v.union(v.literal('available'), v.literal('held'))

/**
 * The platform's own wallets. `issuance` goes negative by exactly the credits
 * outstanding, which is what lets every wallet sum to zero.
 */
export const systemWalletKeySchema = v.union(v.literal('issuance'), v.literal('platformFees'))

export const walletStatusSchema = v.union(v.literal('active'), v.literal('frozen'))

export const ledgerKindSchema = v.union(
  v.literal('mint'),
  v.literal('allocate'),
  v.literal('ticketHold'),
  v.literal('ticketCapture'),
  v.literal('ticketRelease'),
  v.literal('prize'),
  v.literal('payoutReserve'),
  v.literal('payoutSettle'),
  v.literal('payoutRelease'),
  v.literal('reversal'),
  v.literal('migration')
)

/**
 * The business record a transaction answers to, tagged so one field can point
 * at any table. Later phases add tickets and payouts. A migration's id is a
 * string because what it points at is the retired `credits` row.
 */
export const ledgerRefSchema = v.union(
  v.object({ type: v.literal('topup'), id: v.id('topupRequests') }),
  v.object({ type: v.literal('migration'), id: v.string() })
)

/**
 * `available` and `held` are whole credits and only `post()` writes them.
 * `floor` is the lowest `available` may go: 0 for anything a person spends
 * from, `null` (unbounded) for issuance and partner earnings, because a prize
 * must always pay. Partner risk is capped upstream, per draw, instead.
 */
export const walletFields = {
  kind: walletKindSchema,
  accountId: v.union(v.id('accounts'), v.null()),
  userId: v.union(v.id('users'), v.null()),
  systemKey: v.union(systemWalletKeySchema, v.null()),
  available: v.number(),
  held: v.number(),
  floor: v.union(v.number(), v.null()),
  status: walletStatusSchema,
  createdAt: v.number(),
  updatedAt: v.number()
}

/**
 * An immutable header. `idempotencyKey` is unique (enforced by `post()`, since
 * Convex indexes are not), and `payloadHash` is what tells a safe retry from a
 * key reused for something else.
 */
export const ledgerTransactionFields = {
  kind: ledgerKindSchema,
  idempotencyKey: v.string(),
  payloadHash: v.string(),
  accountId: v.union(v.id('accounts'), v.null()),
  actorTokenIdentifier: v.string(),
  ref: v.union(ledgerRefSchema, v.null()),
  memo: v.union(v.string(), v.null()),
  reversesTxnId: v.union(v.id('ledgerTransactions'), v.null()),
  createdAt: v.number()
}

/**
 * One signed movement in one bucket. `balanceAfter` is the bucket's running
 * value at this leg, so a wallet's history reads without replaying it.
 */
export const ledgerEntryFields = {
  txnId: v.id('ledgerTransactions'),
  walletId: v.id('wallets'),
  bucket: walletBucketSchema,
  amount: v.number(),
  balanceAfter: v.number(),
  createdAt: v.number()
}

export type WalletKind = typeof walletKindSchema.type
export type WalletBucket = typeof walletBucketSchema.type
export type SystemWalletKey = typeof systemWalletKeySchema.type
export type LedgerKind = typeof ledgerKindSchema.type
export type LedgerRef = typeof ledgerRefSchema.type
