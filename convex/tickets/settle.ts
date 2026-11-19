import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import { GAMES, betPrize, type BetType, type GameConfig } from '../../src/lib/games'
import { internal } from '../_generated/api'
import type { Doc } from '../_generated/dataModel'
import { internalMutation, type MutationCtx } from '../_generated/server'
import { gameIdSchema } from '../games/d'
import { getGameByGameId } from '../games/helpers'
import { post } from '../ledger/post'
import { findUserWallet, getPartnerWallets } from '../ledger/wallets'
import { RESULT_GAME_IDS } from './d'

/** Tickets one settlement transaction handles; the rest continue in a fresh one. */
export const SETTLE_BATCH = 50

const SETTLER = 'system:settlement'

type PrizeRules = Pick<GameConfig, 'payout' | 'secondary'>

/**
 * What a ticket won against a draw — the same rules the board plays by
 * (`calcPrize` in `src/Tickets.btsx`):
 *
 * - A six-number jackpot ticket pays the draw's jackpot on 6 hits, and the
 *   game's fixed lower tiers on 5, 4 or 3.
 * - A pick bet (1–5 numbers) wins only when every number it holds is drawn,
 *   and pays its stake times the game's multiplier for that size.
 */
export function ticketPrize(
  ticket: Pick<Doc<'tickets'>, 'betType' | 'numbers' | 'cost'>,
  drawn: readonly number[],
  rules: PrizeRules,
  jackpot: number
): { hits: number; prize: number } {
  const drawnSet = new Set(drawn)
  const hits = ticket.numbers.filter((n) => drawnSet.has(n)).length
  if (ticket.betType === 6) {
    if (hits === 6) return { hits, prize: jackpot }
    if (hits >= 3) return { hits, prize: rules.secondary[hits as 3 | 4 | 5] }
    return { hits, prize: 0 }
  }
  const won = hits === ticket.betType
  return { hits, prize: won ? betPrize(rules as GameConfig, ticket.betType as BetType, jackpot, ticket.cost) : 0 }
}

/** The ticket-side game a stored PCSO result settles, or null for a digit game nobody can bet on. */
export const ticketGameForResult = (game: Doc<'historicalResults'>['game']) =>
  (RESULT_GAME_IDS as Record<string, Doc<'tickets'>['game']>)[game] ?? null

/** The PCSO result a draw settles against: one per game and date for the six-ball games. */
async function findResult(ctx: MutationCtx, game: Doc<'tickets'>['game'], drawDate: string) {
  const resultGame = (Object.entries(RESULT_GAME_IDS) as [Doc<'historicalResults'>['game'], string][]).find(
    ([, ticketGame]) => ticketGame === game
  )?.[0]
  if (!resultGame) return null
  return await ctx.db
    .query('historicalResults')
    .withIndex('by_game_and_date', (q) => q.eq('game', resultGame).eq('date', drawDate))
    .first()
}

/**
 * Settle one batch of a draw's pending tickets, then hand the rest to a fresh
 * transaction. Each ticket is one `ticketCapture`: its stake leaves the
 * player's `held` for the house's earnings, and a prize, if any, leaves the
 * house's earnings for the player's `available` — the flow `post()` was built
 * for. Keyed per ticket, so a draw scheduled twice settles each ticket once.
 *
 * A ticket whose wallet is frozen (or missing) is left pending and passed
 * over; the next scheduling of its draw tries it again.
 */
