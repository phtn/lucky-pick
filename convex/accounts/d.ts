import { v } from 'convex/values'
import { ACCOUNT_CREDIT_OPTIONS, ACCOUNT_STATUS_VALUES } from '../../src/lib/accounts/accounts'
import { userFields } from '../users/v'

export const accountStatusSchema = v.union(...ACCOUNT_STATUS_VALUES.map((status) => v.literal(status)))

/**
 * The opening grant is one of the ladder's rungs, so the stored value is a
 * union of literals rather than a free number: an account cannot be opened with
 * an amount the console never offered.
 */
export const accountInitialCreditsSchema = v.union(...ACCOUNT_CREDIT_OPTIONS.map((amount) => v.literal(amount)))

/**
 * Where the account's money goes. Every field is optional because payout is
 * arranged after the account exists, and `accountNumber` covers a bank account
 * number or the phone number a wallet is registered to — the one identifier the
 * chosen provider pays into.
 */
export const accountPayoutDetailsSchema = v.object({
  bankOrWallet: v.optional(v.string()),
  accountName: v.optional(v.string()),
  accountNumber: v.optional(v.string()),
  notes: v.optional(v.string())
})

/**
 * The human the platform talks to for this account, stored in the `users`
 * document's own shape so a contact who signs in later needs no translation:
 * the identity fields are the same fields, and `userId` / `tokenIdentifier`
 * link the two once there is an identity to link to. Both stay null for an
 * account provisioned before its contact has ever signed in.
 *
 * Every identity field is optional for the same reason — the account exists
 * before the person does, so only the name and email we were given are
 * required. `title` is the one field a contact has and a user does not.
 */
export const accountPrimaryContactSchema = v.object({
  ...v.object(userFields).partial().fields,
  name: v.string(),
  email: v.string(),
  phone: v.union(v.string(), v.null()),
  emailVerified: v.union(v.boolean(), v.null()),
  tokenIdentifier: v.union(v.string(), v.null()),
  firebaseUid: v.union(v.string(), v.null()),
  userId: v.union(v.id('users'), v.null()),
  title: v.union(v.string(), v.null())
})

export const accountSchema = v.object({
  slug: v.string(),
  name: v.string(),
  status: accountStatusSchema,
  /**
   * The grant the account was opened with, kept as a record of what was
   * promised. The spendable balance lives in `credits`, which this seeds.
   */
  initialCredits: accountInitialCreditsSchema,
  payoutDetails: accountPayoutDetailsSchema,
  primaryContact: accountPrimaryContactSchema,
  billingEmail: v.union(v.string(), v.null()),
  ownerTokenIdentifier: v.string(),
  notes: v.union(v.string(), v.null()),
  closedAt: v.union(v.number(), v.null()),
  closedBy: v.union(v.string(), v.null()),
  closeReason: v.union(v.string(), v.null()),
  createdAt: v.number(),
  createdBy: v.string(),
  updatedAt: v.number(),
  updatedBy: v.string()
})

export const accountDocumentSchema = accountSchema.extend({
  _id: v.id('accounts'),
  _creationTime: v.number()
})

/**
 * Contact input never carries a `tokenIdentifier`: accepting one would let a
 * caller attach an account to an identity that is not theirs. The caller names
 * an existing user by `firebaseUid` and the server resolves the rest from the
 * `users` table.
 */
export const accountPrimaryContactInputSchema = v.object({
  name: v.string(),
  email: v.string(),
  phone: v.optional(v.union(v.string(), v.null())),
  title: v.optional(v.union(v.string(), v.null())),
  firebaseUid: v.optional(v.union(v.string(), v.null()))
})

export const createAccountSchema = v.object({
  name: v.string(),
  slug: v.optional(v.string()),
  status: v.optional(v.literal('pending')),
  initialCredits: v.optional(accountInitialCreditsSchema),
  payoutDetails: v.optional(accountPayoutDetailsSchema),
  primaryContact: accountPrimaryContactInputSchema,
  billingEmail: v.optional(v.union(v.string(), v.null())),
  notes: v.optional(v.union(v.string(), v.null())),
  ownerTokenIdentifier: v.optional(v.string())
})

/**
 * `initialCredits` is absent here on purpose: the opening grant is history once
 * the account exists, and changing it would leave the `credits` balance it
 * seeded unexplained. Later grants go through `credits.m.grant`.
 */
export const updateAccountSchema = v.object({
  name: v.optional(v.string()),
  status: v.optional(accountStatusSchema),
  payoutDetails: v.optional(accountPayoutDetailsSchema),
  primaryContact: v.optional(accountPrimaryContactInputSchema),
  billingEmail: v.optional(v.union(v.string(), v.null())),
  notes: v.optional(v.union(v.string(), v.null()))
})

export type Account = typeof accountSchema.type
export type AccountDocument = typeof accountDocumentSchema.type
export type AccountPayoutDetails = typeof accountPayoutDetailsSchema.type
export type AccountPrimaryContact = typeof accountPrimaryContactSchema.type
export type CreateAccountInput = typeof createAccountSchema.type
export type UpdateAccountInput = typeof updateAccountSchema.type
