import { expect, test } from 'bun:test'
import { mergeResultHistory, watchResultHistory } from './results-history'
import type { LotteryResult, ResultDataset } from './results'

const draw = (date: string, time: LotteryResult['time'] = null): LotteryResult => ({ id: `lotto:${date}:${time ?? 'daily'}`, date, time, numbers: [1, 2, 3, 4, 5, 6], rawNumbers: '01-02-03-04-05-06', jackpotCents: 100, winners: 0 })

test('merged history preserves CSV values, deduplicates imports, and sorts the entire history', () => {
  const record = draw('2026-10-06')
  const dataset: ResultDataset = { version: 1, game: 'lotto', sourceRows: 3, excludedRows: 2, records: [record] }
  const shared = [draw('2026-10-07', '2PM'), draw('2026-10-07', '9PM'), draw('2015-01-01'), { ...record, jackpotCents: 999 }, draw('2015-01-01')]
  const merged = mergeResultHistory(dataset, shared)
  expect(merged.records.map(item => item.id)).toEqual(['lotto:2026-10-07:9PM', 'lotto:2026-10-07:2PM', record.id, 'lotto:2015-01-01:daily'])
  expect(merged.records[2]).toBe(record)
  expect(merged).toMatchObject({ sourceRows: 6, excludedRows: 2 })
  expect(dataset.records).toEqual([record])
  expect(mergeResultHistory(dataset, [record])).toBe(dataset)
})

test('live history loads all pages before publishing, then refreshes older additions', async () => {
  let changed!: () => void
  let version = 0
  const updates: LotteryResult[][] = []
  const loaded: Array<string | null> = []
  let notified!: () => void
  const delivered = () => new Promise<void>(resolve => { notified = resolve })
  const stop = watchResultHistory({
    subscribe(onChange) { changed = onChange; return () => {} },
    async loadPage(cursor) {
      loaded.push(cursor)
      return cursor === null ? { page: [draw('2026-10-06')], isDone: false, continueCursor: 'next' }
        : { page: version ? [draw('2015-01-01'), draw('2014-01-01')] : [draw('2015-01-01')], isDone: true, continueCursor: '' }
    },
  }, records => { updates.push(records); notified() }, error => { throw error })
  const first = delivered()
  changed()
  await first
  expect(updates).toHaveLength(1)
  expect(updates[0]).toHaveLength(2)
  expect(loaded).toEqual([null, 'next'])
  version++
  const second = delivered()
  changed()
  await second
  expect(updates[1]).toHaveLength(3)
  stop()
})

test('stale and unsubscribed requests cannot replace the current game or report errors', async () => {
  let changed!: () => void
  let resolveOld!: (value: { page: LotteryResult[]; isDone: boolean; continueCursor: string }) => void
  let calls = 0, unsubscribed = false
  const updates: LotteryResult[][] = [], errors: unknown[] = []
  let delivered!: () => void
  const next = new Promise<void>(resolve => { delivered = resolve })
  const stop = watchResultHistory({
    subscribe(onChange) { changed = onChange; return () => { unsubscribed = true } },
    loadPage() {
      calls++
      return calls === 1 ? new Promise(resolve => { resolveOld = resolve }) : Promise.resolve({ page: [draw('2026-10-07')], isDone: true, continueCursor: '' })
    },
  }, records => { updates.push(records); delivered() }, error => errors.push(error))
  changed()
  changed()
  await next
  resolveOld({ page: [draw('2026-10-06')], isDone: true, continueCursor: '' })
  await Promise.resolve()
  expect(updates).toHaveLength(1)
  expect(updates[0]![0]!.date).toBe('2026-10-07')
  stop()
  changed()
  await Promise.resolve()
  expect(unsubscribed).toBe(true)
  expect(updates).toHaveLength(1)
  expect(errors).toEqual([])
})
