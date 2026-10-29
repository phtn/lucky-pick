import { ConvexError } from 'convex/values'
import {
  ACCOUNT_NAME_MAX_LENGTH,
  ACCOUNT_NOTES_MAX_LENGTH,
  ACCOUNT_PAYOUT_ACCOUNT_NAME_MAX_LENGTH,
  ACCOUNT_PAYOUT_ACCOUNT_NUMBER_MAX_LENGTH,
  ACCOUNT_PAYOUT_PROVIDER_MAX_LENGTH,
  ACCOUNT_PHONE_MAX_LENGTH,
  ACCOUNT_TITLE_MAX_LENGTH,
  DEFAULT_ACCOUNT_CREDITS,
  isAccountCreditOption,
  isAccountEmailAddress,
  isPublicAccountSlug,
  toAccountSlug,
  type AccountCreditOption
} from '../../src/lib/accounts/accounts'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import { isGod, isPlatformStaff, isTopGod } from '../lib/auth'
import { trimOrNull } from '../utils'

export const getAccountBySlug = async (ctx: QueryCtx | MutationCtx, slug: string) =>
  await ctx.db
    .query('accounts')
    .withIndex('by_slug', (q) => q.eq('slug', slug))
    .unique()

export const requireStaffIdentity = async (ctx: QueryCtx | MutationCtx) => {
  const identity = await ctx.auth.getUserIdentity()

  if (!identity || !isPlatformStaff(identity)) {
    throw new ConvexError('Unauthorized.')
  }

  return identity
}

/**
 * Provisioning an account is an Asgard action, so it requires the `god` claim
 * specifically — not the broader platform-staff check the read paths use.
 */
export const requireGodIdentity = async (ctx: QueryCtx | MutationCtx) => {
  const identity = await ctx.auth.getUserIdentity()

  if (!identity || !isGod(identity)) {
    throw new ConvexError('Creating an account requires a god account.')
  }

  return identity
}

/**
 * Permanently deleting an account is reserved for `topg`. Account holders close
 * their account instead; closing keeps the record, deleting does not.
 */
export const requireTopgIdentity = async (ctx: QueryCtx | MutationCtx) => {
  const identity = await ctx.auth.getUserIdentity()

  if (!identity || !isTopGod(identity)) {
    throw new ConvexError('Deleting an account requires a top-god account.')
  }

  return identity
}

export const normalizeAccountName = (name: string) => {
  const trimmed = trimOrNull(name)

  if (!trimmed) {
    throw new ConvexError('An account name is required.')
  }

  if (trimmed.length > ACCOUNT_NAME_MAX_LENGTH) {
    throw new ConvexError(`Account name must be ${ACCOUNT_NAME_MAX_LENGTH} characters or fewer.`)
  }

  return trimmed
}

export const normalizeAccountSlug = (slug: string | undefined, fallbackName: string) => {
  const candidate = trimOrNull(slug)?.toLowerCase() ?? toAccountSlug(fallbackName)

  if (!isPublicAccountSlug(candidate)) {
    throw new ConvexError(
      'Account slug must use lowercase letters, numbers, and single hyphens, and cannot be a reserved application path.'
    )
  }

  return candidate
}

export const normalizeAccountEmail = (email: string, label: string) => {
  const trimmed = trimOrNull(email)?.toLowerCase()

  if (!trimmed || !isAccountEmailAddress(trimmed)) {
    throw new ConvexError(`${label} must be a valid email address.`)
  }

  return trimmed
}

export const normalizeOptionalAccountEmail = (email: string | null | undefined, label: string) => {
  const trimmed = trimOrNull(email)

  return trimmed === null ? null : normalizeAccountEmail(trimmed, label)
}

export const normalizeAccountNotes = (notes: string | null | undefined) => {
  const trimmed = trimOrNull(notes)

  if (trimmed && trimmed.length > ACCOUNT_NOTES_MAX_LENGTH) {
    throw new ConvexError(`Notes must be ${ACCOUNT_NOTES_MAX_LENGTH} characters or fewer.`)
  }

  return trimmed
}

