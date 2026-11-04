import { ConvexError, v } from 'convex/values'
import { isAccountSlug, isPublicAccountSlug } from '../../src/lib/accounts/accounts'
import { compareBankerRows } from '../../src/lib/accounts/bankers'
import type { Id } from '../_generated/dataModel'
import { query } from '../_generated/server'
import { listCreditsForUser } from '../credits/helpers'
import { getUserByTokenIdentifier } from '../users/q'
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

const BANKER_STATUSES = ['pending', 'confirmed', 'active', 'suspended'] as const

/**
 * The player-facing house roster. This is the only read of `accounts` open to a
 * player, so the explicit `returns` validator below is the security boundary:
 * Convex enforces it at runtime, which keeps payout details, contacts, notes and
 * owner identifiers out of reach even if the document grows. Do not swap it for
 * `accountDocumentSchema`.
 */
export const listBankers = query({
  args: {},
  returns: v.array(
    v.object({
      accountId: v.id('accounts'),
      slug: v.string(),
      name: v.string(),
      status: accountStatusSchema,
      balance: v.number()
    })
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new ConvexError('Unauthorized.')

    // A signed-in caller with no `users` row yet simply holds no credits anywhere.
    const user = await getUserByTokenIdentifier(ctx, identity.tokenIdentifier)

    // Keyed to a non-null userId, so an account's unlinked opening row never counts as the caller's.
    const balances = new Map<Id<'accounts'>, number>()
    if (user) {
      for (const credits of await listCreditsForUser(ctx, user._id)) {
        balances.set(credits.accountId, (balances.get(credits.accountId) ?? 0) + credits.balance)
      }
    }

    // `closed` is never read: each status is its own indexed take.
    const accounts = (
      await Promise.all(
        BANKER_STATUSES.map((status) =>
          ctx.db
            .query('accounts')
            .withIndex('by_status_and_createdAt', (q) => q.eq('status', status))
            .take(MAX_LIST_LIMIT)
        )
      )
    ).flat()

    return accounts
      .map((account) => ({
        accountId: account._id,
        slug: account.slug,
        name: account.name,
        status: account.status,
        balance: balances.get(account._id) ?? 0
      }))
      .sort(compareBankerRows)
  }
})
