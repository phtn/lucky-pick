import { ConvexError, v } from 'convex/values'
import { DEFAULT_ACCOUNT_STATUS } from '../../src/lib/accounts/accounts'
import { mutation } from '../_generated/server'
import { listCreditsForAccount } from '../credits/helpers'
import { findPartnerWallets, getPartnerWallets } from '../ledger/wallets'
import { createTopupRequest } from '../money/topups'
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
    const { contact: primaryContact } = await normalizePrimaryContact(ctx, args.primaryContact)
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

    // Every account gets its float and earnings wallets at birth, even a
    // zero-credit one, so a later top-up is a balance change rather than a
    // first appearance. Wallets belong to the account alone: members get none.
    // The opening grant is only promised here. It becomes a pending top-up so
    // a second god has to approve it; nothing is minted by creating an account.
    await getPartnerWallets(ctx, accountId)

    if (initialCredits > 0) {
      await createTopupRequest(ctx, {
        accountId,
        amount: initialCredits,
        paymentReference: null,
        note: 'Opening grant',
        makerTokenIdentifier: identity.tokenIdentifier
      })
    }

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

    // Ledger entries are immutable, so an account that ever moved money (or
    // holds a member wallet) can only be closed. Reads only: removal must not
    // create the wallets it is about to delete.
    const { float, earnings } = await findPartnerWallets(ctx, id)
    const userWallet = await ctx.db
      .query('wallets')
      .withIndex('by_accountId_and_kind', (q) => q.eq('accountId', id).eq('kind', 'user'))
      .first()
    let hasHistory = userWallet !== null

    for (const wallet of [float, earnings]) {
      if (!wallet) continue
      const entry = await ctx.db
        .query('ledgerEntries')
        .withIndex('by_walletId_and_createdAt', (q) => q.eq('walletId', wallet._id))
        .first()
      if (entry) hasHistory = true
    }

    if (hasHistory) {
      throw new ConvexError('This account has ledger history and cannot be deleted. Close it instead.')
    }

    // What is left is unfunded: empty wallets and requests that never minted
    // (an approved request would have left entries, so it was refused above).
    for (const wallet of [float, earnings]) {
      if (wallet) await ctx.db.delete(wallet._id)
    }

    const requests = await ctx.db
      .query('topupRequests')
      .withIndex('by_accountId_and_createdAt', (q) => q.eq('accountId', id))
      .take(100)
    for (const request of requests) {
      await ctx.db.delete(request._id)
    }

    // Legacy credits rows go too until that table is retired.
    for (const wallet of await listCreditsForAccount(ctx, id)) {
      await ctx.db.delete(wallet._id)
    }

    await ctx.db.delete(id)
    return null
  }
})
