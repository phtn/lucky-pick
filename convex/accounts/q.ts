import { v } from 'convex/values'
import { isAccountSlug, isPublicAccountSlug } from '../../src/lib/accounts/accounts'
import { query } from '../_generated/server'
import { accountDocumentSchema, accountStatusSchema } from './d'
import { getAccountBySlug, requireGodIdentity, requireStaffIdentity } from './helpers'

const DEFAULT_LIST_LIMIT = 100
const MAX_LIST_LIMIT = 250

const slugAvailabilityReason = v.union(
  v.literal('available'),
  v.literal('invalid'),
  v.literal('reserved'),
  v.literal('taken')
)

const normalizeListLimit = (limit: number | undefined) => {
  if (limit === undefined || !Number.isFinite(limit)) {
    return DEFAULT_LIST_LIMIT
  }

  return Math.min(Math.max(Math.floor(limit), 1), MAX_LIST_LIMIT)
}

/** The console's roster: newest first, capped, optionally one status only. */
export const listForAsgard = query({
  args: {
    limit: v.optional(v.number()),
    status: v.optional(accountStatusSchema)
  },
  returns: v.array(accountDocumentSchema),
  handler: async (ctx, { limit, status }) => {
    await requireStaffIdentity(ctx)

    const take = normalizeListLimit(limit)

    if (status) {
      return await ctx.db
        .query('accounts')
        .withIndex('by_status_and_createdAt', (q) => q.eq('status', status))
        .order('desc')
        .take(take)
    }

    return await ctx.db.query('accounts').withIndex('by_createdAt').order('desc').take(take)
  }
})

/** Authoritative preflight for the create-account slug field. */
export const checkSlugAvailability = query({
  args: { slug: v.string() },
  returns: v.object({
    slug: v.string(),
    available: v.boolean(),
    reason: slugAvailabilityReason
  }),
  handler: async (ctx, { slug }) => {
    await requireGodIdentity(ctx)

    const candidate = slug.trim().toLowerCase()
    if (!isAccountSlug(candidate)) return { slug: candidate, available: false, reason: 'invalid' as const }
    if (!isPublicAccountSlug(candidate)) return { slug: candidate, available: false, reason: 'reserved' as const }

    const account = await getAccountBySlug(ctx, candidate)

    return {
      slug: candidate,
      available: account === null,
      reason: account ? ('taken' as const) : ('available' as const)
    }
  }
})

export const getBySlug = query({
  args: { slug: v.string() },
  returns: v.union(accountDocumentSchema, v.null()),
  handler: async (ctx, { slug }) => {
    await requireStaffIdentity(ctx)

    return await getAccountBySlug(ctx, slug.trim().toLowerCase())
  }
})
