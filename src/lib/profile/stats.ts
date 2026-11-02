import { GAME_IDS, type GameId } from '../games'
import { countBy, ratio, sum, toSegments, type Segment } from '../overview/metrics'
import type { PracticePlayRow } from './record'

export interface PracticeStats {
  plays: number
  spent: number
  won: number
  net: number
  /** Winning tickets over tickets played, across every ticket of every draw. */
  winRate: number
  bestDraw: PracticePlayRow | null
  favouriteGame: GameId | null
  /**
   * Tickets by number of hits. Built from each row's capped `tickets` detail
   * (at most 50 per draw), so it describes those tickets, not all of them.
   */
  hitDistribution: Segment[]
  officialPlays: number
  simulatedPlays: number
}

// A six-ball game: 0 to 6 numbers matched. The tone ramps with the hit count.
const HIT_BUCKETS = [
  { hits: 0, tone: 'bg-tier-1' },
  { hits: 1, tone: 'bg-tier-1' },
  { hits: 2, tone: 'bg-tier-1' },
  { hits: 3, tone: 'bg-tier-2' },
  { hits: 4, tone: 'bg-tier-3' },
  { hits: 5, tone: 'bg-tier-4' },
  { hits: 6, tone: 'bg-tier-4' }
]

const HIT_KEYS = HIT_BUCKETS.map(({ hits }) => String(hits))

/**
 * The draw that paid most, or null when none paid anything: a draw that won
 * nothing is not a best draw. On a tie the first in input order wins; `mine`
 * returns rows newest-first, so that is the most recent of the equals.
 */
function pickBestDraw(rows: readonly PracticePlayRow[]) {
  const best = rows.reduce<PracticePlayRow | null>((top, row) => (top === null || row.won > top.won ? row : top), null)

  return best !== null && best.won > 0 ? best : null
}

/** The game with the most draws; ties go to the first in game order. */
function pickFavouriteGame(rows: readonly PracticePlayRow[]) {
  const counts = countBy(rows, GAME_IDS, (row) => row.game)

  return GAME_IDS.reduce<GameId | null>(
    (favourite, game) =>
      counts[game] > 0 && (favourite === null || counts[game] > counts[favourite]) ? game : favourite,
    null
  )
}

function readHitDistribution(rows: readonly PracticePlayRow[]) {
  const counts = countBy(
    rows.flatMap((row) => row.tickets),
    HIT_KEYS,
    (ticket) => String(ticket.hits)
  )

  return toSegments(
    HIT_BUCKETS.map(({ hits, tone }) => ({
      key: String(hits),
      label: hits === 1 ? '1 hit' : `${hits} hits`,
      value: counts[String(hits)],
      tone
    }))
  )
}

export function readPracticeStats(rows: readonly PracticePlayRow[]): PracticeStats {
  const spent = sum(rows.map((row) => row.spent))
  const won = sum(rows.map((row) => row.won))
  const officialPlays = rows.filter((row) => row.isOfficial).length

  return {
    plays: rows.length,
    spent,
    won,
    net: won - spent,
    winRate: ratio(sum(rows.map((row) => row.winCount)), sum(rows.map((row) => row.ticketCount))),
    bestDraw: pickBestDraw(rows),
    favouriteGame: pickFavouriteGame(rows),
    hitDistribution: readHitDistribution(rows),
    officialPlays,
    simulatedPlays: rows.length - officialPlays
  }
}
