import { ASGARD_GAMES_ENDPOINT } from '@/lib/asgard/games-api'
import type { BetType, GameId } from '@/lib/games'
import type { AsgardGamesListResponse } from '@/server/asgard-games-routes'

// Type-only import: the Convex and Firebase Admin modules behind this response
// never reach the client bundle.
export type GameRow = AsgardGamesListResponse['games'][number]
export type GameBetTypeRow = GameRow['betTypes'][number]

async function readError(response: Response, fallback: string) {
  try {
    const body: unknown = await response.json()
    const error = typeof body === 'object' && body !== null ? (body as { error?: unknown }).error : undefined
    return typeof error === 'string' && error.length > 0 ? error : fallback
  } catch {
    return fallback
  }
}

async function requestJson<T>(init: RequestInit, fallback: string): Promise<T> {
  const response = await fetch(ASGARD_GAMES_ENDPOINT, { credentials: 'same-origin', ...init })
  if (!response.ok) throw new Error(await readError(response, fallback))
  return (await response.json()) as T
}

export const fetchGames = (signal?: AbortSignal) =>
  requestJson<AsgardGamesListResponse>({ signal }, 'Could not load the games.')

const post = (body: unknown, fallback: string) =>
  requestJson<AsgardGamesListResponse>(
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
    fallback
  )

/** Writes a row for every game the table is missing. Never resets a configured one. */
export const seedGames = () => post({ action: 'seed' }, 'Could not seed the games.')

export const setGameEnabled = (gameId: GameId, enabled: boolean) =>
  post({ action: 'game', gameId, enabled }, 'Could not change that game.')

export interface BetTypeChange {
  enabled?: boolean
  ticketCost?: number
  stakes?: number[]
}

export const updateBetType = (gameId: GameId, betType: BetType, change: BetTypeChange) =>
  post({ action: 'betType', gameId, betType, ...change }, 'Could not change that bet type.')

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit'
})

export const formatConfiguredAt = (value: number | null) => (value === null ? 'never' : timeFormatter.format(value))

/** How many of a game's six bet types are on sale. */
export const countEnabledBetTypes = (row: GameRow) => row.betTypes.filter((bet) => bet.enabled).length
