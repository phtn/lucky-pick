/**
 * Pure shaping for the two overview pages.
 *
 * Both pages read the same lists the tables already poll, so everything here
 * takes plain arrays and returns plain numbers — no fetching, no formatting
 * decisions that belong to a component. Keeping it separate means the maths
 * can be reasoned about (and tested) without a renderer.
 */

export const DAY_MS = 86_400_000

export interface DayBucket {
  /** Local midnight the bucket starts at. */
  start: number
  value: number
}

/** Local midnight for the day `timestamp` falls in. */
export const startOfDay = (timestamp: number) => {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/**
 * Buckets timestamps into the last `days` local calendar days, oldest first.
 *
 * Days with nothing in them are still emitted: a gap in capture activity is a
 * real reading, and dropping the bucket would quietly redraw the x-axis.
 */
export function toDailySeries(timestamps: readonly number[], days: number, now = Date.now()): DayBucket[] {
  const today = startOfDay(now)
  const buckets: DayBucket[] = []
  const index = new Map<number, number>()

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    // Rebuilt through `Date` rather than by subtracting `DAY_MS`, so a DST
    // change shifts the boundary with the clock instead of drifting an hour.
    const start = startOfDay(today - offset * DAY_MS)
    index.set(start, buckets.length)
    buckets.push({ start, value: 0 })
  }

  for (const timestamp of timestamps) {
    const position = index.get(startOfDay(timestamp))
    if (position !== undefined) buckets[position].value += 1
  }

  return buckets
}

/**
 * Running total per day across the last `days`, oldest first.
 *
 * The first bucket already carries everything that happened before the window,
 * so the line reads as the size of the book rather than restarting at zero.
 */
export function toCumulativeSeries(timestamps: readonly number[], days: number, now = Date.now()): DayBucket[] {
  const buckets = toDailySeries(timestamps, days, now)
  const windowStart = buckets[0]?.start ?? startOfDay(now)
  let running = timestamps.reduce((count, timestamp) => (timestamp < windowStart ? count + 1 : count), 0)

  return buckets.map((bucket) => {
    running += bucket.value
    return { start: bucket.start, value: running }
  })
}

export interface WindowTotals {
  current: number
  previous: number
}

/** Counts the trailing `days` window and the equal window before it. */
export function windowTotals(timestamps: readonly number[], days: number, now = Date.now()): WindowTotals {
  const span = days * DAY_MS
  const currentFrom = now - span
  const previousFrom = currentFrom - span
  let current = 0
  let previous = 0

  for (const timestamp of timestamps) {
    if (timestamp > currentFrom) current += 1
    else if (timestamp > previousFrom) previous += 1
  }

  return { current, previous }
}

/**
 * Period-over-period change as a fraction.
 *
 * Returns null when the prior window was empty: "up 100%" from a base of zero
 * reads as a measurement when it is really just a first data point.
 */
export function percentDelta({ current, previous }: WindowTotals): number | null {
  if (previous === 0) return null
  return (current - previous) / previous
}

/** Tallies items by a key, seeded so every known key is present at zero. */
export function countBy<T, K extends string>(
  items: readonly T[],
  keys: readonly K[],
  read: (item: T) => K | undefined
) {
  const counts = Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>

  for (const item of items) {
    const key = read(item)
    if (key !== undefined && key in counts) counts[key] += 1
  }

  return counts
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null

  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)

  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

export const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0)

/** A share of a total, guarding the empty case rather than emitting NaN. */
export const ratio = (part: number, total: number) => (total === 0 ? 0 : part / total)

const compactFormatter = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 })
const plainFormatter = new Intl.NumberFormat()

/** Four digits stay exact; past that the axis matters more than the units. */
export const formatCount = (value: number) =>
  value < 10_000 ? plainFormatter.format(value) : compactFormatter.format(value)

export function formatPercent(value: number, fractionDigits = 0) {
  return `${(value * 100).toFixed(fractionDigits)}%`
}

export function formatSignedPercent(value: number) {
  const percent = value * 100
  const rounded = Math.abs(percent) >= 10 ? Math.round(percent) : Math.round(percent * 10) / 10
  return `${rounded > 0 ? '+' : ''}${rounded}%`
}

/** Coarse by design: an overview reports an order of magnitude, not a stopwatch. */
export function formatDuration(milliseconds: number) {
  const minutes = milliseconds / 60_000
  if (minutes < 1) return '<1m'
  if (minutes < 60) return `${Math.round(minutes)}m`

  const hours = minutes / 60
  if (hours < 24) return `${hours < 10 ? Math.round(hours * 10) / 10 : Math.round(hours)}h`

  return `${Math.round(hours / 24)}d`
}

const dayFormatter = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
const weekdayFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'short' })
const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

export const formatDay = (timestamp: number) => dayFormatter.format(timestamp)
export const formatWeekday = (timestamp: number) => weekdayFormatter.format(timestamp)
export const formatTime = (timestamp: number) => timeFormatter.format(timestamp)

export function formatRelativeTime(timestamp: number, now = Date.now()) {
  const elapsed = now - timestamp
  if (elapsed < 60_000) return 'just now'
  if (elapsed < DAY_MS) return `${formatDuration(elapsed)} ago`
  if (elapsed < 7 * DAY_MS) return `${Math.round(elapsed / DAY_MS)}d ago`
  return formatDay(timestamp)
}

/** Timestamps arrive as epoch millis from Convex and as strings from Firebase. */
export function toTimestamp(value: number | string | null | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null

  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

export interface Segment {
  key: string
  label: string
  value: number
  /** A `bg-*` utility naming one step of the status set or the tier ramp. */
  tone: string
}

/** Drops empty segments so a stacked bar never carries a zero-width slice. */
export const toSegments = (segments: readonly Segment[]) => segments.filter((segment) => segment.value > 0)
