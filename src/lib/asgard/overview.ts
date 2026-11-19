import type { AsgardOverviewResponse } from '@/server/asgard-overview-routes'

// Type-only import: the Convex and Firebase Admin modules behind this response
// never reach the client bundle.
export type AsgardOverview = AsgardOverviewResponse
export type OverviewAccount = AsgardOverview['accounts'][number]
export type OverviewDraw = AsgardOverview['upcoming'][number]

export const ASGARD_OVERVIEW_ENDPOINT = '/api/asgard/overview'

export async function fetchOverview(signal?: AbortSignal): Promise<AsgardOverview> {
  const response = await fetch(ASGARD_OVERVIEW_ENDPOINT, { credentials: 'same-origin', signal })
  if (!response.ok) {
    let message = 'Could not load the overview.'
    try {
      const body = (await response.json()) as { error?: unknown }
      if (typeof body.error === 'string' && body.error.length > 0) message = body.error
    } catch {}
    throw new Error(message)
  }
  return (await response.json()) as AsgardOverview
}

/** What the house kept: sales less the prizes it paid. Negative when it paid out more. */
export const houseNet = (figures: { sales: number; payout: number }) => figures.sales - figures.payout
