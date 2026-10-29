import { v } from 'convex/values'

/**
 * Why a balance moved. `initial-grant` is written once, when the account is
 * provisioned; everything after it is an operator action.
 */
export const creditReasonSchema = v.union(
  v.literal('initial-grant'),
  v.literal('manual-grant'),
  v.literal('adjustment'),
  v.literal('spend')
)

/**
 * One wallet per account-and-user pairing. The account is always known; the
 * user is not, because an account can be provisioned before its primary
 * contact has ever signed in. Such a row holds the account's opening balance
 * until the contact links, at which point the same row gains its `userId`.
 *
 * `granted` and `spent` are kept alongside `balance` so a balance can be
 * explained without a per-transaction ledger: balance = granted - spent.
 */
export const creditsFields = {
  accountId: v.id('accounts'),
  // Denormalized so the console can read a wallet from a slug without first
  // loading the account it belongs to.
  accountSlug: v.string(),
  userId: v.union(v.id('users'), v.null()),
  userTokenIdentifier: v.union(v.string(), v.null()),
  balance: v.number(),
  granted: v.number(),
  spent: v.number(),
  lastReason: creditReasonSchema,
  createdAt: v.number(),
  createdBy: v.string(),
  updatedAt: v.number(),
  updatedBy: v.string()
}

export const creditsSchema = v.object(creditsFields)

export const creditsDocumentSchema = creditsSchema.extend({
  _id: v.id('credits'),
  _creationTime: v.number()
})

export type CreditsReason = typeof creditReasonSchema.type
export type Credits = typeof creditsSchema.type
export type CreditsDocument = typeof creditsDocumentSchema.type
