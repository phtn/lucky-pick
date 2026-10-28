import { v } from 'convex/values'
import { ACCOUNT_PLAN_VALUES, ACCOUNT_STATUS_VALUES } from '../../src/lib/accounts/accounts'
import { userFields } from '../users/v'

export const accountStatusSchema = v.union(...ACCOUNT_STATUS_VALUES.map((status) => v.literal(status)))

export const accountPlanSchema = v.union(...ACCOUNT_PLAN_VALUES.map((plan) => v.literal(plan)))

export const accountAddressSchema = v.object({
  line1: v.optional(v.string()),
  line2: v.optional(v.string()),
  city: v.optional(v.string()),
  region: v.optional(v.string()),
  postalCode: v.optional(v.string()),
  country: v.optional(v.string())
})

/** The business behind the account: who it is on paper, not who we talk to. */
export const accountOrganizationSchema = v.object({
  legalName: v.optional(v.string()),
  website: v.optional(v.string()),
  industry: v.optional(v.string()),
  size: v.optional(v.string()),
  taxId: v.optional(v.string()),
  registrationNumber: v.optional(v.string()),
  address: v.optional(accountAddressSchema)
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
  plan: accountPlanSchema,
  organization: accountOrganizationSchema,
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
  plan: v.optional(accountPlanSchema),
  organization: v.optional(accountOrganizationSchema),
  primaryContact: accountPrimaryContactInputSchema,
  billingEmail: v.optional(v.union(v.string(), v.null())),
  notes: v.optional(v.union(v.string(), v.null())),
  ownerTokenIdentifier: v.optional(v.string())
})

export const updateAccountSchema = v.object({
  name: v.optional(v.string()),
  status: v.optional(accountStatusSchema),
  plan: v.optional(accountPlanSchema),
  organization: v.optional(accountOrganizationSchema),
  primaryContact: v.optional(accountPrimaryContactInputSchema),
  billingEmail: v.optional(v.union(v.string(), v.null())),
  notes: v.optional(v.union(v.string(), v.null()))
})

export type Account = typeof accountSchema.type
export type AccountDocument = typeof accountDocumentSchema.type
export type AccountOrganization = typeof accountOrganizationSchema.type
export type AccountPrimaryContact = typeof accountPrimaryContactSchema.type
export type CreateAccountInput = typeof createAccountSchema.type
export type UpdateAccountInput = typeof updateAccountSchema.type
