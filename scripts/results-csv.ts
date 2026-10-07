import Papa from 'papaparse'
import type { LotteryResult, ResultDataset, ResultGame, ResultIssue } from '../src/lib/results'

import { RESULT_TIMES as TIMES, normalizeResultRow } from "../src/lib/results-normalize"

export function parseResultCsv(text: string, game: ResultGame, file = `${game.id}.csv`): {
  dataset: ResultDataset
  issues: ResultIssue[]
} {
  const source = text.replace(/^\uFEFF/, '')
  const expected = game.timed ? ['game', 'time', 'numbers', 'date', 'jackpot', 'winners'] : ['game', 'numbers', 'date', 'jackpot', 'winners']
  let header: string[] | undefined
  let cursor = 0, line = 1, sourceRows = 0
  const issues: ResultIssue[] = []
  const candidates = new Map<string, Array<{ record: LotteryResult; line: number }>>()
  Papa.parse<string[]>(source, {
    delimiter: ',', dynamicTyping: false, skipEmptyLines: false,
    step(result) {
      const recordLine = line
      const raw = source.slice(cursor, result.meta.cursor)
      line += (raw.match(/\r\n|\r|\n/g) ?? []).length
      cursor = result.meta.cursor
      const cells = result.data.map(cell => cell.trim())
      if (cells.every(cell => cell === '')) return
      if (!header) {
        if (result.errors.length || cells.length !== expected.length
          || new Set(cells).size !== cells.length || expected.some(field => !cells.includes(field))) {
          throw new Error(`${file}:${recordLine}: expected headers ${expected.join(',')}.`)
        }
        header = cells
        return
      }
      sourceRows++
      try {
        if (result.errors.length) throw new Error(result.errors.map(error => error.message).join(' '))
        if (cells.length !== header.length) throw new Error(`Expected ${header.length} columns, found ${cells.length}.`)
        const row = Object.fromEntries(header.map((field, index) => [field, cells[index]]))
        const record = normalizeResultRow(row, game)
        const group = candidates.get(record.id) ?? []
        group.push({ record, line: recordLine })
        candidates.set(record.id, group)
      } catch (error) {
        issues.push({ file, line: recordLine, message: error instanceof Error ? error.message : String(error) })
      }
    },
  })
  if (!header) throw new Error(`${file}: missing CSV header.`)
  const records: LotteryResult[] = []
  for (const group of candidates.values()) {
    const first = group[0]
    const conflicting = group.some(item => JSON.stringify(item.record) !== JSON.stringify(first.record))
    if (conflicting) {
      for (const item of group) issues.push({ file, line: item.line, message: `Conflicting results for ${item.record.id}.` })
    } else {
      records.push(first.record)
      for (const item of group.slice(1)) issues.push({ file, line: item.line, message: `Duplicate result for ${item.record.id}.` })
    }
  }
  records.sort((a, b) => b.date.localeCompare(a.date) || TIMES.indexOf(b.time!) - TIMES.indexOf(a.time!))
  issues.sort((a, b) => a.line - b.line)
  return { dataset: { version: 1, game: game.id, sourceRows, excludedRows: issues.length, records }, issues }
}
