import { v } from 'convex/values'

/**
 * A top-up is maker-checker: one god records the payment, another approves it,
 * and only approval mints. `rejected` and `cancelled` are separate so the
 * history says whether a checker refused it or the maker withdrew it.
 */
export const topupStatusSchema = v.union(
  v.literal('pending'),
  v.literal('approved'),
  v.literal('rejected'),
  v.literal('cancelled')
)

export const topupRequestFields = {
  accountId: v.id('accounts'),
  // Whole credits, and 1 credit = ₱1, so this is also the pesos received.
  amount: v.number(),
  currency: v.literal('PHP'),
  paymentReference: v.union(v.string(), v.null()),
  note: v.union(v.string(), v.null()),
  status: topupStatusSchema,
  makerTokenIdentifier: v.string(),
  checkerTokenIdentifier: v.union(v.string(), v.null()),
  decisionNote: v.union(v.string(), v.null()),
  decidedAt: v.union(v.number(), v.null()),
  // Set on approval: the mint this request produced, so the two can be traced both ways.
  txnId: v.union(v.id('ledgerTransactions'), v.null()),
  createdAt: v.number(),
  updatedAt: v.number()
}

export const topupRequestSchema = v.object(topupRequestFields)

export type TopupStatus = typeof topupStatusSchema.type
export type TopupRequest = typeof topupRequestSchema.type
