import { RESULT_GAMES, type LotteryResult, type ResultGameId } from './results'
import { normalizeResultRow } from './results-normalize'

export const MAX_IMPORT_TEXT = 500_000
export const MAX_IMPORT_ROWS = 500
export interface ImportedResult { game: ResultGameId; record: LotteryResult; line: number }
export interface ImportIssue { line: number; message: string }
export interface RawResults {
  records: ImportedResult[]
  issues: ImportIssue[]
  duplicateRows: number
  sourceRows: number
}

const normalizedLabel = (label: string) => label.replace(/\s+/g, '').toLowerCase()

/** Parse PCSO copied rows: game [time], numbers, M/D/YYYY, prize, winners. */
export function parseRawResults(text: string): RawResults {
  if (new TextEncoder().encode(text).length > MAX_IMPORT_TEXT) throw new Error('Paste at most 500 KB of results at a time.')
  const issues: ImportIssue[] = []
  const groups = new Map<string, ImportedResult[]>()
  let sourceRows = 0, duplicateRows = 0
  for (const [index, source] of text.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/).entries()) {
    const line = index + 1
    const value = source.trim()
    if (!value) continue
    if (/^(?:lotto\s+game|game)\s+(?:combinations?|numbers|winning\s+numbers)\s+(?:draw\s+)?date\s+(?:jackpot|prize)/i.test(value)) continue
    sourceRows++
    if (sourceRows > MAX_IMPORT_ROWS) throw new Error('Paste at most 500 result rows at a time.')
    try {
      // Prize separators stay intact; tabs and ordinary copied whitespace both work.
      const match = /^(.+?)\s+(\d+(?:-\d+)+|--?|_)\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+((?:₱|PHP\s*)?[\d_,.]+)\s+([\d,]+|--?|_)$/i.exec(value)
      if (!match) throw new Error('Expected game, winning numbers, M/D/YYYY, jackpot, and winners on one line.')
      const [, label, numbers, date, amount, rawWinners] = match
      const timeMatch = /\s+(2|5|9)\s*PM$/i.exec(label)
      const gameLabel = timeMatch ? label.slice(0, timeMatch.index) : label
      const game = RESULT_GAMES.find(item => normalizedLabel(item.label) === normalizedLabel(gameLabel))
      if (!game) throw new Error(`Unknown game: ${JSON.stringify(gameLabel)}.`)
      if (game.timed !== Boolean(timeMatch)) throw new Error(game.timed ? 'Include the draw time: 2PM, 5PM, or 9PM.' : 'This game does not use a draw time.')
      if (!/^(?:\d+|\d{1,3}(?:,\d{3})+|--?|_)$/.test(rawWinners)) throw new Error('Invalid winner count.')
      const record = normalizeResultRow({ game: game.label, time: timeMatch ? `${timeMatch[1]}PM` : '', numbers, date, jackpot: amount.replace(/^(?:₱|PHP\s*)/i, ''), winners: rawWinners.replace(/,/g, '') }, game)
      if (record.numbers === null) throw new Error('Winning numbers are required for new results.')
      const group = groups.get(record.id) ?? []
      group.push({ game: game.id, record, line })
      groups.set(record.id, group)
    } catch (error) {
      issues.push({ line, message: error instanceof Error ? error.message : String(error) })
    }
  }
  const records: ImportedResult[] = []
  for (const group of groups.values()) {
    const game = RESULT_GAMES.find(item => item.id === group[0]!.game)!
    const fingerprint = ({ record }: ImportedResult) => JSON.stringify({
      numbers: game.unique ? [...record.numbers!].sort((a, b) => a - b) : record.numbers,
      jackpotCents: record.jackpotCents, winners: record.winners,
    })
    if (group.some(item => fingerprint(item) !== fingerprint(group[0]!))) {
      for (const item of group) issues.push({ line: item.line, message: `Conflicting pasted results for ${item.record.id}.` })
    } else {
      records.push(group[0]!)
      duplicateRows += group.length - 1
    }
  }
  issues.sort((a, b) => a.line - b.line)
  return { records, issues, duplicateRows, sourceRows }
}
