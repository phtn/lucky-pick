import type { FirebaseAdminUserSummary } from '@/lib/firebase-admin/admin-users'
import type { AsgardUserListResponse } from '@/server/asgard-user-routes'

// Type-only imports: the Firebase Admin modules behind these names never reach
// the client bundle.
export type GodUser = FirebaseAdminUserSummary
export type GodUserList = AsgardUserListResponse

const ASGARD_USERS_ENDPOINT = '/api/asgard/users'

async function readError(response: Response, fallback: string) {
  try {
    const body: unknown = await response.json()
    const error = typeof body === 'object' && body !== null ? (body as { error?: unknown }).error : undefined
    return typeof error === 'string' && error.length > 0 ? error : fallback
  } catch {
    return fallback
  }
}

export async function fetchGodUsers(signal?: AbortSignal): Promise<GodUserList> {
  const response = await fetch(ASGARD_USERS_ENDPOINT, { credentials: 'same-origin', signal })
  if (!response.ok) throw new Error(await readError(response, 'Could not load the god roster.'))
  return (await response.json()) as GodUserList
}

export function getGodUserLabel(user: GodUser) {
  return user.displayName ?? user.email ?? user.uid
}
