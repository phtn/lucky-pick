import { getFirebaseAdminAuth } from '@/lib/firebase-admin/admin'
import type { FirebaseAdminUserSummary } from '@/lib/firebase-admin/admin-users'
import { canManageFirebaseAccessClaim } from '@/lib/firebase-admin/custom-claims'
import { FIREBASE_USER_SEARCH_RESULT_LIMIT, matchesFirebaseUserSearch, normalizeUserSearchQuery, scanFirebaseUsers } from '@/lib/firebase-admin/god-directory'
import { getVerifiedGodSession } from '@/lib/firebase-admin/server-auth'
import { getHostnameFromHostHeader } from '@/lib/routing/admin-subdomain'
import { isAsgardConsoleHostname } from '@/lib/routing/asgard-subdomain'

export type AsgardUserListResponse = {
  /** The caller's own uid, so the UI can decline to offer a self-revocation. */
  actorUid: string
  canManage: boolean
  scanned: number
  truncated: boolean
  users: FirebaseAdminUserSummary[]
}

// The roster is capped: it is a privileged list, not a directory browser, and
// the Firebase scan behind it is not free.
const GOD_LIST_RESULT_LIMIT = 200

function json(body: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store', ...headers }
  })
}

function isAsgardRequest(request: Request) {
  const hostname =
    getHostnameFromHostHeader(request.headers.get('x-forwarded-host') ?? request.headers.get('host')) ??
    new URL(request.url).hostname

  return isAsgardConsoleHostname(hostname)
}

/**
 * `GET /api/asgard/users` — everyone currently holding the `god` claim.
 * `GET /api/asgard/users?search=<query>` — anyone in the directory, so an
 * account's primary contact can be linked to the identity they already have.
 */
export async function handleAsgardUsers(request: Request): Promise<Response> {
  if (!isAsgardRequest(request)) return json({ error: 'Not found.' }, 404)
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405)

  if (!getFirebaseAdminAuth()) return json({ error: 'Firebase Admin credentials are not configured.' }, 503)

  const session = await getVerifiedGodSession(request)
  if (!session) return json({ error: 'God access is required.' }, 401)

  const actorClaims = session.customClaims
  const rawSearch = new URL(request.url).searchParams.get('search')
  const search = normalizeUserSearchQuery(rawSearch ?? '')

  try {
    // No search term means "who currently holds god"; a search term means
    // "who could be named on an account", so the whole directory is in scope.
    const scan =
      rawSearch === null
        ? await scanFirebaseUsers({ actorClaims, limit: GOD_LIST_RESULT_LIMIT, match: (user) => user.god })
        : search.length === 0
          ? { scanned: 0, truncated: false, users: [] }
          : await scanFirebaseUsers({
              actorClaims,
              limit: FIREBASE_USER_SEARCH_RESULT_LIMIT,
              match: (user) => matchesFirebaseUserSearch(user, search)
            })

    const body: AsgardUserListResponse = {
      actorUid: session.decodedToken.uid,
      canManage: canManageFirebaseAccessClaim(actorClaims, 'god'),
      scanned: scan.scanned,
      truncated: scan.truncated,
      users: scan.users
    }

    return json(body)
  } catch {
    return json({ error: 'Could not read the Firebase user directory.' }, 502)
  }
}
