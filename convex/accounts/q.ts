import { ConvexError, v } from 'convex/values'
import { canUseAccount, isAccountSlug, isPublicAccountSlug } from '../../src/lib/accounts/accounts'
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
      balance: v.number(),
      // The house's own logo, `null` until one is set.
      logoUrl: v.union(v.string(), v.null()),
      // The primary contact's avatar, which stands in for a house with no logo
      // of its own. It is the only field of theirs this validator lets out:
      // their name, email and phone stay in, as the note on `myHouses` requires.
      contactImageUrl: v.union(v.string(), v.null())
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

    // The contact's photo is read from their live `users` row rather than from
    // `primaryContact.imageUrl`: that snapshot is taken when the account is
    // created, before the contact has ever signed in, and linking them later
    // deliberately rewrites only their identity fields. So the snapshot is
    // frozen at whatever the console was told — usually nothing — while the
    // `users` row is refreshed on every sign-in. Only fetched for a house with
    // no logo of its own, so a fully-branded roster reads no extra documents.
    const contactPhotos = new Map<Id<'users'>, string | null>()
    await Promise.all(
      accounts
        .filter((account) => !account.logoUrl && account.primaryContact.userId !== null)
        .map(async (account) => {
          const contactId = account.primaryContact.userId as Id<'users'>
          if (contactPhotos.has(contactId)) return
          const contact = await ctx.db.get(contactId)
          contactPhotos.set(contactId, contact?.imageUrl ?? null)
        })
    )

    return accounts
      .map((account) => ({
        accountId: account._id,
        slug: account.slug,
        name: account.name,
        status: account.status,
        balance: balances.get(account._id) ?? 0,
        logoUrl: account.logoUrl ?? null,
        contactImageUrl:
          (account.primaryContact.userId === null
            ? null
            : contactPhotos.get(account.primaryContact.userId) ?? null) ??
          account.primaryContact.imageUrl ??
          null
      }))
      .sort(compareBankerRows)
  }
})

/**
 * The houses the caller is the linked primary contact for, so `/me` can offer to
 * confirm them. Matches on the identity's token directly: it needs no `users`
 * row, so a contact who has only just signed in still sees their houses. Like
 * `listBankers`, the explicit `returns` validator is the security boundary: it
 * keeps payout details and contact phone numbers out. Do not swap it for
 * `accountDocumentSchema`.
 */
export const myHouses = query({
  args: {},
  returns: v.array(
    v.object({
      accountId: v.id('accounts'),
      slug: v.string(),
      name: v.string(),
      status: accountStatusSchema,
      confirmedAt: v.union(v.number(), v.null())
    })
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new ConvexError('Unauthorized.')

    const accounts = await ctx.db
      .query('accounts')
      .withIndex('by_primaryContact_tokenIdentifier', (q) =>
        q.eq('primaryContact.tokenIdentifier', identity.tokenIdentifier)
      )
      .take(MAX_LIST_LIMIT)

    return accounts.map((account) => ({
      accountId: account._id,
      slug: account.slug,
      name: account.name,
      status: account.status,
      confirmedAt: account.confirmedAt ?? null
    }))
  }
})

/** How many players of one house the admin console lists. */
const PLAYER_LIST_LIMIT = 200

/**
 * The players of every house the caller is the linked contact of: everyone who
 * has chosen that house to play against, with what they hold there. Matched on
 * the identity's token like `myHouses`, so a stranger gets an empty list rather
 * than anyone's roster. Only a usable house is listed: a pending, suspended or
 * closed one has nobody playing at it.
 *
 * The `returns` validator is the privacy boundary. A banker sees a player's
 * display name and picture, never their email, phone or sign-in identifiers.
 */
export const myPlayers = query({
  args: {},
  returns: v.array(
    v.object({
      accountId: v.id('accounts'),
      name: v.string(),
      /** True when the house has more players than the list carries. */
      truncated: v.boolean(),
      players: v.array(
        v.object({
          userId: v.id('users'),
          name: v.string(),
          imageUrl: v.union(v.string(), v.null()),
          joinedAt: v.number(),
          balance: v.number(),
          held: v.number()
        })
      )
    })
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new ConvexError('Unauthorized.')

    const accounts = await ctx.db
      .query('accounts')
      .withIndex('by_primaryContact_tokenIdentifier', (q) =>
        q.eq('primaryContact.tokenIdentifier', identity.tokenIdentifier)
      )
      .take(MAX_LIST_LIMIT)

    const houses = []
    for (const account of accounts) {
      if (!canUseAccount(account.status)) continue

      const users = await ctx.db
        .query('users')
        .withIndex('by_selectedAccountId', (q) => q.eq('selectedAccountId', account._id))
        .take(PLAYER_LIST_LIMIT + 1)

      const players = []
      for (const user of users.slice(0, PLAYER_LIST_LIMIT)) {
        const wallet = await ctx.db
          .query('wallets')
          .withIndex('by_accountId_and_userId', (q) => q.eq('accountId', account._id).eq('userId', user._id))
          .unique()

        players.push({
          userId: user._id,
          name: user.nickname ?? user.name ?? user.preferredUsername ?? 'Player',
          imageUrl: user.imageUrl ?? null,
          joinedAt: user.createdAt,
          balance: wallet?.available ?? 0,
          held: wallet?.held ?? 0
        })
      }

      houses.push({
        accountId: account._id,
        name: account.name,
        truncated: users.length > PLAYER_LIST_LIMIT,
        players: players.sort((a, b) => a.name.localeCompare(b.name))
      })
    }

    return houses.sort((a, b) => a.name.localeCompare(b.name))
  }
})
