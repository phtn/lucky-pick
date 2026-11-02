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

export const practiceTicketSchema = v.object({
  numbers: v.array(v.number()),
  betType: practiceBetTypeSchema,
  cost: v.number(),
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
