import type { AsgardResultsResponse } from '@/server/asgard-results-routes'

// Type-only import: the Convex and Firebase Admin modules behind this response
// never reach the client bundle.
export type ResultsGame = AsgardResultsResponse['games'][number]
export type ResultsDraw = ResultsGame['draws'][number]

export const ASGARD_RESULTS_ENDPOINT = '/api/asgard/results'

export type SyncSummary = NonNullable<AsgardResultsResponse['sync']>

async function request(init: RequestInit, fallback: string): Promise<AsgardResultsResponse> {
  const response = await fetch(ASGARD_RESULTS_ENDPOINT, { credentials: 'same-origin', ...init })
  if (!response.ok) {
    let message = fallback
    try {
      const body = (await response.json()) as { error?: unknown }
      if (typeof body.error === 'string' && body.error.length > 0) message = body.error
    } catch {}
    throw new Error(message)
  }
  return (await response.json()) as AsgardResultsResponse
}

export const fetchResults = (signal?: AbortSignal) => request({ signal }, 'Could not load the results.')

/** Scrape PCSO now; the answer carries the sync summary and the re-read results. */
export const syncResults = () => request({ method: 'POST' }, 'Could not sync from PCSO.')