export const settleDraw = internalMutation({
  args: {
    game: gameIdSchema,
    drawDate: v.string(),
    paginationOpts: v.optional(paginationOptsValidator)
  },
  returns: v.object({ settled: v.number(), won: v.number(), skipped: v.number(), done: v.boolean() }),
  handler: async (ctx, { game, drawDate, paginationOpts }) => {
    const result = await findResult(ctx, game, drawDate)
    // No result yet (or one imported without numbers): nothing can settle.
    if (!result?.numbers) return { settled: 0, won: 0, skipped: 0, done: true }

    const row = await getGameByGameId(ctx, game)
    const rules: PrizeRules = { payout: row?.payout ? toPayout(row.payout) : GAMES[game].payout, secondary: row?.secondary ? toSecondary(row.secondary) : GAMES[game].secondary }
    // The jackpot paid is the one PCSO posted for this draw, in whole credits.
    const jackpot = Math.round(result.jackpotCents / 100)

    const page = await ctx.db
      .query('tickets')
      .withIndex('by_game_and_drawDate_and_status', (q) =>
        q.eq('game', game).eq('drawDate', drawDate).eq('status', 'pending')
      )
      .paginate(paginationOpts ?? { numItems: SETTLE_BATCH, cursor: null })

    let settled = 0, won = 0, skipped = 0
    const now = Date.now()
    for (const ticket of page.page) {
      const wallet = await findUserWallet(ctx, ticket.accountId, ticket.userId)
      const { earnings } = await getPartnerWallets(ctx, ticket.accountId)
      if (!wallet || wallet.status !== 'active' || earnings.status !== 'active' || wallet.held < ticket.cost) {
        console.warn(`Settlement skipped ticket ${ticket._id}: its wallet is missing, frozen or short of the held stake.`)
        skipped++
        continue
      }

      const { hits, prize } = ticketPrize(ticket, result.numbers, rules, jackpot)
      await post(ctx, {
        kind: 'ticketCapture',
        idempotencyKey: `ticket-settle:${ticket._id}`,
        actorTokenIdentifier: SETTLER,
        accountId: ticket.accountId,
        ref: null,
        memo: `${game} · ${drawDate} · ${prize > 0 ? `won ${prize.toLocaleString('en-US')}` : 'lost'}`,
        legs: [
          { walletId: wallet._id, bucket: 'held', amount: -ticket.cost },
          { walletId: earnings._id, bucket: 'available', amount: ticket.cost },
          ...(prize > 0
            ? [
                { walletId: earnings._id, bucket: 'available' as const, amount: -prize },
                { walletId: wallet._id, bucket: 'available' as const, amount: prize }
              ]
            : [])
        ]
      })
      await ctx.db.patch(ticket._id, {
        status: prize > 0 ? 'won' : 'lost',
        hits,
        ...(prize > 0 ? { prizeWon: prize } : {}),
        settledAt: now
      })
      settled++
      if (prize > 0) won++
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.tickets.settle.settleDraw, {
        game,
        drawDate,
        paginationOpts: { numItems: SETTLE_BATCH, cursor: page.continueCursor }
      })
    }
    if (settled || skipped) console.log(`Settled ${game} ${drawDate}: ${settled} tickets (${won} won), ${skipped} skipped`)
    return { settled, won, skipped, done: page.isDone }
  }
})

// The stored rows name their keys `pickN` / `matchN`; the prize rules use numbers.
const toPayout = (p: Doc<'games'>['payout']): GameConfig['payout'] => ({ 1: p.pick1, 2: p.pick2, 3: p.pick3, 4: p.pick4, 5: p.pick5 })
const toSecondary = (s: Doc<'games'>['secondary']): GameConfig['secondary'] => ({ 3: s.match3, 4: s.match4, 5: s.match5 })

/** Schedule settlement of each draw, ignoring results nobody can bet on. */
export async function scheduleSettlements(
  ctx: Pick<MutationCtx, 'scheduler'>,
  draws: Iterable<{ game: Doc<'historicalResults'>['game']; date: string }>
) {
  const seen = new Set<string>()
  for (const { game, date } of draws) {
    const ticketGame = ticketGameForResult(game)
    const key = `${ticketGame}:${date}`
    if (!ticketGame || seen.has(key)) continue
    seen.add(key)
    await ctx.scheduler.runAfter(0, internal.tickets.settle.settleDraw, { game: ticketGame, drawDate: date })
  }
}
