import { TICKET_DETAIL_LIMIT } from '../../../convex/plays/d'
import type { GameId, BetType } from '../games'
import type { BetCost, Draw, GameMode, Ticket } from '../lotto'
import type { DrawSeed } from '../rng'

export interface PracticeTicketDetail {
  numbers: number[]
  betType: BetType
  cost: BetCost
  hits: number
  prize: number
  /** Empty when the ticket has no named player (solo mode): the server stores a string. */
  playerName: string
}

/** The arguments of `plays.m.record`. */
export interface PracticePlayInput {
  game: GameId
  mode: GameMode
  isOfficial: boolean
  drawnBalls: number[]
  seed: DrawSeed | null
  ticketCount: number
  spent: number
  won: number
  winCount: number
  bestHits: number
  tickets: PracticeTicketDetail[]
  drawnAt: number
}

/** What `plays.q.mine` returns, declared with the writer's shape so the two cannot drift. */
export type PracticePlayRow = PracticePlayInput & { _id: string; _creationTime: number }

/**
 * One ticket this draw just settled, with the player who holds it in party mode.
 * Exported because `evaluateTickets` collects them: the shape is the contract
 * between the one write site and this builder, so a drift is a compile error.
 */
export interface SettledTicket {
  ticket: Ticket
  playerName?: string
}

/**
 * The stored ranking: prize first, then hits. `true` only when strictly better,
 * so an equal ticket never displaces one that came earlier in input order.
 */
const outranks = (prize: number, hits: number, kept: PracticeTicketDetail) =>
  prize > kept.prize || (prize === kept.prize && hits > kept.hits)

/**
 * Shapes one resolved draw into a practice play row. `settled` holds the
 * tickets this draw just evaluated, so they are already `'won'` or `'lost'`;
 * a ticket for another game, or one still `'pending'`, was not part of it.
 * The aggregates cover every ticket, while `tickets` keeps only the best
 * `TICKET_DETAIL_LIMIT` of them, selected without ever holding or sorting the
 * whole set. Returns `null` when the draw settled nothing.
 */
export function buildPracticePlay(args: {
  draw: Draw
  mode: GameMode
  settled: readonly SettledTicket[]
}): PracticePlayInput | null {
  const { draw, mode } = args
  const entries = args.settled.filter(({ ticket }) => ticket.game === draw.game && ticket.status !== 'pending')
  if (entries.length === 0) return null

  let spent = 0
  let won = 0
  let winCount = 0
  let bestHits = 0
  // Bounded selection, not sort-then-slice: this runs on the reveal thread
  // between the win sequence and `setIsDrawing(false)`, and a draw can settle
  // up to MAX_TICKETS (2,000,000) tickets. A detail object is allocated only
  // for a ticket that earns a place, and `top` is held in rank order by
  // inserting after every equal, so ties keep input order exactly as the stable
  // sort did. The aggregates above still cover every surviving ticket.
  const top: PracticeTicketDetail[] = []
  for (const { ticket, playerName } of entries) {
    const prize = ticket.prizeWon ?? 0
    spent += ticket.cost
    won += prize
    if (prize > 0) winCount += 1
    bestHits = Math.max(bestHits, ticket.hits)

    if (top.length === TICKET_DETAIL_LIMIT && !outranks(prize, ticket.hits, top[TICKET_DETAIL_LIMIT - 1])) continue
    let at = top.length
    while (at > 0 && outranks(prize, ticket.hits, top[at - 1])) at -= 1
    top.splice(at, 0, {
      numbers: ticket.numbers,
      betType: ticket.betType,
      cost: ticket.cost,
      hits: ticket.hits,
      prize,
      playerName: playerName ?? ''
    })
    if (top.length > TICKET_DETAIL_LIMIT) top.pop()
  }

  return {
    game: draw.game,
    mode,
    isOfficial: draw.isOfficial === true,
    drawnBalls: draw.numbers,
    seed: draw.seed ?? null,
    ticketCount: entries.length,
    spent,
    won,
    winCount,
    bestHits,
    tickets: top,
    drawnAt: Date.now()
  }
}
