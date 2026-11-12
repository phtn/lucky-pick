import { GAMES, GAME_IDS, type BetType, type GameConfig, type GameId } from './games'

/**
 * What the house may change about a game without a deploy: whether it is on
 * sale at all, which bet types it sells, what one ticket of each costs, and
 * which stakes a player may pick between.
 *
 * `src/lib/games.ts` stays the shape of a game — pool, odds, payout ladder —
 * and these are the knobs on top of it. The Convex `games` table stores exactly
 * this, seeded from the static config, so a deployment that has never been
 * configured behaves as the code always did.
 */

/** Every bet type the games sell, ascending. `lotto.ts` re-exports it as `BET_TYPES`. */
export const BET_TYPE_VALUES: BetType[] = [1, 2, 3, 4, 5, 6]

/** A ticket price is whole pesos: nothing here charges centavos. */
export const MIN_TICKET_COST = 1
export const MAX_TICKET_COST = 50

/**
 * A cell offers its ticket price and the next whole multiples of it: a ₱30
 * ticket is staked at 30, 60, 90 or 120. Setting a price resets the cell's
 * stakes to exactly these.
 */
export const STAKE_MULTIPLES: number[] = [1, 2, 3, 4]

/** The largest stake a cell can offer: the dearest ticket at the highest multiple. */
export const MAX_STAKE = MAX_TICKET_COST * Math.max(...STAKE_MULTIPLES)

/** How many stakes one cell may offer. Enough for the PCSO history, not a menu. */
export const MAX_STAKE_OPTIONS = 8

/** The three prices the game has charged, newest last. */
export const DEFAULT_STAKES: number[] = [20, 24, 25]

/** What a ticket costs where nothing has been configured: today's PCSO price. */
export const DEFAULT_TICKET_COST = 25

export interface BetTypeSettings {
  betType: BetType
  /** Off hides the bet type everywhere a player could buy it. */
  enabled: boolean
  /** What one ticket of this bet type costs, in whole pesos. */
  ticketCost: number
  /** The prices a player may choose between, ascending; always holds `ticketCost`. */
  stakes: number[]
}

export interface GameSettings {
  gameId: GameId
  /** Off hides the game from the switcher and refuses new bets on it. */
  enabled: boolean
  /** Where the game sits in the rail, ascending. */
  order: number
  betTypes: BetTypeSettings[]
}

export const isTicketCost = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= MIN_TICKET_COST && value <= MAX_TICKET_COST

/** A stake is whole pesos too, but may run past a ticket price, up to `MAX_STAKE`. */
export const isStake = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= MIN_TICKET_COST && value <= MAX_STAKE

/** The stakes a price implies: the price itself and its multiples, ascending. */
export const stakesForCost = (ticketCost: number): number[] => STAKE_MULTIPLES.map((multiple) => multiple * ticketCost)

/**
 * Ascending, de-duplicated, stakes only, capped at `MAX_STAKE_OPTIONS`. A cell
 * always offers at least one stake, so an empty list falls back to the cost it
 * is being stored against rather than leaving a bet type unbuyable.
 */
export function normalizeStakes(stakes: readonly number[], ticketCost: number): number[] {
  const valid = stakes.filter(isStake)
  const unique = [...new Set(isTicketCost(ticketCost) ? [...valid, ticketCost] : valid)]

  return unique.sort((a, b) => a - b).slice(0, MAX_STAKE_OPTIONS)
}

/** Every bet type a game can sell, all on, all at the current price. */
export const defaultBetTypeSettings = (): BetTypeSettings[] =>
  BET_TYPE_VALUES.map((betType) => ({
    betType,
    enabled: true,
    ticketCost: DEFAULT_TICKET_COST,
    stakes: [...DEFAULT_STAKES]
  }))

/** The five games, in the order `GAME_IDS` lists them, all on sale. */
export const defaultGameSettings = (): GameSettings[] =>
  GAME_IDS.map((gameId, index) => ({ gameId, enabled: true, order: index, betTypes: defaultBetTypeSettings() }))

export const defaultSettingsFor = (gameId: GameId): GameSettings => ({
  gameId,
  enabled: true,
  order: Math.max(GAME_IDS.indexOf(gameId), 0),
  betTypes: defaultBetTypeSettings()
})

/** One game's settings, with every bet type present and in `BET_TYPE_VALUES` order. */
export function fillGameSettings(settings: GameSettings): GameSettings {
  const stored = new Map(settings.betTypes.map((bet) => [bet.betType, bet]))

  return {
    ...settings,
    betTypes: BET_TYPE_VALUES.map(
      (betType) =>
        stored.get(betType) ?? {
          betType,
          enabled: true,
          ticketCost: DEFAULT_TICKET_COST,
          stakes: [...DEFAULT_STAKES]
        }
    )
  }
}

export type GameSettingsMap = Record<GameId, GameSettings>

/**
 * The settings every reader works from: stored rows where they exist, defaults
 * everywhere else. A game the table has never heard of is therefore on sale at
 * the code's own prices, which is what the app did before the table existed.
 */
export function resolveGameSettings(rows: readonly GameSettings[] | undefined): GameSettingsMap {
  const stored = new Map(rows?.map((row) => [row.gameId, row]) ?? [])

  return GAME_IDS.reduce((map, gameId) => {
    const row = stored.get(gameId)
    map[gameId] = fillGameSettings(row ?? defaultSettingsFor(gameId))
    return map
  }, {} as GameSettingsMap)
}

export const betTypeSettings = (settings: GameSettings, betType: BetType): BetTypeSettings =>
  settings.betTypes.find((bet) => bet.betType === betType) ?? {
    betType,
    enabled: true,
    ticketCost: DEFAULT_TICKET_COST,
    stakes: [...DEFAULT_STAKES]
  }

/** The games a player may buy into, in rail order. Never empty — see below. */
export function enabledGameIds(map: GameSettingsMap): GameId[] {
  const enabled = GAME_IDS.filter((gameId) => map[gameId].enabled).sort((a, b) => map[a].order - map[b].order)

  // A console that switched every game off would leave the app with no board to
  // show and no way back in. The first game stays buyable rather than rendering
  // an empty simulator.
  return enabled.length > 0 ? enabled : [GAME_IDS[0]]
}

/** The bet types a game sells, in `BET_TYPE_VALUES` order; never empty, same reason. */
export function enabledBetTypes(settings: GameSettings): BetType[] {
  const enabled = settings.betTypes.filter((bet) => bet.enabled).map((bet) => bet.betType)
  return enabled.length > 0 ? enabled : [BET_TYPE_VALUES[BET_TYPE_VALUES.length - 1]]
}

/** What the app charges for one ticket of this cell. */
export const ticketCostFor = (map: GameSettingsMap, gameId: GameId, betType: BetType): number =>
  betTypeSettings(map[gameId], betType).ticketCost

/** The stakes the app offers for this cell, ascending. */
export const stakesFor = (map: GameSettingsMap, gameId: GameId, betType: BetType): number[] => {
  const bet = betTypeSettings(map[gameId], betType)
  return normalizeStakes(bet.stakes, bet.ticketCost)
}

/** The games a game record covers, for a console that lists them side by side. */
export const gameConfigFor = (gameId: GameId): GameConfig => GAMES[gameId]

/** `20, 24, 25` — how a stake list reads in one line. */
export const formatStakes = (stakes: readonly number[]) => stakes.map((stake) => `₱${stake}`).join(' · ')
