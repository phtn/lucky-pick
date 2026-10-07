import { describe, expect, test } from 'bun:test'
import { analyzeResults } from './results-analytics'
import type { LotteryResult } from './results'

function draw(numbers: number[] | null, date = '2026-09-01', winners: number | null = 0): LotteryResult {
  return { id: `draw-${date}`, numbers, date, time: null, winners, rawNumbers: numbers?.join('-') ?? null, jackpotCents: 0 }
}

describe('historical number frequency', () => {
  test('counts unordered co-occurrences and ranks ties numerically', () => {
    const result = analyzeResults([draw([10, 2, 1]), draw([2, 10, 3], '2026-09-02'), draw([1, 2, 3], '2026-09-03')])
    expect(result.singles.map(item => [item.key, item.draws])).toEqual([['2', 3], ['1', 2], ['3', 2], ['10', 2]])
    expect(result.pairs.map(item => [item.key, item.draws])).toEqual([['1-2', 2], ['2-3', 2], ['2-10', 2], ['1-3', 1], ['1-10', 1], ['3-10', 1]])
    expect(result.triples.map(item => item.key)).toEqual(['1-2-3', '1-2-10', '2-3-10'])
    expect(result.singles[0]).toMatchObject({ share: 1, lastSeen: '2026-09-03' })
  })

  test('a six-ball draw produces six singles, fifteen pairs, and twenty triples', () => {
    const numbers = [6, 1, 5, 2, 4, 3]
    const result = analyzeResults([draw(numbers)])
    expect([result.singles.length, result.pairs.length, result.triples.length]).toEqual([6, 15, 20])
    expect(result.triples.every(item => item.draws === 1 && item.share === 1)).toBe(true)
    expect(numbers).toEqual([6, 1, 5, 2, 4, 3])
  })

  test('repeated digits require enough occurrences and never multiply a draw count', () => {
    const result = analyzeResults([draw([0, 0, 0, 1, 1, 2]), draw([0, 1, 2], '2026-09-02')])
    expect(result.singles.map(item => [item.key, item.draws])).toEqual([['0', 2], ['1', 2], ['2', 2]])
    expect(result.pairs.find(item => item.key === '0-1')?.draws).toBe(2)
    expect(result.pairs.find(item => item.key === '0-0')?.draws).toBe(1)
    expect(result.triples.find(item => item.key === '0-0-0')?.draws).toBe(1)
    expect(result.triples.find(item => item.key === '1-1-1')).toBeUndefined()
    expect(result.triples.find(item => item.key === '0-1-2')?.draws).toBe(2)
    expect(result.triples.every(item => item.share <= 1)).toBe(true)
  })

  test('missing numbers do not enter the denominator and prize winners do not weight draws', () => {
    const result = analyzeResults([draw(null, '2010-01-01'), draw([0, 1], '2026-09-03', 20), draw([0, 2], '2026-09-01', null)])
    expect(result).toMatchObject({ draws: 2, missingNumbers: 1, firstDate: '2026-09-01', lastDate: '2026-09-03', triples: [] })
    expect(result.singles.find(item => item.key === '0')).toMatchObject({ draws: 2, share: 1, lastSeen: '2026-09-03' })
    expect(result.singles.find(item => item.key === '1')?.share).toBe(0.5)
  })

  test('analyzes the full history beyond the table page and import limits', () => {
    const result = analyzeResults([...Array.from({ length: 6000 }, () => draw([1, 2])), draw([2, 3])])
    expect(result.draws).toBe(6001)
    expect(result.singles[0]).toMatchObject({ key: '2', draws: 6001 })
    expect(result.pairs[0]).toMatchObject({ key: '1-2', draws: 6000 })
  })

  test('empty or entirely unrecorded history has no rankings', () => {
    expect(analyzeResults([])).toEqual({ draws: 0, missingNumbers: 0, firstDate: null, lastDate: null, singles: [], pairs: [], triples: [] })
    expect(analyzeResults([draw(null)])).toMatchObject({ draws: 0, missingNumbers: 1, singles: [], pairs: [], triples: [] })
  })
})
