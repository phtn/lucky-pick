import { v } from 'convex/values'

/**
 * Most ticket details one row keeps. The game allows 2,000,000 tickets in a
 * draw, but Convex caps an array at 8192 entries and a document at 1MB, so the
 * row holds only the plays worth showing while its aggregates cover them all.
 */
export const TICKET_DETAIL_LIMIT = 50

/** Rows kept per user; `record` deletes the oldest past this, bounding a long session. */
export const PLAY_HISTORY_LIMIT = 200

/** Rows `mine` returns when the caller does not say how many. */
export const DEFAULT_PLAY_PAGE = 50

/**
 * Length bounds `record` applies to the arrays and strings a client sends. It
 * is a public mutation, so without these a signed-in caller could store a
 * ~1MB row: the app only ever sends six balls, six numbers a ticket, a name
 * `addPlayer` already cuts to 12, and the short hex strings of a `DrawSeed`.
 * Over-long input is trimmed rather than refused — a practice row is history,
 * not money, so it is not worth an error (the same reasoning as `tickets`).
 */
export const DRAWN_BALL_LIMIT = 6
export const TICKET_NUMBER_LIMIT = 6
export const PLAYER_NAME_LIMIT = 24
export const SEED_STRING_LIMIT = 128

/**
 * The five games in `src/lib/games.ts`. Not `resultGame`: that is the PCSO
 * results vocabulary (`'lotto'`, `'mega'`, ...), a different naming of games.
 */
export const practiceGameSchema = v.union(
  v.literal('6/42'),
  v.literal('6/45'),
  v.literal('6/49'),
  v.literal('6/55'),
  v.literal('6/58')
)

export const practiceModeSchema = v.union(v.literal('solo'), v.literal('party'))

/** How many numbers a ticket picks, which decides its odds and prize. */
export const practiceBetTypeSchema = v.union(
  v.literal(1),
  v.literal(2),
  v.literal(3),
  v.literal(4),
  v.literal(5),
  v.literal(6)
)

/**
 * The `DrawSeed` of `src/lib/rng.ts`, which makes a simulated draw
 * reproducible. A pasted official draw has none: its numbers come from PCSO.
 */
export const practiceSeedSchema = v.object({
  clientSeed: v.string(),
  serverSeed: v.string(),
  nonce: v.number(),
  rolls: v.number()
})

/**
 * What one ticket cost, in pesos. No longer a fixed set of three: the house
 * configures a price per game per bet type in the `games` table, so any whole
 * amount within the bounds of `isStake` (`src/lib/game-settings.ts`) is a
 * real stake. `record` is what refuses the rest — a fractional or out-of-range
 * cost is not a price anything charged.
 */
export const practiceBetCostSchema = v.number()

export const practiceTicketSchema = v.object({
  numbers: v.array(v.number()),
  betType: practiceBetTypeSchema,
  cost: practiceBetCostSchema,
  hits: v.number(),
  prize: v.number(),
  playerName: v.string()
})

/**
 * One resolved draw, owned by the signed-in user who played it (in party mode
 * the other players are local fictions, so the row is still that one user's).
 * `ticketCount`, `spent`, `won`, `winCount` and `bestHits` cover every ticket;
 * `tickets` is only the best `TICKET_DETAIL_LIMIT` of them. `drawnAt` is the
 * client's clock, since the draw happened in the browser.
 */
export const practicePlayFields = {
  userId: v.id('users'),
  game: practiceGameSchema,
  mode: practiceModeSchema,
  isOfficial: v.boolean(),
  drawnBalls: v.array(v.number()),
  seed: v.union(practiceSeedSchema, v.null()),
  ticketCount: v.number(),
  spent: v.number(),
  won: v.number(),
  winCount: v.number(),
  bestHits: v.number(),
  tickets: v.array(practiceTicketSchema),
  drawnAt: v.number()
}
