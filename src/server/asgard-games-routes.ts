import { GAME_IDS, type BetType, type GameId } from '@/lib/games'
import { BET_TYPE_VALUES, MAX_STAKE_OPTIONS, isStake, isTicketCost } from '@/lib/game-settings'
import { AdminIdTokenError, mintAdminIdToken } from '@/lib/firebase-admin/admin-id-token'
import { getFirebaseAdminAuth } from '@/lib/firebase-admin/admin'
import { getVerifiedGodSession } from '@/lib/firebase-admin/server-auth'
import { getHostnameFromHostHeader } from '@/lib/routing/admin-subdomain'
import { isAsgardConsoleHostname } from '@/lib/routing/asgard-subdomain'
import { api } from '../../convex/_generated/api'
import { createConvexClient, RequestError } from './convex'

export interface AsgardGamesRouteEnvironment {
  convexUrl?: string
}

export type AsgardGamesListResponse = {
  games: Awaited<ReturnType<typeof listGames>>
}

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

function isAsgardRequest(request: Request) {
  const hostname =
    getHostnameFromHostHeader(request.headers.get('x-forwarded-host') ?? request.headers.get('host')) ??
    new URL(request.url).hostname

  return isAsgardConsoleHostname(hostname)
}

function isSameOriginRequest(request: Request) {
  const origin = request.headers.get('origin')
  return origin === null || origin === new URL(request.url).origin
}

type AsgardConvexClient = ReturnType<typeof createConvexClient>
type GodSession = NonNullable<Awaited<ReturnType<typeof getVerifiedGodSession>>>

/**
 * The same arrangement the accounts route uses: Asgard authenticates with a god
 * session cookie, which Convex cannot verify, so a real ID token is re-minted
 * for the already-verified god. Convex still enforces its own rules — the
 * mutations behind this endpoint require the `god` claim themselves.
 */
async function getAsgardConvexClient(
  session: GodSession,
  environment: AsgardGamesRouteEnvironment
): Promise<AsgardConvexClient> {
  return createConvexClient(await mintAdminIdToken(session.decodedToken.uid), environment.convexUrl)
}

const listGames = (client: AsgardConvexClient) => client.query(api.games.q.listForAsgard, {})

// Convex reports our `ConvexError` messages inside the thrown Error's text.
// Surface that to the operator rather than a generic failure.
function readConvexErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return null

  const match = /Uncaught ConvexError:\s*(.+?)(?:\n|$)/.exec(error.message)
  return match ? match[1].trim() : null
}

function handleRouteError(error: unknown, fallback: string) {
  if (error instanceof RequestError) return json({ error: error.message }, error.status)
  if (error instanceof AdminIdTokenError) {
    console.error('Asgard ID token mint failed:', error.message)
    return json({ error: 'The Asgard session could not be authenticated.' }, 500)
  }

  const convexMessage = readConvexErrorMessage(error)
  if (convexMessage) return json({ error: convexMessage }, 400)

  if (error instanceof Error && /Unauthorized|Unauthenticated/i.test(error.message)) {
    return json({ error: 'God access is required.' }, 403)
  }

  console.error('Asgard games route failed:', error)
  return json({ error: fallback }, 500)
}

const readObject = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

const isGameId = (value: unknown): value is GameId => GAME_IDS.includes(value as GameId)
const isBetType = (value: unknown): value is BetType => BET_TYPE_VALUES.includes(value as BetType)

/**
 * What one request asks the console to change. Convex re-validates every field
 * and owns the real bounds, so this only narrows `unknown` — and refuses an
 * action it does not know, which would otherwise read as a no-op success.
 */
type GamesWrite =
  | { action: 'seed' }
  | { action: 'game'; gameId: GameId; enabled: boolean }
  | {
      action: 'betType'
      gameId: GameId
      betType: BetType
      enabled?: boolean
      ticketCost?: number
      stakes?: number[]
    }

