import { describe, expect, test } from 'bun:test'
import { parseResultCsv } from '../../scripts/results-csv'
import { RESULT_GAMES } from './results'

const lotto = RESULT_GAMES.find(game => game.id === 'lotto')!
const twoD = RESULT_GAMES.find(game => game.id === '2d')!
const sixD = RESULT_GAMES.find(game => game.id === '6d')!
const dailyHeader = 'game,numbers,date,jackpot,winners\n'
const timedHeader = 'game,time,numbers,date,jackpot,winners\n'

describe('result CSV normalization', () => {
  test('handles BOM, CRLF, quoted commas, leading zeros, and precise centavos', () => {
    const { dataset, issues } = parseResultCsv('\uFEFF' + dailyHeader.replace('\n', '\r\n')
      + 'Lotto 6/42,08-27-06-25-13-22,9/19/2026,"50,097,970.39",0\r\n', lotto)
    expect(issues).toEqual([])
    expect(dataset.records[0]).toMatchObject({ date: '2026-09-19', rawNumbers: '08-27-06-25-13-22', numbers: [8, 27, 6, 25, 13, 22], jackpotCents: 5009797039, winners: 0 })
  })

  test('reports physical source lines after blank rows and quoted newlines', () => {
    const text = dailyHeader + '\nLotto 6/42,01-02-03-04-05-06,9/1/2026,1_000.01,0\n'
      + 'Lotto 6/42,"bad\nnumbers",9/2/2026,1000,0\n'
      + 'Lotto 6/42,01-02-03-04-05-06,9/3/2026,1000,0,extra\n'
    const { dataset, issues } = parseResultCsv(text, lotto, 'lotto.csv')
    expect(dataset.sourceRows).toBe(3)
    expect(dataset.records).toHaveLength(1)
    expect(issues.map(issue => issue.line)).toEqual([4, 6])
    expect(issues[1].message).toContain('Expected 5 columns, found 6')
  })

  test('rejects invalid dates, duplicate lotto balls, and ambiguous amounts', () => {
    const { dataset, issues } = parseResultCsv(dailyHeader
      + 'Lotto 6/42,01-02-03-04-05-06,2/30/2026,1000,0\n'
      + 'Lotto 6/42,01-01-03-04-05-06,2/28/2026,1000,0\n'
      + 'Lotto 6/42,01-02-03-04-05-06,2/27/2026,517_64.00,0\n'
      + 'Lotto 6/42,01-02-03-04-05-06,2/26/2026,207_888..0,0\n', lotto)
    expect(dataset.records).toHaveLength(0)
    expect(issues).toHaveLength(4)
    expect(dataset.excludedRows).toBe(4)
  })

  test('allows repeated digits for 6D and preserves unknown values separately from zero', () => {
    const { dataset, issues } = parseResultCsv(dailyHeader
      + '6D Lotto,0-0-1-1-8-3,9/19/2026,150_000.00,0\n'
      + '6D Lotto,-,9/18/2026,0_00,\n', sixD)
    expect(issues).toEqual([])
    expect(dataset.records[0]).toMatchObject({ rawNumbers: '0-0-1-1-8-3', numbers: [0, 0, 1, 1, 8, 3], winners: 0 })
    expect(dataset.records[1]).toMatchObject({ numbers: null, rawNumbers: null, jackpotCents: 0, winners: null })
  })

  test('retains separate daily draw times and sorts latest draws first', () => {
    const { dataset, issues } = parseResultCsv(timedHeader
      + '2D Lotto,2PM,04-21,9/20/2026,4_000.00,343\n'
      + '2D Lotto,9PM,23-09,9/20/2026,4_000.00,471\n'
      + '2D Lotto,5PM,19-29,9/19/2026,4_000.00,129\n', twoD)
    expect(issues).toEqual([])
    expect(dataset.records.map(row => row.time)).toEqual(['9PM', '2PM', '5PM'])
    expect(new Set(dataset.records.map(row => row.id)).size).toBe(3)
  })

  test('deduplicates identical draws and excludes all conflicting versions', () => {
    const row = 'Lotto 6/42,01-02-03-04-05-06,9/20/2026,1000,0\n'
    const identical = parseResultCsv(dailyHeader + row + row, lotto)
    expect(identical.dataset.records).toHaveLength(1)
    expect(identical.issues[0].line).toBe(3)
    const conflict = parseResultCsv(dailyHeader + row + row.replace('1000', '2000'), lotto)
    expect(conflict.dataset.records).toHaveLength(0)
    expect(conflict.issues.map(issue => issue.line)).toEqual([2, 3])
  })

  test('keeps more than 5,000 valid records', () => {
    const rows = Array.from({ length: 6000 }, (_, index) => {
      const date = new Date(Date.UTC(2000, 0, index + 1))
      return `Lotto 6/42,01-02-03-04-05-06,${date.getUTCMonth() + 1}/${date.getUTCDate()}/${date.getUTCFullYear()},1000,0`
    })
    const { dataset, issues } = parseResultCsv(dailyHeader + rows.join('\n'), lotto)
    expect(issues).toEqual([])
    expect(dataset.records).toHaveLength(6000)
    expect(dataset.sourceRows).toBe(6000)
  })

  test('rejects invalid headers rather than interpreting wrong columns', () => {
    expect(() => parseResultCsv('game,date,numbers,jackpot,unknown\n', lotto)).toThrow('expected headers')
    expect(() => parseResultCsv('', lotto)).toThrow('missing CSV header')
  })
})
