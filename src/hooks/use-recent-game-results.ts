import { useEffect, useMemo, useState } from 'octane'
import { api } from '../../convex/_generated/api'
import { RESULT_GAME_IDS } from '../../convex/tickets/d'
import { convexClient } from '@/lib/convex-client'
import type { GameId } from '@/lib/games'
import { mergeResultRecords } from '@/lib/results-history'
import { loadRecentResults, RECENT_RESULT_COUNT, type LotteryResult, type ResultGameId } from '@/lib/results'

const games = Object.entries(RESULT_GAME_IDS) as [keyof typeof RESULT_GAME_IDS, GameId][]

export type GameResults = Partial<Record<GameId, LotteryResult[]>>

export function useRecentGameResults(): GameResults {
  const [baseline, setBaseline] = useState<Partial<Record<ResultGameId, LotteryResult[]>>>({})
  const [shared, setShared] = useState<GameResults>({})

  useEffect(() => {
    let active = true
    void loadRecentResults().then(games => {
      if (active) setBaseline(games)
    }).catch(error => {
      if (active) console.error('Could not load bundled draw results', error)
    })

    const client = convexClient
    const subscriptions = client ? games.map(([game, id]) => client.onUpdate(
      api.resultsImport.list,
      { game, paginationOpts: { cursor: null, numItems: RECENT_RESULT_COUNT } },
      ({ page }) => {
        if (active) setShared(previous => ({ ...previous, [id]: page }))
      },
      error => console.error(`Could not load shared draw results for ${id}`, error),
    )) : []

    return () => {
      active = false
      for (const unsubscribe of subscriptions) unsubscribe()
    }
  }, [])

  return useMemo(() => {
    const results: GameResults = {}
    for (const [game, id] of games) {
      results[id] = mergeResultRecords(baseline[game] ?? [], shared[id] ?? []).slice(0, RECENT_RESULT_COUNT)
    }
    return results
  }, [baseline, shared])
}
