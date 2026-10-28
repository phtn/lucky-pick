import { ConvexError, v } from 'convex/values'
import { DEFAULT_ACCOUNT_PLAN, DEFAULT_ACCOUNT_STATUS } from '../../src/lib/accounts/accounts'
import { mutation } from '../_generated/server'
import { accountDocumentSchema, createAccountSchema, updateAccountSchema } from './d'
import {
  getAccountBySlug,
  normalizeAccountName,
  normalizeAccountNotes,
  normalizeAccountSlug,
  normalizeOptionalAccountEmail,
  normalizeOrganization,
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

    return await ctx.db.insert('accounts', {
      slug,
      name,
      status: args.status ?? DEFAULT_ACCOUNT_STATUS,
      plan: args.plan ?? DEFAULT_ACCOUNT_PLAN,
      organization: normalizeOrganization(args.organization),
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
    if (args.plan !== undefined) patch.plan = args.plan
    if (args.organization !== undefined) patch.organization = normalizeOrganization(args.organization)
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
    await ctx.db.delete(id)
    return null
  }
})
