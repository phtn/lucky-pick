import { AdminIdTokenError, mintAdminIdToken } from '@/lib/firebase-admin/admin-id-token'
import { getFirebaseAdminAuth } from '@/lib/firebase-admin/admin'
import { getVerifiedGodSession } from '@/lib/firebase-admin/server-auth'
import { getHostnameFromHostHeader } from '@/lib/routing/admin-subdomain'
import { isAsgardConsoleHostname } from '@/lib/routing/asgard-subdomain'
import { api } from '../../convex/_generated/api'
import { createConvexClient, RequestError } from './convex'

export interface AsgardOverviewRouteEnvironment {
  convexUrl?: string
}

type AsgardConvexClient = ReturnType<typeof createConvexClient>

const readOverview = (client: AsgardConvexClient, now: number) => client.query(api.tickets.overview.forAsgard, { now })

export type AsgardOverviewResponse = Awaited<ReturnType<typeof readOverview>> & {
  /** When the figures were read, so the console can say how fresh they are. */
  readAt: number
}

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

function isAsgardRequest(request: Request) {
  const hostname =
    getHostnameFromHostHeader(request.headers.get('x-forwarded-host') ?? request.headers.get('host')) ??
    new URL(request.url).hostname

  return isAsgardConsoleHostname(hostname)
}

/**
 * `GET /api/asgard/overview` — every account's ticket sales and outcomes over
 * the recent window, and what each has sold into the upcoming draws. The clock
 * is read here, since the Convex query must not read it itself.
 */
export async function handleAsgardOverview(
  request: Request,
  environment: AsgardOverviewRouteEnvironment = {}
): Promise<Response> {
  if (!isAsgardRequest(request)) return json({ error: 'Not found.' }, 404)
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405)

  if (!getFirebaseAdminAuth()) return json({ error: 'Firebase Admin credentials are not configured.' }, 503)

  const session = await getVerifiedGodSession(request)
  if (!session) return json({ error: 'God access is required.' }, 401)

  try {
    const client = createConvexClient(await mintAdminIdToken(session.decodedToken.uid), environment.convexUrl)
    const readAt = Date.now()
    const body: AsgardOverviewResponse = { ...(await readOverview(client, readAt)), readAt }
    return json(body)
  } catch (error) {
    if (error instanceof RequestError) return json({ error: error.message }, error.status)
    if (error instanceof AdminIdTokenError) {
      console.error('Asgard ID token mint failed:', error.message)
      return json({ error: 'The Asgard session could not be authenticated.' }, 500)
    }
    if (error instanceof Error && /Unauthorized|Unauthenticated/i.test(error.message)) {
      return json({ error: 'God access is required.' }, 403)
    }
    console.error('Asgard overview route failed:', error)
    return json({ error: 'Unable to load the overview.' }, 500)
  }
}
