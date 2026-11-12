import { ConvexError } from 'convex/values'
import { GAMES, GAME_IDS, type BetType, type GameId } from '../../src/lib/games'
import {
  BET_TYPE_VALUES,
  DEFAULT_STAKES,
  DEFAULT_TICKET_COST,
  MAX_STAKE,
  MAX_STAKE_OPTIONS,
  MAX_TICKET_COST,
  MIN_TICKET_COST,
  isStake,
  isTicketCost,
  normalizeStakes
} from '../../src/lib/game-settings'
import type { Doc } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import { isGod, isPlatformStaff } from '../lib/auth'

export const getGameByGameId = async (ctx: QueryCtx | MutationCtx, gameId: GameId) =>
  await ctx.db
    .query('games')
    .withIndex('by_gameId', (q) => q.eq('gameId', gameId))
    .unique()

/**
 * Changing what a game costs or whether it is on sale is a god action, the same
 * bar provisioning an account clears. Reading the grid is not: the app itself
 * needs the prices, so `list` is open.
 */
export const requireGodIdentity = async (ctx: QueryCtx | MutationCtx) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity || !isGod(identity)) throw new ConvexError('This action requires a god account.')

  return identity
}

export const requireStaffIdentity = async (ctx: QueryCtx | MutationCtx) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity || !isPlatformStaff(identity)) throw new ConvexError('Unauthorized.')

  return identity
}

/** The row a game starts life as: the static config, every bet type on sale. */
export function defaultGameRow(gameId: GameId, updatedBy: string, now: number) {
  const game = GAMES[gameId]

  return {
    gameId,
    name: game.name,
    pool: game.pool,
    enabled: true,
    order: Math.max(GAME_IDS.indexOf(gameId), 0),
    baseJackpot: game.baseJackpot,
    rollover: game.rollover,
    drawDays: [...game.drawDays],
    drawDayLabel: game.drawDayLabel,
    secondary: { match3: game.secondary[3], match4: game.secondary[4], match5: game.secondary[5] },
    payout: {
      pick1: game.payout[1],
      pick2: game.payout[2],
      pick3: game.payout[3],
      pick4: game.payout[4],
      pick5: game.payout[5]
    },
    accent: game.accent,
    betTypes: BET_TYPE_VALUES.map((betType) => ({
      betType,
      enabled: true,
      ticketCost: DEFAULT_TICKET_COST,
      stakes: [...DEFAULT_STAKES]
    })),
    updatedAt: now,
    updatedBy
  }
}

/**
 * The row for a game, inserting the seeded default when the table has never
 * held one. A console that edits a never-configured game therefore writes the
 * change rather than failing on a missing row.
 */
export async function ensureGameRow(ctx: MutationCtx, gameId: GameId, updatedBy: string): Promise<Doc<'games'>> {
  const existing = await getGameByGameId(ctx, gameId)
  if (existing) return existing

  const id = await ctx.db.insert('games', defaultGameRow(gameId, updatedBy, Date.now()))
  const inserted = await ctx.db.get('games', id)
  if (!inserted) throw new ConvexError('The game could not be created.')

  return inserted
}

/** A price the console sent, or a refusal naming the bound it broke. */
export function readTicketCost(value: number): number {
  if (!isTicketCost(value)) {
    throw new ConvexError(`A ticket must cost a whole number of pesos between ${MIN_TICKET_COST} and ${MAX_TICKET_COST}.`)
  }

  return value
}

/**
 * The stakes a cell offers, as they will be stored: ascending, de-duplicated
 * and capped. An empty list is refused rather than silently filled, since a
 * console that sent one is asking for a cell nobody could buy from; the cost
 * itself is always admitted, so a list of just that cost is valid.
 */
export function readStakes(stakes: readonly number[], ticketCost: number): number[] {
  if (stakes.some((stake) => !isStake(stake))) {
    throw new ConvexError(`Every stake must be a whole number of pesos between ${MIN_TICKET_COST} and ${MAX_STAKE}.`)
  }
  if (stakes.length > MAX_STAKE_OPTIONS) {
    throw new ConvexError(`A bet type may offer at most ${MAX_STAKE_OPTIONS} stakes.`)
  }

  return normalizeStakes(stakes, ticketCost)
}

type BetTypeCell = Doc<'games'>['betTypes'][number]

const defaultCell = (betType: BetType): BetTypeCell => ({
  betType,
  enabled: true,
  ticketCost: DEFAULT_TICKET_COST,
  stakes: [...DEFAULT_STAKES]
})

/**
 * The grid with one cell changed, the rest left as it stands. A row written
 * before a bet type existed is filled with that bet type's default rather than
 * dropping it, so the stored grid always holds all six.
 */
export function withBetType(row: Doc<'games'>, betType: BetType, change: (cell: BetTypeCell) => BetTypeCell): BetTypeCell[] {
  return BET_TYPE_VALUES.map((value) => {
    const cell = row.betTypes.find((stored) => stored.betType === value) ?? defaultCell(value)
    return value === betType ? change({ ...cell }) : cell
  })
}