const normalizeBounded = (value: string | null | undefined, max: number, label: string) => {
  const trimmed = trimOrNull(value)

  if (trimmed && trimmed.length > max) {
    throw new ConvexError(`${label} must be ${max} characters or fewer.`)
  }

  return trimmed
}

type PrimaryContactInput = {
  name: string
  email: string
  phone?: string | null
  title?: string | null
  firebaseUid?: string | null
}

/**
 * Resolves the contact against the `users` table when a `firebaseUid` is given,
 * so an account created for someone who has already signed in is stored with
 * their real identity rather than a name and an email address. The stored
 * contact is the `users` shape, so whatever the user record knows is copied
 * across; what it does not know stays absent.
 */
export const normalizePrimaryContact = async (ctx: QueryCtx | MutationCtx, contact: PrimaryContactInput) => {
  const name = trimOrNull(contact.name)

  if (!name) {
    throw new ConvexError('A primary contact name is required.')
  }

  const firebaseUid = trimOrNull(contact.firebaseUid)
  const user = firebaseUid
    ? await ctx.db
        .query('users')
        .withIndex('by_firebaseUid', (q) => q.eq('firebaseUid', firebaseUid))
        .unique()
    : null

  const email = normalizeAccountEmail(contact.email, 'Primary contact email')
  const identity = user
    ? {
        tokenIdentifier: user.tokenIdentifier,
        firebaseUid: user.firebaseUid,
        userId: user._id,
        subject: user.subject,
        issuer: user.issuer,
        nickname: user.nickname,
        preferredUsername: user.preferredUsername,
        emailVerified: user.emailVerified,
        ...(user.imageUrl ? { imageUrl: user.imageUrl } : {}),
        ...(user.profileUrl ? { profileUrl: user.profileUrl } : {})
      }
    : { tokenIdentifier: null, firebaseUid, userId: null, emailVerified: null }

  return {
    contact: {
      ...identity,
      name,
      email,
      phone: normalizeBounded(contact.phone ?? user?.phone, ACCOUNT_PHONE_MAX_LENGTH, 'Phone number'),
      title: normalizeBounded(contact.title, ACCOUNT_TITLE_MAX_LENGTH, 'Contact title')
    },
    userId: user?._id ?? null
  }
}

type PayoutDetailsInput = {
  bankOrWallet?: string
  accountName?: string
  accountNumber?: string
  notes?: string
}

/**
 * Payout details are optional in full: an account can be provisioned before
 * anyone has said where its money goes. Empty fields are dropped rather than
 * stored blank, so a half-filled block reads as half-filled.
 */
export const normalizePayoutDetails = (payoutDetails: PayoutDetailsInput | undefined) => {
  if (!payoutDetails) {
    return {}
  }

  const bankOrWallet = normalizeBounded(payoutDetails.bankOrWallet, ACCOUNT_PAYOUT_PROVIDER_MAX_LENGTH, 'Bank or wallet')
  const accountName = normalizeBounded(
    payoutDetails.accountName,
    ACCOUNT_PAYOUT_ACCOUNT_NAME_MAX_LENGTH,
    'Payout account name'
  )
  const accountNumber = normalizeBounded(
    payoutDetails.accountNumber,
    ACCOUNT_PAYOUT_ACCOUNT_NUMBER_MAX_LENGTH,
    'Payout account or phone number'
  )
  const notes = normalizeBounded(payoutDetails.notes, ACCOUNT_NOTES_MAX_LENGTH, 'Payout notes')

  return {
    ...(bankOrWallet ? { bankOrWallet } : {}),
    ...(accountName ? { accountName } : {}),
    ...(accountNumber ? { accountNumber } : {}),
    ...(notes ? { notes } : {})
  }
}

/**
 * The opening grant must be one of the ladder's rungs. An amount the console
 * never offered is a sign the request did not come from the console.
 */
export const normalizeInitialCredits = (amount: number | undefined): AccountCreditOption => {
  if (amount === undefined) {
    return DEFAULT_ACCOUNT_CREDITS
  }

  if (!isAccountCreditOption(amount)) {
    throw new ConvexError(`${amount} is not an offered credit amount.`)
  }

  return amount
}
