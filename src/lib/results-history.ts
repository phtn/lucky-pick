import { RESULT_TIMES } from './results-normalize'
import type { LotteryResult, ResultDataset } from './results'

/** CSVs remain authoritative for existing draw identities. */
export function mergeResultRecords(baseline: LotteryResult[], shared: readonly LotteryResult[]): LotteryResult[] {
  const ids = new Set(baseline.map(record => record.id))
  const added: LotteryResult[] = []
  for (const record of shared) {
    if (ids.has(record.id)) continue
    ids.add(record.id)
    added.push(record)
  }
  if (!added.length) return baseline
  return [...baseline, ...added].sort((a, b) => b.date.localeCompare(a.date) || RESULT_TIMES.indexOf(b.time!) - RESULT_TIMES.indexOf(a.time!))
}

export function mergeResultHistory(dataset: ResultDataset, shared: readonly LotteryResult[]): ResultDataset {
  const records = mergeResultRecords(dataset.records, shared)
  if (records === dataset.records) return dataset
  return { ...dataset, records, sourceRows: dataset.sourceRows + records.length - dataset.records.length }
}

interface HistorySource {
  subscribe: (onChange: () => void, onError: (error: unknown) => void) => () => void
  loadPage: (cursor: string | null) => Promise<{ page: LotteryResult[]; isDone: boolean; continueCursor: string }>
}

/** Deliver complete histories only; cancel stale refreshes after game switches or new imports. */
export function watchResultHistory(source: HistorySource, onResults: (records: LotteryResult[]) => void, onError: (error: unknown) => void): () => void {
  let active = true, generation = 0
  const unsubscribe = source.subscribe(() => {
    if (!active) return
    const request = ++generation
    void (async () => {
      const records: LotteryResult[] = []
      let cursor: string | null = null
      do {
        const result = await source.loadPage(cursor)
        if (!active || request !== generation) return
        records.push(...result.page)
        if (result.isDone) break
        if (!result.continueCursor || result.continueCursor === cursor) throw new Error('Could not finish loading shared imports.')
        cursor = result.continueCursor
      } while (true)
      onResults(records)
    })().catch(error => { if (active && request === generation) onError(error) })
  }, error => { if (active) onError(error) })
  return () => { active = false; generation++; unsubscribe() }
}
