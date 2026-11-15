import { v } from 'convex/values'
import { betTypeSchema, gameIdSchema } from '../games/d'

/**
 * A real ticket: one bet a player placed with credits at a house. It follows
 * the `Ticket` of `src/lib/lotto.ts`, the shape the board already builds, with
 * the changes a stored row needs:
 *
 * - `id` is the document's own `_id`, and `time` (a display string) is
 *   `createdAt`, a timestamp the client formats.
 * - `playerId` is `userId`, a real reference, and the row also names the house
 *   (`accountId`) the ticket was bought at, since credits are held per house.
 * - `required` is left out: it is always the bet type, and a second copy of it
 *   could only ever disagree with the first.
 *
 * Not `practicePlays`: that table keeps a summary of a simulated draw, and no
 * credits ever stood behind it.
 */
export const ticketStatusSchema = v.union(v.literal('pending'), v.literal('won'), v.literal('lost'))

/** How many numbers a ticket can hold: a full jackpot ticket picks six. */
export const TICKET_NUMBER_LIMIT = 6

/** Tickets one purchase may hold, which bounds what one mutation writes. */
export const MAX_TICKETS_PER_PURCHASE = 200

/** Rows `mine` returns at most; the board renders a capped list. */
export const MY_TICKETS_LIMIT = 500

/** Newest tickets `atMyHouses` carries per house, and the houses it reads. */
export const HOUSE_TICKETS_LIMIT = 100
export const MY_TICKET_HOUSES_LIMIT = 50

export const ticketFields = {
  userId: v.id('users'),
  accountId: v.id('accounts'),
  game: gameIdSchema,
  /** How many numbers the ticket picks, which decides its odds and its prize. */
  betType: betTypeSchema,
  /** The picked numbers, ascending. As many as `betType` says. */
  numbers: v.array(v.number()),
  /** What the ticket cost, in whole credits (1 credit = ₱1). */
  cost: v.number(),
  /** `pending` until its draw is run; then `won` or `lost` for good. */
  status: ticketStatusSchema,
  /** How many of its numbers were drawn. 0 while pending. */
  hits: v.number(),
  /** What it paid, in whole credits. Absent until it has won something. */
  prizeWon: v.optional(v.number()),
  createdAt: v.number(),
  /**
   * The draw the ticket is entered in, as that draw's Manila calendar date
   * (`YYYY-MM-DD`, the format `historicalResults.date` uses). Decided on the
   * server at purchase. Optional because tickets bought before the field
   * existed carry none.
   */
  drawDate: v.optional(v.string()),
  /**
   * When on `drawDate` the draw is held, as Manila wall-clock time in 24-hour
   * `HH:mm`. Written with `drawDate`, so a ticket has both or neither.
   */
  drawTime: v.optional(v.string()),
  /** When the draw settled it. Absent while pending. */
  settledAt: v.optional(v.number())
}

export const ticketSchema = v.object(ticketFields)

/** Draws are held at 9PM in Manila, which is UTC+8 all year. */
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000
const DRAW_HOUR = 21
/** Every game draws at the same hour today, so this is the one value `drawTime` takes. */
export const DRAW_TIME = `${DRAW_HOUR}:00`
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The Manila date of the next draw a ticket bought at `now` is entered in:
 * tonight's if today is a draw day and it is not yet 9PM there, otherwise the
 * next draw day's. The same rule as `getNextDrawDate` in `src/lib/lotto.ts`,
 * but pinned to Manila rather than to whatever zone the code runs in. `null`
 * for a schedule with no usable draw day.
 */
export function nextDrawDate(drawDays: readonly number[], now: number): string | null {
  // Shifted so the UTC getters read Manila's wall clock.
  const manila = new Date(now + MANILA_OFFSET_MS)
  for (let ahead = manila.getUTCHours() < DRAW_HOUR ? 0 : 1; ahead <= 7; ahead++) {
    const day = new Date(manila.getTime() + ahead * DAY_MS)
    if (drawDays.includes(day.getUTCDay())) return day.toISOString().slice(0, 10)
  }
  return null
}

export type TicketStatus = typeof ticketStatusSchema.type
export type TicketDocumentFields = typeof ticketSchema.type
