import type { DecodedIdToken } from 'firebase-admin/auth'
import { getFirebaseCustomClaimsFromDecodedToken, hasFirebaseGodAccess } from '@/lib/firebase-admin/custom-claims'
import { getAppRootHostname } from '@/lib/routing/admin-subdomain'
import { getFirebaseAdminAuth } from './admin'
import { firebaseAdminSessionCookieName, firebaseGodsSessionCookieName, firebaseSessionCookieName } from './session'

type VerifiedSession = {
  customClaims: ReturnType<typeof getFirebaseCustomClaimsFromDecodedToken>
  decodedToken: DecodedIdToken
}

function getCookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return null

  for (const cookie of cookieHeader.split(';')) {
    const separatorIndex = cookie.indexOf('=')
    if (separatorIndex === -1) continue

    if (cookie.slice(0, separatorIndex).trim() !== name) continue

    const value = cookie.slice(separatorIndex + 1).trim()

    try {
      return decodeURIComponent(value)
    } catch {
      return value
    }
  }

  return null
}

function buildAppHomeUrl(request: Request) {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')

  if (!host) {
    return new URL('/', request.url)
  }

  const protocol = request.headers.get('x-forwarded-proto') ?? new URL(request.url).protocol.slice(0, -1)
  const appUrl = new URL(`${protocol}://${host}`)
  appUrl.hostname = getAppRootHostname(appUrl.hostname)
  appUrl.pathname = '/'
  appUrl.search = ''
  appUrl.hash = ''
  return appUrl
}

export async function getVerifiedSession(
  request: Request,
  cookieName = firebaseSessionCookieName
): Promise<VerifiedSession | null> {
  const auth = getFirebaseAdminAuth()

  if (!auth) {
    return null
  }

  const sessionCookie = getCookieValue(request.headers.get('cookie'), cookieName)

  if (!sessionCookie) {
    return null
  }

  try {
    const decodedToken = await auth.verifySessionCookie(sessionCookie, true)
    const customClaims = getFirebaseCustomClaimsFromDecodedToken(decodedToken)

    return {
      customClaims,
      decodedToken
    }
  } catch {
    return null
  }
}

export async function getVerifiedAdminSession(request: Request): Promise<VerifiedSession | null> {
  const session = await getVerifiedSession(request, firebaseAdminSessionCookieName)

  return session?.customClaims.admin === true ? session : null
}

/** A workspace session identifies a person; Convex checks their Account membership. */
export async function getVerifiedWorkspaceSession(request: Request): Promise<VerifiedSession | null> {
  return getVerifiedSession(request, firebaseAdminSessionCookieName)
}

export async function getVerifiedGodSession(request: Request): Promise<VerifiedSession | null> {
  const session = await getVerifiedSession(request, firebaseGodsSessionCookieName)

  return session && hasFirebaseGodAccess(session.customClaims) ? session : null
}

export async function requireAdminSession(request: Request): Promise<VerifiedSession | Response> {
  const session = await getVerifiedAdminSession(request)

  if (!session) {
    return Response.redirect(buildAppHomeUrl(request), 302)
  }

  return session
}

export async function requireGodSession(request: Request): Promise<VerifiedSession | Response> {
  const session = await getVerifiedGodSession(request)

  if (!session) {
    return Response.redirect(buildAppHomeUrl(request), 302)
  }

  return session
}
