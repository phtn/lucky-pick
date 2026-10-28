import { getFirebaseAdminAuth } from '@/lib/firebase-admin/admin'
import { getFirebaseCustomClaimsFromDecodedToken, hasFirebaseGodAccess } from '@/lib/firebase-admin/custom-claims'
import { getVerifiedGodSession } from '@/lib/firebase-admin/server-auth'
import {
  firebaseGodsSessionCookieName,
  firebaseSessionCookieMaxAgeMs,
  firebaseSessionCookieMaxAgeSeconds
} from '@/lib/firebase-admin/session'
import { getHostnameFromHostHeader } from '@/lib/routing/admin-subdomain'
import { isAsgardConsoleHostname } from '@/lib/routing/asgard-subdomain'

function json(body: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store', ...headers }
  })
}

/**
 * Asgard's endpoints answer on the console's origin and nowhere else: the
 * session cookie is scoped to that host, and serving the same routes on a host
 * that has its own Asgard subdomain would hand a second, unscoped way to mint
 * it. Where no subdomain is possible, the main origin *is* the console's.
 */
function isAsgardRequest(request: Request) {
  const hostname =
    getHostnameFromHostHeader(request.headers.get('x-forwarded-host') ?? request.headers.get('host')) ??
    new URL(request.url).hostname

  return isAsgardConsoleHostname(hostname)
}

function serializeAsgardSessionCookie(value: string, request: Request, maxAge: number) {
  const attributes = [
    `${firebaseGodsSessionCookieName}=${encodeURIComponent(value)}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Lax'
  ]

  if (new URL(request.url).protocol === 'https:') attributes.push('Secure')

  return attributes.join('; ')
}

/**
 * `GET /api/asgard/session` — who the current session belongs to.
 * `POST /api/asgard/session` — trades a handoff ID token for the session cookie.
 * `DELETE /api/asgard/session` — clears it.
 */
export async function handleAsgardSession(request: Request): Promise<Response> {
  if (!isAsgardRequest(request)) return json({ error: 'Not found.' }, 404)

  if (request.method === 'GET') {
    // Credentials first: without them no cookie can be verified, so every
    // caller would be told their access was refused when the deployment is
    // simply unconfigured.
    if (!getFirebaseAdminAuth()) return json({ error: 'Firebase Admin credentials are not configured.' }, 503)

    const session = await getVerifiedGodSession(request)
    if (!session) return json({ error: 'God access is required.' }, 401)

    return json({
      email: typeof session.decodedToken.email === 'string' ? session.decodedToken.email : null,
      uid: session.decodedToken.uid
    })
  }

  if (request.method === 'DELETE') {
    return json({ ok: true }, 200, {
      'set-cookie': serializeAsgardSessionCookie('', request, 0)
    })
  }

  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
  if (request.headers.get('origin') !== null && request.headers.get('origin') !== new URL(request.url).origin) {
    return json({ error: 'Invalid request origin.' }, 403)
  }

  let idToken: unknown
  try {
    const body: unknown = await request.json()
    idToken = typeof body === 'object' && body !== null ? (body as { idToken?: unknown }).idToken : undefined
  } catch {
    return json({ error: 'A valid JSON request body is required.' }, 400)
  }

  if (typeof idToken !== 'string' || idToken.trim().length === 0) {
    return json({ error: 'A Firebase ID token is required.' }, 400)
  }

  const auth = getFirebaseAdminAuth()
  if (!auth) return json({ error: 'Firebase Admin credentials are not configured.' }, 503)

  try {
    const decodedToken = await auth.verifyIdToken(idToken, true)
    if (!hasFirebaseGodAccess(getFirebaseCustomClaimsFromDecodedToken(decodedToken))) {
      return json({ error: 'God access is required.' }, 403)
    }

    const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn: firebaseSessionCookieMaxAgeMs })
    return json({ ok: true }, 200, {
      'set-cookie': serializeAsgardSessionCookie(sessionCookie, request, firebaseSessionCookieMaxAgeSeconds)
    })
  } catch {
    return json({ error: 'Your sign-in session is invalid or expired.' }, 401)
  }
}

/**
 * `POST /api/asgard/session/token` — the session cookie names the uid, and the
 * custom token re-establishes that god's own client session on Asgard's origin,
 * which Firebase auth state does not cross.
 */
export async function handleAsgardSessionToken(request: Request): Promise<Response> {
  if (!isAsgardRequest(request)) return json({ error: 'Not found.' }, 404)
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
  if (request.headers.get('origin') !== null && request.headers.get('origin') !== new URL(request.url).origin) {
    return json({ error: 'Invalid request origin.' }, 403)
  }

  const auth = getFirebaseAdminAuth()
  if (!auth) return json({ error: 'Firebase Admin credentials are not configured.' }, 503)

  const session = await getVerifiedGodSession(request)
  if (!session) return json({ error: 'God access is required.' }, 401)

  try {
    return json({ customToken: await auth.createCustomToken(session.decodedToken.uid) })
  } catch {
    return json({ error: 'Could not issue a sign-in token.' }, 500)
  }
}
