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
  /** When the draw settled it. Absent while pending. */
  settledAt: v.optional(v.number())
}

export const ticketSchema = v.object(ticketFields)

export type TicketStatus = typeof ticketStatusSchema.type
export type TicketDocumentFields = typeof ticketSchema.type
