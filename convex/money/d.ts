import { v } from 'convex/values'

/**
 * A top-up is maker-checker, then claimed: one god records the payment, another
 * approves it, and the house's own contact claims it. Only the claim mints, so
 * `approved` means "waiting to be claimed" and `claimed` means the credits are
 * in the float. `rejected` and `cancelled` are separate so the history says
 * whether a checker refused it or the maker withdrew it.
 *
 * Requests approved before claiming existed minted on approval. They are still
 * `approved`, and are told apart by already having a `txnId`.
 */
export const topupStatusSchema = v.union(
  v.literal('pending'),
  v.literal('approved'),
  v.literal('claimed'),
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
  // Set when the credits are minted, which is the claim: the mint this request
  // produced, so the two can be traced both ways.
  txnId: v.union(v.id('ledgerTransactions'), v.null()),
  // When the house's contact claimed it, and their tokenIdentifier. Optional:
  // requests from before claiming existed have neither.
  claimedAt: v.optional(v.number()),
  claimedBy: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number()
}

/**
 * The one rule about top-ups the house can switch: whether a request must be
 * decided by a god other than the one who filed it. A single row, and no row
 * at all means the rule is on — a deployment that has never touched the switch
 * keeps the two-person check it always had.
 */
export const topupPolicyFields = {
  requireSecondGod: v.boolean(),
  updatedAt: v.number(),
  updatedBy: v.string()
}

/** How many policy changes the console reads back; the log itself is never trimmed. */
export const TOPUP_POLICY_CHANGE_LIMIT = 50

/**
 * Every flip of the switch, kept forever. Switching the rule off lets one god
 * mint alone, so who did it and when has to outlive the setting itself.
 * `actorLabel` is the actor's email or name as their token carried it then.
 */
export const topupPolicyChangeFields = {
  requireSecondGod: v.boolean(),
  actorTokenIdentifier: v.string(),
  actorLabel: v.string(),
  createdAt: v.number()
}

export const topupRequestSchema = v.object(topupRequestFields)

export type TopupStatus = typeof topupStatusSchema.type
export type TopupRequest = typeof topupRequestSchema.type
