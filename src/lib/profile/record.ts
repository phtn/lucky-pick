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

interface SettledTicket {
  ticket: Ticket
  playerName?: string
}

/**
 * Shapes one resolved draw into a practice play row. `settled` holds the
 * tickets this draw just evaluated, so they are already `'won'` or `'lost'`;
 * a ticket for another game, or one still `'pending'`, was not part of it.
 * The aggregates cover every ticket, while `tickets` keeps only the best
 * `TICKET_DETAIL_LIMIT`. Returns `null` when the draw settled nothing.
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
  const details: PracticeTicketDetail[] = []
  for (const { ticket, playerName } of entries) {
    const prize = ticket.prizeWon ?? 0
    spent += ticket.cost
    won += prize
    if (prize > 0) winCount += 1
    bestHits = Math.max(bestHits, ticket.hits)
    details.push({
      numbers: ticket.numbers,
      betType: ticket.betType,
      cost: ticket.cost,
      hits: ticket.hits,
      prize,
      playerName: playerName ?? ''
    })
  }

  details.sort((a, b) => b.prize - a.prize || b.hits - a.hits)

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
    tickets: details.slice(0, TICKET_DETAIL_LIMIT),
    drawnAt: Date.now()
  }
}
