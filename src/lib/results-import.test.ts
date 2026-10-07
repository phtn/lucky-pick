import { describe, expect, test } from 'bun:test'
import { parseRawResults } from './results-import'
import { RESULT_GAMES, type ResultGameId } from './results'
import { inspectResultCsv, planCsvImport } from '../../scripts/results-import-csv'
import { parseResultCsv } from '../../scripts/results-csv'

const lotto = RESULT_GAMES[0]
const sources = () => Object.fromEntries(RESULT_GAMES.map(game => [game.id, `${game.timed ? 'game,time,numbers,date,jackpot,winners' : 'game,numbers,date,jackpot,winners'}\n`])) as Record<ResultGameId, string>
const line = 'Lotto 6/42\t07-35-41-37-08-11\t10/6/2026\t80,317,113.63\t0'

describe('plain-text result imports', () => {
  test('parses pasted tables, labels, times, leading zeros, currency and grouped counts', () => {
    const result = parseRawResults('\uFEFFLOTTO GAME\tCOMBINATIONS\tDRAW DATE\tJACKPOT (PHP)\tWINNERS\r\n'
      + line + '\r\n3D Lotto 2PM\t0-6-4\t10/6/2026\t4,500.00\t188\r\n'
      + 'Mega Lotto 6/45 32-23-28-38-26-17 10/7/2026 ₱96,418,628.55 1,000')
    expect(result.issues).toEqual([])
    expect(result.sourceRows).toBe(3)
    expect(result.records[0]?.record).toMatchObject({ id: 'lotto:2026-10-06:daily', rawNumbers: '07-35-41-37-08-11', jackpotCents: 8031711363, winners: 0 })
    expect(result.records[1]?.record).toMatchObject({ id: '3d:2026-10-06:2PM', numbers: [0, 6, 4] })
    expect(result.records[2]).toMatchObject({ game: 'mega', record: { winners: 1000 } })
  })

  test('reports line numbers and rejects wrong times, ball ranges, dates and missing numbers', () => {
    const result = parseRawResults('\n3D Lotto 0-6-4 10/6/2026 4500 188\n'
      + '2D Lotto 2PM 00-02 10/6/2026 4000 0\n'
      + '6D Lotto 0-0-1-2-3-4 2/30/2026 1000 0\n'
      + 'Lotto 6/42 - 10/6/2026 1000 0\n'
      + 'unrecognized pasted content\n')
    expect(result.records).toEqual([])
    expect(result.issues.map(issue => issue.line)).toEqual([2, 3, 4, 5, 6])
  })

  test('collapses identical duplicates but refuses conflicting new draws', () => {
    expect(parseRawResults(line + '\n' + line)).toMatchObject({ duplicateRows: 1, sourceRows: 2, issues: [] })
    const conflict = parseRawResults(line + '\n' + line.replace('80,317,113.63', '80,317,113.64'))
    expect(conflict.records).toEqual([])
    expect(conflict.issues.map(issue => issue.line)).toEqual([1, 2])
  })

  test('treats formatting and six-ball ordering as the same result, preserving digit order', () => {
    expect(parseRawResults(line + '\n' + line.replace('07-35-41-37-08-11', '41-35-7-37-8-11')).duplicateRows).toBe(1)
    expect(parseRawResults('3D Lotto 2PM 0-1-2 10/6/2026 4500 0\n3D Lotto 2PM 2-1-0 10/6/2026 4500 0').issues).toHaveLength(2)
  })

  test('inserts rows without rewriting existing bytes, headers, BOM, CRLF or bad source rows', () => {
    const csvs = sources()
    csvs.lotto = '\uFEFFwinners,date,jackpot,numbers,game\r\n0,9/19/2026,bad,08-27-06-25-13-22,Lotto 6/42\r\n'
    const plan = planCsvImport(line, csvs)
    const change = plan.changes.find(item => item.game === 'lotto')!
    expect(plan.added).toBe(1)
    expect(change.after).toBe('\uFEFFwinners,date,jackpot,numbers,game\r\n0,10/6/2026,80317113.63,07-35-41-37-08-11,Lotto 6/42\r\n0,9/19/2026,bad,08-27-06-25-13-22,Lotto 6/42\r\n')
    expect(plan.changes.filter(item => item.added === 0).every(item => item.after === item.before)).toBe(true)
    expect(parseResultCsv(change.after, lotto).dataset.records).toHaveLength(1)
    const existing = planCsvImport('Lotto 6/42 01-02-03-04-05-06 9/19/2026 5000 1', csvs)
    expect(existing).toMatchObject({ added: 0, skipped: 1 })
  })

  test('keeps daily times distinct and repeated imports are byte-for-byte no-ops', () => {
    const text = '2D Lotto 2PM 04-21 10/6/2026 4000 3\n2D Lotto 5PM 04-21 10/6/2026 4000 3\n2D Lotto 9PM 04-21 10/6/2026 4000 3'
    const first = planCsvImport(text, sources())
    expect(first.added).toBe(3)
    const updated = Object.fromEntries(first.changes.map(item => [item.game, item.after])) as Record<ResultGameId, string>
    const second = planCsvImport(text, updated)
    expect(second).toMatchObject({ added: 0, skipped: 3 })
    expect(second.changes.every(item => item.before === item.after)).toBe(true)
    expect(inspectResultCsv(updated['2d'], RESULT_GAMES.find(game => game.id === '2d')!).ids.size).toBe(3)
  })

  test('invalid and empty pastes cannot produce CSV changes; input size is bounded', () => {
    expect(() => planCsvImport(line + '\ninvalid', sources())).toThrow('Line 2:')
    expect(() => planCsvImport('', sources())).toThrow('No result rows')
    expect(() => parseRawResults('x'.repeat(500_001))).toThrow('500 KB')
    expect(() => parseRawResults(Array(501).fill(line).join('\n'))).toThrow('500 result rows')
  })
})
