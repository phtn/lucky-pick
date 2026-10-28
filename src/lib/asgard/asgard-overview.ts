import type { GodUser } from '@/lib/asgard/gods-users'
import {
  type DayBucket,
  ratio,
  type Segment,
  toCumulativeSeries,
  toTimestamp,
  windowTotals
} from '@/lib/overview/metrics'
import { RESULT_GAMES, type ResultDataset, type ResultGameId, type ResultIssue } from '@/lib/results'

/**
 * Asgard's readings: the ledger of official draws the app is built on, and who
 * holds the keys to the platform.
 *
 * Both come from sources Asgard already has — the generated results index and
 * the god roster endpoint — so this file only shapes them.
 */

export const GROWTH_DAYS = 90
export const COMPARISON_DAYS = 30

/**
 * The draw games are an ordered scale by pool size, not a set of identities, so
 * they take an ordinal ramp of one hue rather than nine unrelated colours. The
 * four-step ramp repeats across the nine games, lightest pool first.
 */
const GAME_TONE: Record<ResultGameId, string> = {
  lotto: 'bg-tier-1',
  mega: 'bg-tier-2',
  super: 'bg-tier-3',
  grand: 'bg-tier-4',
  ultra: 'bg-tier-4',
  '2d': 'bg-tier-1',
  '3d': 'bg-tier-2',
  '4d': 'bg-tier-3',
  '6d': 'bg-tier-4'
}

const GAME_LABEL: Record<ResultGameId, string> = Object.fromEntries(
  RESULT_GAMES.map((game) => [game.id, game.label])
) as Record<ResultGameId, string>

export interface GameReading {
  id: ResultGameId
  label: string
  draws: number
  excluded: number
  /** The most recent draw date on record, as the ISO day the file carries. */
  lastDate: string | null
}

export interface LedgerReadings {
  /** Draws with a usable number set, across every game. */
  total: number
  /** Rows the import refused, which is the honest denominator for coverage. */
  excluded: number
  coverage: number
  /** Draws whose number set never made it through the import. */
  incomplete: number
  completeRate: number
  games: GameReading[]
  gameSegments: Segment[]
  jackpotPesos: number
  /** Draws that reported at least one winner. */
  wonDraws: number
  wonRate: number
  totals: { current: number; previous: number }
  growth: DayBucket[]
  /** Oldest and newest draw dates on record. */
  firstDate: string | null
  lastDate: string | null
}

/** A draw's local midnight, from the `YYYY-MM-DD` day the dataset carries. */
function toDrawTimestamp(date: string): number | null {
  const parts = date.split('-').map(Number)
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null
  return new Date(parts[0], parts[1] - 1, parts[2]).getTime()
}

export function readLedger(datasets: readonly ResultDataset[], now = Date.now()): LedgerReadings {
  const timestamps: number[] = []
  const games: GameReading[] = []

  let total = 0
  let excluded = 0
  let incomplete = 0
  let jackpotCents = 0
  let wonDraws = 0
  let firstDate: string | null = null
  let lastDate: string | null = null

  for (const dataset of datasets) {
    let drawsWithNumbers = 0
    let datasetLastDate: string | null = null

    for (const record of dataset.records) {
      if (record.numbers?.length) drawsWithNumbers += 1
      else incomplete += 1

      jackpotCents += record.jackpotCents
      if ((record.winners ?? 0) > 0) wonDraws += 1

      if (!firstDate || record.date < firstDate) firstDate = record.date
      if (!lastDate || record.date > lastDate) lastDate = record.date
      if (!datasetLastDate || record.date > datasetLastDate) datasetLastDate = record.date

      const timestamp = toDrawTimestamp(record.date)
      if (timestamp !== null) timestamps.push(timestamp)
    }

    total += dataset.records.length
    excluded += dataset.excludedRows

    games.push({
      id: dataset.game,
      label: GAME_LABEL[dataset.game] ?? dataset.game,
      draws: dataset.records.length,
      excluded: dataset.excludedRows,
      lastDate: datasetLastDate
    })
  }

  // Index order, not load order: the panels read as a fixed ledger rather than
  // reshuffling with whichever file answered first.
  games.sort((left, right) => RESULT_GAMES.findIndex((game) => game.id === left.id) - RESULT_GAMES.findIndex((game) => game.id === right.id))

  const sourceRows = total + excluded

  return {
    total,
    excluded,
    coverage: ratio(total, sourceRows),
    incomplete,
    completeRate: ratio(total - incomplete, total),
    games,
    gameSegments: games
      .map((game) => ({ key: game.id, label: game.label, value: game.draws, tone: GAME_TONE[game.id] }))
      .filter((segment) => segment.value > 0),
    jackpotPesos: Math.round(jackpotCents / 100),
    wonDraws,
    wonRate: ratio(wonDraws, total),
    totals: windowTotals(timestamps, COMPARISON_DAYS, now),
    growth: toCumulativeSeries(timestamps, GROWTH_DAYS, now),
    firstDate,
    lastDate
  }
}

export interface IntegrityReadings {
  issues: number
  /** The files those issues came from, worst first. */
  files: { file: string; issues: number }[]
}

export function readIntegrity(issues: readonly ResultIssue[]): IntegrityReadings {
  const counts = new Map<string, number>()

  for (const issue of issues) {
    counts.set(issue.file, (counts.get(issue.file) ?? 0) + 1)
  }

  return {
    issues: issues.length,
    files: [...counts]
      .map(([file, count]) => ({ file, issues: count }))
      .sort((left, right) => right.issues - left.issues || left.file.localeCompare(right.file))
  }
}

export interface GovernanceReadings {
  /** Everyone holding the `god` claim. */
  gods: number
  /** The subset who can also grant it. */
  topGods: number
  /** Directory records the roster scan walked to build that list. */
  scanned: number
  truncated: boolean
  /** Gods carrying a claim but no verified email — a standing exposure. */
  unverified: number
  disabled: number
  /** The roster, most recently seen first. */
  recent: GodUser[]
}

export function readGovernance(roster: readonly GodUser[], scanned: number, truncated: boolean): GovernanceReadings {
  let topGods = 0
  let unverified = 0
  let disabled = 0

  for (const user of roster) {
    if (user.topg) topGods += 1
    if (!user.emailVerified) unverified += 1
    if (user.disabled) disabled += 1
  }

  const recent = [...roster].sort((a, b) => (toTimestamp(b.lastSignInAt) ?? 0) - (toTimestamp(a.lastSignInAt) ?? 0))

  return { gods: roster.length, topGods, scanned, truncated, unverified, disabled, recent }
}
