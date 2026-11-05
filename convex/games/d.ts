import { v } from 'convex/values'

/**
 * The five games of `src/lib/games.ts`, by the id the app uses. Not
 * `resultGame`: that is the PCSO results vocabulary (`'lotto'`, `'mega'`, …),
 * a different naming of the same draws.
 */
export const gameIdSchema = v.union(
  v.literal('6/42'),
  v.literal('6/45'),
  v.literal('6/49'),
  v.literal('6/55'),
  v.literal('6/58')
)

/** How many numbers a ticket picks, which decides its odds and its prize. */
export const betTypeSchema = v.union(
  v.literal(1),
  v.literal(2),
  v.literal(3),
  v.literal(4),
  v.literal(5),
  v.literal(6)
)

/**
 * One cell of the price grid: a game's bet type, whether it is on sale, what one
 * ticket costs and which stakes a player may choose between. Six per game, so
 * it is a bounded array on the row rather than a table of its own.
 */
export const betTypeConfigSchema = v.object({
  betType: betTypeSchema,
  enabled: v.boolean(),
  ticketCost: v.number(),
  stakes: v.array(v.number())
})

/**
 * Fixed lower-tier payouts for a full six-number jackpot ticket, by how many of
 * the six were matched. Named `matchN` rather than `3`: a Convex object key has
 * to be an identifier, so the numeric keys of `GameConfig.secondary` cannot be
 * stored as they are written in code.
 */
export const secondaryPrizesSchema = v.object({
  match3: v.number(),
  match4: v.number(),
  match5: v.number()
})

/** Stake multiplier for a match-all pick bet, by how many numbers it picks. */
export const pickPayoutSchema = v.object({
  pick1: v.number(),
  pick2: v.number(),
  pick3: v.number(),
  pick4: v.number(),
  pick5: v.number()
})

/**
 * One game as the house configures it. The static `GAMES` record in
 * `src/lib/games.ts` seeds this table and remains the app's fallback, so a
 * deployment with an empty table plays exactly as the code always did.
 *
 * `updatedBy` is the god who last changed the row, by token identifier, the
 * same way the account tables record who acted.
 */
export const gameFields = {
  gameId: gameIdSchema,
  name: v.string(),
  pool: v.number(),
  /** Off hides the game from the switcher and refuses new bets on it. */
  enabled: v.boolean(),
  /** Where the game sits in the rail, ascending. */
  order: v.number(),
  baseJackpot: v.number(),
  rollover: v.number(),
  /** 0 = Sunday. PCSO draw nights for this game. */
  drawDays: v.array(v.number()),
  drawDayLabel: v.string(),
  secondary: secondaryPrizesSchema,
  payout: pickPayoutSchema,
  /** A CSS colour reference, e.g. `var(--chart-2)`, so games re-hue with the theme. */
  accent: v.string(),
  betTypes: v.array(betTypeConfigSchema),
  updatedAt: v.number(),
  updatedBy: v.string()
}
