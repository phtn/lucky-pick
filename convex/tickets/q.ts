import { ConvexError, v } from 'convex/values'
import { canUseAccount } from '../../src/lib/accounts/accounts'
import type { Doc, Id } from '../_generated/dataModel'
import { query } from '../_generated/server'
import { betTypeSchema, gameIdSchema } from '../games/d'
import { getUserByTokenIdentifier } from '../users/q'
import { HOUSE_TICKETS_LIMIT, MY_TICKET_HOUSES_LIMIT, MY_TICKETS_LIMIT, ticketStatusSchema } from './d'

/**
 * The caller's own tickets, newest first. Derived from the identity, so there
 * is no id to probe. Capped rather than paged: it feeds one fixed list.
 */
export const mine = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      ticketId: v.id('tickets'),
      accountId: v.id('accounts'),
      game: gameIdSchema,
      betType: betTypeSchema,
      numbers: v.array(v.number()),
      cost: v.number(),
      status: ticketStatusSchema,
      hits: v.number(),
      prizeWon: v.union(v.number(), v.null()),
      /** `null` for a ticket bought before draws were recorded on tickets. */
      drawDate: v.union(v.string(), v.null()),
      drawTime: v.union(v.string(), v.null()),
      createdAt: v.number()
    })
  ),
  handler: async (ctx, { limit }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new ConvexError('Unauthorized.')

    // A brand-new sign-in reads its tickets before its users row exists.
    const user = await getUserByTokenIdentifier(ctx, identity.tokenIdentifier)
    if (!user) return []

    const take = Math.min(Math.max(Math.floor(limit ?? MY_TICKETS_LIMIT), 1), MY_TICKETS_LIMIT)
    const rows = await ctx.db
      .query('tickets')
      .withIndex('by_userId_and_createdAt', (q) => q.eq('userId', user._id))
      .order('desc')
      .take(take)

    return rows.map((row) => ({
      ticketId: row._id,
      accountId: row.accountId,
      game: row.game,
      betType: row.betType,
      numbers: row.numbers,
      cost: row.cost,
      status: row.status,
      hits: row.hits,
      prizeWon: row.prizeWon ?? null,
      drawDate: row.drawDate ?? null,
      drawTime: row.drawTime ?? null,
      createdAt: row.createdAt
    }))
  }
})

/**
 * The newest tickets placed at every house the caller is the linked contact
 * of, each with the player who bought it. Matched on the identity's token like
 * `accounts.q.myPlayers`, so a stranger gets an empty list rather than anyone's
 * book, and like it only a usable house is listed.
 *
 * The `returns` validator is the privacy boundary: a banker sees a player's
 * display name and picture, never their email, phone or sign-in identifiers.
 */
export const atMyHouses = query({
  args: {},
  returns: v.array(
    v.object({
      accountId: v.id('accounts'),
      name: v.string(),
      /** True when the house holds more tickets than the list carries. */
      truncated: v.boolean(),
      tickets: v.array(
        v.object({
          ticketId: v.id('tickets'),
          userId: v.id('users'),
          playerName: v.string(),
          playerImageUrl: v.union(v.string(), v.null()),
          game: gameIdSchema,
          betType: betTypeSchema,
          numbers: v.array(v.number()),
          cost: v.number(),
          status: ticketStatusSchema,
          hits: v.number(),
          prizeWon: v.union(v.number(), v.null()),
          drawDate: v.union(v.string(), v.null()),
          drawTime: v.union(v.string(), v.null()),
          createdAt: v.number()
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
      .take(MY_TICKET_HOUSES_LIMIT)

    // One player usually holds many of a house's tickets, so each is read once.
    const players = new Map<Id<'users'>, Doc<'users'> | null>()
    const readPlayer = async (userId: Id<'users'>) => {
      if (!players.has(userId)) players.set(userId, await ctx.db.get('users', userId))
      return players.get(userId) ?? null
    }

    const houses = []
    for (const account of accounts) {
      if (!canUseAccount(account.status)) continue

      const rows = await ctx.db
        .query('tickets')
        .withIndex('by_accountId_and_createdAt', (q) => q.eq('accountId', account._id))
        .order('desc')
        .take(HOUSE_TICKETS_LIMIT + 1)

      const tickets = []
      for (const row of rows.slice(0, HOUSE_TICKETS_LIMIT)) {
        const player = await readPlayer(row.userId)
        tickets.push({
          ticketId: row._id,
          userId: row.userId,
          playerName: player?.nickname ?? player?.name ?? player?.preferredUsername ?? 'Player',
          playerImageUrl: player?.imageUrl ?? null,
          game: row.game,
          betType: row.betType,
          numbers: row.numbers,
          cost: row.cost,
          status: row.status,
          hits: row.hits,
          prizeWon: row.prizeWon ?? null,
          drawDate: row.drawDate ?? null,
          drawTime: row.drawTime ?? null,
          createdAt: row.createdAt
        })
      }

      houses.push({
        accountId: account._id,
        name: account.name,
        truncated: rows.length > HOUSE_TICKETS_LIMIT,
        tickets
      })
    }

    return houses.sort((a, b) => a.name.localeCompare(b.name))
  }
})
