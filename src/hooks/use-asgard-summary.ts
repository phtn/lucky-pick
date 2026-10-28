import { useCallback, useEffect, useState } from 'octane'
import { isAbortError, readErrorMessage } from '@/lib/asgard/errors'
import { fetchGodUsers, type GodUserList } from '@/lib/asgard/gods-users'
import { loadResultReportUrl, loadResults, RESULT_GAMES, type ResultDataset, type ResultIssue } from '@/lib/results'

export interface AsgardSummary {
  /** One per game that answered; a game whose file failed is simply absent. */
  datasets: ResultDataset[] | undefined
  issues: ResultIssue[] | undefined
  roster: GodUserList | undefined
  /** The first failure, or null when every load succeeded. */
  error: string | null
  isLoading: boolean
  lastUpdatedAt: number | null
  refresh: () => void
}

type ReportPayload = { version: number; issues: ResultIssue[] }

async function loadIssues(signal: AbortSignal): Promise<ResultIssue[]> {
  const response = await fetch(await loadResultReportUrl(), { signal })
  if (!response.ok) throw new Error('Could not load the data report.')

  const report = (await response.json()) as ReportPayload
  if (report.version !== 1) throw new Error('The data report is out of date. Reload this page.')

  return report.issues
}

/**
 * Loads the three sources Asgard's overview reads: the generated draw ledger,
 * its import report, and the god roster.
 *
 * They are fetched together but settled independently — the roster scan is the
 * slowest and most failure-prone of the three, and losing it should not take
 * the draw ledger down with it.
 */
export function useAsgardSummary(): AsgardSummary {
  const [datasets, setDatasets] = useState<ResultDataset[] | undefined>(undefined)
  const [issues, setIssues] = useState<ResultIssue[] | undefined>(undefined)
  const [roster, setRoster] = useState<GodUserList | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const refresh = useCallback(() => setReloadToken((token) => token + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false

    setIsLoading(true)

    void (async () => {
      const [ledgerResults, issuesResult, rosterResult] = await Promise.all([
        Promise.allSettled(RESULT_GAMES.map((game) => loadResults(game.id))),
        Promise.allSettled([loadIssues(controller.signal)]).then(([result]) => result),
        Promise.allSettled([fetchGodUsers(controller.signal)]).then(([result]) => result)
      ])

      if (cancelled) return

      const failures: string[] = []
      const loaded = ledgerResults.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))

      if (loaded.length > 0) setDatasets(loaded)
      if (loaded.length < ledgerResults.length) {
        const missing = ledgerResults.length - loaded.length
        failures.push(`${missing} of ${ledgerResults.length} draw files could not be read.`)
      }

      if (issuesResult.status === 'fulfilled') setIssues(issuesResult.value)
      else if (!isAbortError(issuesResult.reason)) {
        failures.push(readErrorMessage(issuesResult.reason, 'Could not load the data report.'))
      }

      if (rosterResult.status === 'fulfilled') setRoster(rosterResult.value)
      else if (!isAbortError(rosterResult.reason)) {
        failures.push(readErrorMessage(rosterResult.reason, 'Could not load the god roster.'))
      }

      setError(failures[0] ?? null)
      setLastUpdatedAt(failures.length === 3 ? null : Date.now())
      setIsLoading(false)
    })()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [reloadToken])

  return { datasets, issues, roster, error, isLoading, lastUpdatedAt, refresh }
}
