export type GameId = '6/42' | '6/45' | '6/49' | '6/55' | '6/58'
export type BetType = 1 | 2 | 3 | 4 | 5 | 6

export interface GameConfig {
  id: GameId
  pool: number
  name: string
  /** Minimum jackpot the game resets to after a win. */
  baseJackpot: number
  /** Amount the pot climbs by on a draw with no jackpot winner. */
  rollover: number
  /** 0 = Sunday. PCSO draw nights for this game. */
  drawDays: number[]
  drawDayLabel: string
  /** Fixed lower-tier payouts for a full six-number JACKPOT ticket only. */
  secondary: Record<3 | 4 | 5, number>
  /** Stake multiplier for a match-all pick bet, at a flat 62.718% return.
   *  Anchored on 6/42 pick 3 = x360; every other cell is its own odds x RTP. */
  payout: Record<1 | 2 | 3 | 4 | 5, number>
  /** A CSS colour reference, e.g. var(--chart-2), so games re-hue with the theme. */
  accent: string
}

export const GAME_IDS: GameId[] = ['6/42', '6/45', '6/49', '6/55', '6/58']

export const GAMES: Record<GameId, GameConfig> = {
  '6/42': {
    id: '6/42', pool: 42, name: 'Lotto 6/42',
    baseJackpot: 5_940_000, rollover: 500_000,
    drawDays: [2, 4, 6], drawDayLabel: 'Tue • Thu • Sat',
    secondary: { 5: 25_000, 4: 1_000, 3: 20 },
    payout: { 1: 4.4, 2: 36, 3: 360, 4: 4_680, 5: 88_900 }, accent: 'var(--primary)',
  },
  '6/45': {
    id: '6/45', pool: 45, name: 'Mega Lotto 6/45',
    baseJackpot: 8_910_000, rollover: 700_000,
    drawDays: [1, 3, 5], drawDayLabel: 'Mon • Wed • Fri',
    secondary: { 5: 46_000, 4: 1_200, 3: 20 },
    payout: { 1: 4.7, 2: 41, 3: 445, 4: 6_230, 5: 128_000 }, accent: 'var(--chart-5)',
  },
  '6/49': {
    id: '6/49', pool: 49, name: 'Super Lotto 6/49',
    baseJackpot: 15_840_000, rollover: 900_000,
    drawDays: [2, 4, 0], drawDayLabel: 'Tue • Thu • Sun',
    secondary: { 5: 54_000, 4: 1_500, 3: 20 },
    payout: { 1: 5.1, 2: 49, 3: 580, 4: 8_860, 5: 199_000 }, accent: 'var(--chart-2)',
  },
  '6/55': {
    id: '6/55', pool: 55, name: 'Grand Lotto 6/55',
    baseJackpot: 29_700_000, rollover: 1_200_000,
    drawDays: [1, 3, 6], drawDayLabel: 'Mon • Wed • Sat',
    secondary: { 5: 120_000, 4: 2_000, 3: 20 },
    payout: { 1: 5.7, 2: 62, 3: 825, 4: 14_300, 5: 364_000 }, accent: 'var(--chart-3)',
  },
  '6/58': {
    id: '6/58', pool: 58, name: 'Ultra Lotto 6/58',
    baseJackpot: 49_500_000, rollover: 1_500_000,
    drawDays: [2, 5, 0], drawDayLabel: 'Tue • Fri • Sun',
    secondary: { 5: 180_000, 4: 3_000, 3: 20 },
    payout: { 1: 6.1, 2: 69, 3: 970, 4: 17_700, 5: 479_000 }, accent: 'var(--chart-4)',
  },
}

/** The flat return every match-all pick bet is priced at. */
export const PAYOUT_RTP = 360 / 574

export function combinations(n: number, k: number): number {
  if (k < 0 || k > n) return 0
  let result = 1
  for (let i = 1; i <= k; i++) result = (result * (n - k + i)) / i
  return Math.round(result)
}

/** 1 in X that a six-number ticket matches exactly `matched` of the six drawn. */
export function tierOdds(pool: number, matched: 3 | 4 | 5 | 6): number {
  const ways = combinations(6, matched) * combinations(pool - 6, 6 - matched)
  return combinations(pool, 6) / ways
}

/** 1 in X that every pick of a k-number bet lands in the six drawn. */
export function matchAllOdds(pool: number, k: number): number {
  return combinations(pool, k) / combinations(6, k)
}

export function betOdds(pool: number, bet: BetType): number {
  return bet === 6 ? combinations(pool, 6) : matchAllOdds(pool, bet)
}

export function formatOdds(odds: number): string {
  return '1 in ' + Math.round(odds).toLocaleString('en-PH')
}

/** Payout a winning bet collects. A jackpot ticket takes the pot; a match-all
 *  pick bet pays its multiplier against the stake actually wagered, so a P20
 *  ticket collects less than a P25 one. */
export function betPrize(game: GameConfig, bet: BetType, jackpot: number, stake: number): number {
  if (bet === 6) return jackpot
  return Math.round(game.payout[bet as 1 | 2 | 3 | 4 | 5] * stake)
}

/** Fisher-Yates over 1..pool, so a pick never repeats a number. */
export function randomPick(count: number, pool: number): number[] {
  const bag = Array.from({ length: pool }, (_, i) => i + 1)
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[bag[i], bag[j]] = [bag[j], bag[i]]
  }
  return bag.slice(0, count).sort((a, b) => a - b)
}
