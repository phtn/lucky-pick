import { ConvexError, v } from 'convex/values'
import { canUseAccount } from '../../src/lib/accounts/accounts'
import { DEFAULT_STAKES, DEFAULT_TICKET_COST, normalizeStakes } from '../../src/lib/game-settings'
import { GAMES } from '../../src/lib/games'
import { mutation } from '../_generated/server'
import { betTypeSchema, gameIdSchema } from '../games/d'
import { getGameByGameId } from '../games/helpers'
import { post } from '../ledger/post'
import { findUserWallet } from '../ledger/wallets'
import { getUserByTokenIdentifier } from '../users/q'
import { MAX_TICKETS_PER_PURCHASE } from './d'

/**
 * Buys one or more tickets with the caller's credits at the house they have
 * chosen. Nothing about the purchase is taken on trust: the house is read from
 * the player's own `users` row, the price must be one the house offers for that
 * game and bet type, and every pick is checked against the game's pool.
 *
 * The stake is not spent yet. It moves from the wallet's `available` to its
 * `held` bucket (`ticketHold`), where it waits for the draw that settles the
 * ticket. A wallet's floor is zero, so a player cannot buy more than they hold.
 *
 * `requestId` is made up by the client once per press, so a retried request
 * replays the same purchase instead of buying twice.
 */
export const buy = mutation({
  args: {
    game: gameIdSchema,
    betType: betTypeSchema,
    cost: v.number(),
    picks: v.array(v.array(v.number())),
    requestId: v.string()
  },
  returns: v.object({ bought: v.number(), spent: v.number() }),
  handler: async (ctx, { game, betType, cost, picks, requestId }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new ConvexError('Sign in to buy tickets.')

    const user = await getUserByTokenIdentifier(ctx, identity.tokenIdentifier)
    if (!user) throw new ConvexError('Your profile is still being set up. Try again in a moment.')

    if (!/^[A-Za-z0-9-]{8,64}$/.test(requestId)) {
      throw new ConvexError('This request is malformed. Reload and try again.')
    }
    if (picks.length < 1 || picks.length > MAX_TICKETS_PER_PURCHASE) {
      throw new ConvexError(`Buy between 1 and ${MAX_TICKETS_PER_PURCHASE} tickets at a time.`)
    }

    if (!user.selectedAccountId) throw new ConvexError('Choose a banker to play against first.')
    const account = await ctx.db.get('accounts', user.selectedAccountId)
    if (!account || !canUseAccount(account.status)) {
      throw new ConvexError('Your banker is not taking bets right now. Choose another.')
    }

    // An unseeded `games` table plays as the static config does: every game and
    // bet type on sale at the default price.
    const row = await getGameByGameId(ctx, game)
    const cell = row?.betTypes.find((stored) => stored.betType === betType)
    if (row?.enabled === false || cell?.enabled === false) {
      throw new ConvexError('That game is not on sale right now.')
    }
    const stakes = normalizeStakes(cell?.stakes ?? DEFAULT_STAKES, cell?.ticketCost ?? DEFAULT_TICKET_COST)
    if (!stakes.includes(cost)) {
      throw new ConvexError('That stake is not offered for this bet. Reload to see the current prices.')
    }

    const pool = row?.pool ?? GAMES[game].pool
    const tickets = picks.map((pick) => {
      const numbers = [...pick].sort((a, b) => a - b)
      const valid =
        numbers.length === betType &&
        new Set(numbers).size === numbers.length &&
        numbers.every((n) => Number.isInteger(n) && n >= 1 && n <= pool)
      if (!valid) {
        throw new ConvexError(`Each ticket needs ${betType} different numbers from 1 to ${pool}.`)
      }
      return numbers
    })

    const total = cost * tickets.length
    const wallet = await findUserWallet(ctx, account._id, user._id)
    if (!wallet || wallet.available < total) {
      const have = wallet?.available ?? 0
      throw new ConvexError(
        `You have ${have.toLocaleString('en-US')} credits at ${account.name}, and this costs ${total.toLocaleString('en-US')}.`
      )
    }

    const { replayed } = await post(ctx, {
      kind: 'ticketHold',
      idempotencyKey: `ticket-buy:${user._id}:${requestId}`,
      actorTokenIdentifier: identity.tokenIdentifier,
      accountId: account._id,
      ref: null,
      memo: `${game} · ${tickets.length} ${tickets.length === 1 ? 'ticket' : 'tickets'}`,
      legs: [
        { walletId: wallet._id, bucket: 'available', amount: -total },
        { walletId: wallet._id, bucket: 'held', amount: total }
      ]
    })

    // A replay already wrote its tickets the first time.
    if (!replayed) {
      const now = Date.now()
      for (const numbers of tickets) {
        await ctx.db.insert('tickets', {
          userId: user._id,
          accountId: account._id,
          game,
          betType,
          numbers,
          cost,
          status: 'pending',
          hits: 0,
          createdAt: now
        })
      }
    }

    return { bought: tickets.length, spent: total }
  }
})
