import { api } from '../../convex/_generated/api'
import { convexClient } from './convex-client'
import { watchResultHistory } from './results-history'
import type { LotteryResult, ResultGameId } from './results'
export { mergeResultHistory } from './results-history'

/** Watch the newest insertion, then load every page, including older imported draws. */
export function watchSharedResults(game: ResultGameId, onResults: (records: LotteryResult[]) => void, onError: (error: unknown) => void): () => void {
  const client = convexClient
  if (!client) {
    let active = true
    void Promise.resolve().then(() => { if (active) onResults([]) })
    return () => { active = false }
  }
  return watchResultHistory({
    subscribe: (onChange, onFailure) => client.onUpdate(api.resultsImport.revision, { game }, onChange, onFailure),
    loadPage: cursor => client.query(api.resultsImport.list, { game, paginationOpts: { cursor, numItems: 500 } }),
  }, onResults, onError)
}
