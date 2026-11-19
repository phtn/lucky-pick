import { AdminIdTokenError, mintAdminIdToken } from '@/lib/firebase-admin/admin-id-token'
import { getFirebaseAdminAuth } from '@/lib/firebase-admin/admin'
import { getVerifiedGodSession } from '@/lib/firebase-admin/server-auth'
import { getHostnameFromHostHeader } from '@/lib/routing/admin-subdomain'
import { isAsgardConsoleHostname } from '@/lib/routing/asgard-subdomain'
import { api } from '../../convex/_generated/api'
import { createConvexClient, RequestError } from './convex'

export interface AsgardResultsRouteEnvironment {
  convexUrl?: string
}

export type AsgardResultsResponse = {
  games: Awaited<ReturnType<typeof listResults>>
  /** Present on a POST: what the PCSO sync found and imported. */
  sync?: Awaited<ReturnType<typeof syncNow>>
}

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

function isAsgardRequest(request: Request) {
  const hostname =
    getHostnameFromHostHeader(request.headers.get('x-forwarded-host') ?? request.headers.get('host')) ??
    new URL(request.url).hostname

  return isAsgardConsoleHostname(hostname)
}

type AsgardConvexClient = ReturnType<typeof createConvexClient>

const listResults = (client: AsgardConvexClient) => client.query(api.tickets.q.resultsForAsgard, {})
const syncNow = (client: AsgardConvexClient) => client.action(api.pcsoSync.syncNow, {})

function isSameOriginRequest(request: Request) {
  const origin = request.headers.get('origin')
  return origin === null || origin === new URL(request.url).origin
}

// Convex reports our `ConvexError` messages inside the thrown Error's text.
function readConvexErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return null
  const match = /Uncaught ConvexError:\s*(.+?)(?:\n|$)/.exec(error.message)
  return match ? match[1].trim() : null
}

/**
 * `GET /api/asgard/results` — every enabled game's latest draws and the tickets
 * that won them, across every house. Authenticated like the games route: the
 * god session cookie is verified here, then a real ID token is minted so
 * Convex can enforce its own staff check.
 *
 * `POST /api/asgard/results` — scrape PCSO now, import any new draws, and
 * answer with what the sync did plus the re-read results.
 */
export async function handleAsgardResults(
  request: Request,
  environment: AsgardResultsRouteEnvironment = {}
): Promise<Response> {
  if (!isAsgardRequest(request)) return json({ error: 'Not found.' }, 404)
  if (request.method !== 'GET' && request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
  if (request.method === 'POST' && !isSameOriginRequest(request)) return json({ error: 'Invalid request origin.' }, 403)

  if (!getFirebaseAdminAuth()) return json({ error: 'Firebase Admin credentials are not configured.' }, 503)

  const session = await getVerifiedGodSession(request)
  if (!session) return json({ error: 'God access is required.' }, 401)

  try {
    const client = createConvexClient(await mintAdminIdToken(session.decodedToken.uid), environment.convexUrl)
    const sync = request.method === 'POST' ? await syncNow(client) : undefined
    const body: AsgardResultsResponse = { games: await listResults(client), ...(sync ? { sync } : {}) }
    return json(body)
  } catch (error) {
    if (error instanceof RequestError) return json({ error: error.message }, error.status)
    if (error instanceof AdminIdTokenError) {
      console.error('Asgard ID token mint failed:', error.message)
      return json({ error: 'The Asgard session could not be authenticated.' }, 500)
    }
    const convexMessage = readConvexErrorMessage(error)
    if (convexMessage && !/^Unauthorized/.test(convexMessage)) return json({ error: convexMessage }, 502)
    if (error instanceof Error && /Unauthorized|Unauthenticated/i.test(error.message)) {
      return json({ error: 'God access is required.' }, 403)
    }
    console.error('Asgard results route failed:', error)
    return json({ error: request.method === 'POST' ? 'Unable to sync from PCSO.' : 'Unable to load the results.' }, 500)
  }
}
