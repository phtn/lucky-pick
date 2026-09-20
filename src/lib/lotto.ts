import { formatJackpot, formatPeso } from './format'
import { formatOdds, matchAllOdds, tierOdds, type BetType, type GameConfig, type GameId } from './games'

export type { BetType } from './games'

export const BET_TYPES: BetType[] = [1, 2, 3, 4, 5, 6]

// One tap buys this many random tickets at once.
export const BET_MULTIPLIERS = [1, 10, 20, 50, 100, 200, 500, 1000, 2500]
export const MAX_TICKETS = 5000
export const VISIBLE_TICKETS = 100

export type GameMode = 'solo' | 'party'

export type BetCost = 20 | 24 | 25

export type PrizeMode = 'official' | 'barkada'

export interface Ticket {
  id: number
  numbers: number[]
  game: GameId
  betType: BetType
  required: number
  status: 'pending' | 'won' | 'lost'
  hits: number
  time: string
  prizeWon?: number
  playerId?: string
  cost: BetCost
}

export interface Draw {
  id: number
  game: GameId
  numbers: number[]
  sorted: number[]
  time: string
  dateLabel: string
  isOfficial?: boolean
}

export interface Player {
  id: string
  name: string
  /** A CSS custom property name, e.g. '--chart-2'. */
  color: string
  avatar: string
  tickets: Ticket[]
  winnings: number
  winCount: number
}

export interface ChatMsg {
  id: string
  name: string
  color: string
  text: string
  time: string
}

export interface OfficialResult {
  date: string
  dateShort: string
  numbers: number[]
  raw: string
  jackpot: number
  winners: number
  jackpotFormatted: string
}

/** A settled ticket and what it collected. `player` is set in party mode only. */
export interface WinEntry {
  ticket: Ticket
  player?: Player
  prize: number
}

/** Time left until the next draw for the selected game. */
export interface Countdown {
  d: number
  h: number
  m: number
  s: number
  label: string
}

/** Session tallies shown under the bet panel. */
export interface SessionTotals {
  total: number
  wins: number
  rate: number
  wonAmount: number
}

// Only 6/42 ships with recorded draws; the other games start empty until a
// real result is pasted in, rather than showing invented "official" numbers.
export const OFFICIAL_RESULTS: Record<GameId, OfficialResult[]> = {
  '6/42': [
    {
      date: 'Sep 19, 2026',
      dateShort: 'SEP 19 • SAT',
      numbers: [8, 27, 6, 25, 13, 22],
      raw: '08-27-06-25-13-22',
      jackpot: 50097970.39,
      winners: 0,
      jackpotFormatted: '₱50,097,970.39'
    },
    {
      date: 'Sep 17, 2026',
      dateShort: 'SEP 17 • THU',
      numbers: [8, 31, 32, 19, 24, 6],
      raw: '08-31-32-19-24-06',
      jackpot: 45831802.36,
      winners: 0,
      jackpotFormatted: '₱45,831,802.36'
    }
  ],
  '6/45': [],
  '6/49': [],
  '6/55': [],
  '6/58': []
}

export const BET_COSTS: { value: BetCost; label: string; sub: string }[] = [
  { value: 20, label: '₱20', sub: 'Classic' },
  { value: 24, label: '₱24', sub: '2023' },
  { value: 25, label: '₱25', sub: '2026 Current' }
]

export const BET_LABELS: Record<BetType, string> = {
  1: '1/',
  2: '2/',
  3: '3/',
  4: '4/',
  5: '5/',
  6: '6/'
}

// Players are identified by a token, not a fixed hex, so the room re-hues
// with the theme. Ink is chosen per fill at render (see paintFor).
export const PLAYER_COLORS = [
  '--primary',
  '--destructive',
  '--chart-2',
  '--chart-3',
  '--chart-4',
  '--chart-5',
  '--chart-1',
  '--foreground'
]

// Two different bets, so two different tables. A jackpot ticket holds six
// numbers and collects on partial matches; a pick bet wins only if every
// number it holds is drawn. Mixing their odds in one column read as a
// contradiction, so each is shown on its own.
export function jackpotLadder(game: GameConfig, jackpot: number) {
  return [
    { m: '6/6', prize: formatJackpot(jackpot), odds: formatOdds(tierOdds(game.pool, 6)), sub: 'Jackpot • rolls over' },
    {
      m: '5/6',
      prize: formatPeso(game.secondary[5]),
      odds: formatOdds(tierOdds(game.pool, 5)),
      sub: 'Fixed second tier'
    },
    {
      m: '4/6',
      prize: formatPeso(game.secondary[4]),
      odds: formatOdds(tierOdds(game.pool, 4)),
      sub: 'Fixed third tier'
    },
    {
      m: '3/6',
      prize: formatPeso(game.secondary[3]),
      odds: formatOdds(tierOdds(game.pool, 3)),
      sub: 'Fixed consolation'
    }
  ]
}

export function pickPaytable(game: GameConfig, stake: BetCost) {
  return ([5, 4, 3, 2, 1] as const).map((k) => ({
    m: `${k}/${k}`,
    prize: formatPeso(Math.round(game.payout[k] * stake)),
    odds: formatOdds(matchAllOdds(game.pool, k)),
    bet: k as BetType,
    sub: `×${game.payout[k].toLocaleString('en-PH')} your stake`
  }))
}

/** The next 9PM Manila draw night for a game's schedule. */
export function getNextDrawDate(drawDays: number[]): Date {
  const now = new Date()
  const d = new Date(now)
  d.setHours(21, 0, 0, 0) // 9PM Manila
  if (drawDays.includes(d.getDay()) && now < d) return d
  for (let i = 1; i <= 7; i++) {
    const nd = new Date(now)
    nd.setDate(now.getDate() + i)
    nd.setHours(21, 0, 0, 0)
    if (drawDays.includes(nd.getDay())) return nd
  }
  return d
}

/** Three letters and two digits, skipping I and O so a code is readable aloud. */
export function genRoomCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const nums = '0123456789'
  let code = ''
  for (let i = 0; i < 3; i++) code += letters[Math.floor(Math.random() * letters.length)]
  for (let i = 0; i < 2; i++) code += nums[Math.floor(Math.random() * nums.length)]
  return code
}
