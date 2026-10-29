import { ConvexError, v } from 'convex/values'
import { DEFAULT_ACCOUNT_STATUS } from '../../src/lib/accounts/accounts'
import { mutation } from '../_generated/server'
import { listCreditsForAccount, openCredits } from '../credits/helpers'
import { accountDocumentSchema, createAccountSchema, updateAccountSchema } from './d'
import {
  getAccountBySlug,
  normalizeAccountName,
  normalizeAccountNotes,
  normalizeAccountSlug,
  normalizeInitialCredits,
  normalizeOptionalAccountEmail,
  normalizePayoutDetails,
  normalizePrimaryContact,
  requireGodIdentity,
  requireStaffIdentity,
  requireTopgIdentity
} from './helpers'

export const create = mutation({
  args: createAccountSchema,
  returns: v.id('accounts'),
  handler: async (ctx, args) => {
    const identity = await requireGodIdentity(ctx)

    const name = normalizeAccountName(args.name)
    const slug = normalizeAccountSlug(args.slug, name)

    if (await getAccountBySlug(ctx, slug)) {
      throw new ConvexError(`An account with the slug "${slug}" already exists.`)
    }

    const now = Date.now()
    const { contact: primaryContact, userId } = await normalizePrimaryContact(ctx, args.primaryContact)
    const initialCredits = normalizeInitialCredits(args.initialCredits)

    const accountId = await ctx.db.insert('accounts', {
      slug,
      name,
      status: args.status ?? DEFAULT_ACCOUNT_STATUS,
      initialCredits,
      payoutDetails: normalizePayoutDetails(args.payoutDetails),
      primaryContact,
      // An account is invoiced on the billing address when it has one and the
      // contact's own address otherwise, so this is never left blank.
      billingEmail: normalizeOptionalAccountEmail(args.billingEmail, 'Billing email') ?? primaryContact.email,
      ownerTokenIdentifier: args.ownerTokenIdentifier ?? identity.tokenIdentifier,
      notes: normalizeAccountNotes(args.notes),
      closedAt: null,
      closedBy: null,
      closeReason: null,
      createdAt: now,
      createdBy: identity.tokenIdentifier,
      updatedAt: now,
      updatedBy: identity.tokenIdentifier
    })

    // Every account gets a wallet at birth, even a zero-credit one: that is
    // what makes a later grant a balance change rather than a first appearance.
    // It is keyed to the contact when they already have an identity, and to the
    // account alone when they do not.
    await openCredits(ctx, {
      accountId,
      accountSlug: slug,
      userId,
      userTokenIdentifier: primaryContact.tokenIdentifier,
      amount: initialCredits,
      reason: 'initial-grant',
      actorTokenIdentifier: identity.tokenIdentifier
    })

    return accountId
  }
})

export const update = mutation({
  args: updateAccountSchema.extend({ id: v.id('accounts') }),
  returns: accountDocumentSchema,
  handler: async (ctx, { id, ...args }) => {
    const identity = await requireStaffIdentity(ctx)
    const existing = await ctx.db.get(id)

    if (!existing) {
      throw new ConvexError('Account not found.')
    }

    const patch: Record<string, unknown> = {
      updatedAt: Date.now(),
      updatedBy: identity.tokenIdentifier
    }

    if (args.name !== undefined) patch.name = normalizeAccountName(args.name)
    if (args.status !== undefined) patch.status = args.status
    if (args.payoutDetails !== undefined) patch.payoutDetails = normalizePayoutDetails(args.payoutDetails)
    if (args.primaryContact !== undefined) {
      const { contact } = await normalizePrimaryContact(ctx, args.primaryContact)
      // An edit that names no user must not drop a link the account already has.
      patch.primaryContact =
        args.primaryContact.firebaseUid === undefined
          ? {
              ...contact,
              tokenIdentifier: existing.primaryContact.tokenIdentifier,
              firebaseUid: existing.primaryContact.firebaseUid,
              userId: existing.primaryContact.userId
            }
          : contact
    }
    if (args.billingEmail !== undefined) {
      patch.billingEmail = normalizeOptionalAccountEmail(args.billingEmail, 'Billing email')
    }
    if (args.notes !== undefined) patch.notes = normalizeAccountNotes(args.notes)

    await ctx.db.patch(id, patch)

    const updated = await ctx.db.get(id)
    if (!updated) throw new ConvexError('Account not found.')
    return updated
  }
})

/** Permanent removal, reserved for `topg`. Closing an account is the usual path. */
export const remove = mutation({
  args: { id: v.id('accounts') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await requireTopgIdentity(ctx)

    // The wallets go with the account. Leaving them would hold a balance for an
    // account that no longer exists.
    for (const wallet of await listCreditsForAccount(ctx, id)) {
      await ctx.db.delete(wallet._id)
    }

    await ctx.db.delete(id)
    return null
  }
})
