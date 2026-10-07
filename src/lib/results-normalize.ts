import type { LotteryResult, ResultGame } from './results'

export const RESULT_TIMES = ['2PM', '5PM', '9PM'] as const
const missing = (value: string) => ['', '-', '--', '_'].includes(value)

export function parseResultDate(value: string): string {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value)
  if (!match) throw new Error(`Invalid date: ${JSON.stringify(value)} (expected M/D/YYYY).`)
  const [, m, d, y] = match
  const month = Number(m), day = Number(d), year = Number(y)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`Invalid calendar date: ${JSON.stringify(value)}.`)
  }
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

/** Parse decimal strings directly to integer centavos. */
export function parseResultAmount(value: string): number {
  const plain = /^\d+(?:\.\d{1,2})?$/.test(value)
  const grouped = /^\d{1,3}(?:_\d{3})+(?:\.\d{1,2})?$/.test(value)
    || /^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(value)
  const zero = /^0[_0]*(?:\.0{1,2})?$/.test(value)
  if (!plain && !grouped && !zero) throw new Error(`Invalid jackpot amount: ${JSON.stringify(value)}.`)
  const [pesos, cents = ''] = value.replace(/[_,]/g, '').split('.')
  const amount = Number(pesos) * 100 + Number(cents.padEnd(2, '0'))
  if (!Number.isSafeInteger(amount)) throw new Error('Jackpot amount exceeds the supported range.')
  return amount
}

export function normalizeResultRow(row: Record<string, string>, game: ResultGame): LotteryResult {
  if (row.game !== game.label) throw new Error(`Expected game ${JSON.stringify(game.label)}, got ${JSON.stringify(row.game)}.`)
  const date = parseResultDate(row.date)
  const time = game.timed ? row.time : null
  if (time !== null && !RESULT_TIMES.includes(time as typeof RESULT_TIMES[number])) throw new Error(`Invalid draw time: ${JSON.stringify(time)}.`)
  const rawNumbers = missing(row.numbers) ? null : row.numbers
  const numbers = rawNumbers === null ? null : rawNumbers.split('-').map(Number)
  if (rawNumbers !== null && (!/^\d+(?:-\d+)+$/.test(rawNumbers)
    || numbers!.length !== game.count
    || numbers!.some(n => !Number.isInteger(n) || n < game.min || n > game.max)
    || (game.unique && new Set(numbers).size !== game.count))) {
    throw new Error(`Invalid winning numbers: ${JSON.stringify(rawNumbers)}.`)
  }
  const winners = missing(row.winners) ? null : Number(row.winners)
  if (winners !== null && (!/^\d+$/.test(row.winners) || !Number.isSafeInteger(winners))) {
    throw new Error(`Invalid winner count: ${JSON.stringify(row.winners)}.`)
  }
  return {
    id: `${game.id}:${date}:${time ?? 'daily'}`,
    date, time: time as LotteryResult['time'], numbers, rawNumbers,
    jackpotCents: parseResultAmount(row.jackpot), winners,
  }
}