function readGamesWrite(body: unknown): { write: GamesWrite } | { error: string } {
  const payload = readObject(body)
  const action = payload.action

  if (action === 'seed') return { write: { action: 'seed' } }

  if (!isGameId(payload.gameId)) return { error: 'That is not a game this app runs.' }

  if (action === 'game') {
    if (typeof payload.enabled !== 'boolean') return { error: 'A game is either enabled or it is not.' }
    return { write: { action: 'game', gameId: payload.gameId, enabled: payload.enabled } }
  }

  if (action !== 'betType') return { error: 'Unknown games action.' }
  if (!isBetType(payload.betType)) return { error: 'That is not a bet type this app sells.' }

  const write: GamesWrite = { action: 'betType', gameId: payload.gameId, betType: payload.betType }

  if (payload.enabled !== undefined) {
    if (typeof payload.enabled !== 'boolean') return { error: 'A bet type is either enabled or it is not.' }
    write.enabled = payload.enabled
  }

  if (payload.ticketCost !== undefined) {
    if (!isTicketCost(payload.ticketCost)) return { error: 'That is not a valid ticket cost.' }
    write.ticketCost = payload.ticketCost
  }

  if (payload.stakes !== undefined) {
    if (!Array.isArray(payload.stakes) || payload.stakes.length > MAX_STAKE_OPTIONS) {
      return { error: 'That is not a valid list of stakes.' }
    }
    if (!payload.stakes.every(isStake)) return { error: 'Every stake must be a whole peso amount.' }
    write.stakes = payload.stakes
  }

  if (write.enabled === undefined && write.ticketCost === undefined && write.stakes === undefined) {
    return { error: 'Nothing to change.' }
  }

  return { write }
}

/**
 * `GET /api/asgard/games` — the game grid: every game, its bet types, their
 * prices and the stakes they offer.
 * `POST /api/asgard/games` — one change to it: `seed` writes the rows a
 * never-configured deployment is missing, `game` puts a game on or off sale,
 * and `betType` toggles a cell or sets its cost and stakes.
 *
 * Every response is the whole grid, re-read after the write: the rows are
 * ordered and capped server-side, so the console should not patch its own copy.
 */
export async function handleAsgardGames(
  request: Request,
  environment: AsgardGamesRouteEnvironment = {}
): Promise<Response> {
  if (!isAsgardRequest(request)) return json({ error: 'Not found.' }, 404)

  if (request.method !== 'GET' && request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405)
  }
  if (request.method === 'POST' && !isSameOriginRequest(request)) {
    return json({ error: 'Invalid request origin.' }, 403)
  }

  // Checked before the session so an unconfigured deployment reports what is
  // actually wrong rather than claiming the caller lacks access.
  if (!getFirebaseAdminAuth()) return json({ error: 'Firebase Admin credentials are not configured.' }, 503)

  const session = await getVerifiedGodSession(request)
  if (!session) return json({ error: 'God access is required.' }, 401)

  try {
    const client = await getAsgardConvexClient(session, environment)

    if (request.method === 'GET') {
      const listed: AsgardGamesListResponse = { games: await listGames(client) }
      return json(listed)
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return json({ error: 'A valid JSON request body is required.' }, 400)
    }

    const parsed = readGamesWrite(body)
    if ('error' in parsed) return json({ error: parsed.error }, 400)

    const { write } = parsed
    if (write.action === 'seed') {
      await client.mutation(api.games.m.seed, {})
    } else if (write.action === 'game') {
      await client.mutation(api.games.m.setGameEnabled, { gameId: write.gameId, enabled: write.enabled })
    } else {
      await client.mutation(api.games.m.updateBetType, {
        gameId: write.gameId,
        betType: write.betType,
        ...(write.enabled === undefined ? {} : { enabled: write.enabled }),
        ...(write.ticketCost === undefined ? {} : { ticketCost: write.ticketCost }),
        ...(write.stakes === undefined ? {} : { stakes: write.stakes })
      })
    }

    const updated: AsgardGamesListResponse = { games: await listGames(client) }
    return json(updated)
  } catch (error) {
    return handleRouteError(
      error,
      request.method === 'POST' ? 'Unable to change the game configuration.' : 'Unable to load the games.'
    )
  }
}
