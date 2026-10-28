import { getSharedCookieDomain } from '@/lib/routing/admin-subdomain'

const SESSION_ENDPOINT = '/api/auth/session'

export const firebaseSessionCookieName = 'lucky-pick-session'
export const firebaseAdminSessionCookieName = 'lucky-pick-admin-session'
export const firebaseGodsSessionCookieName = 'lucky-pick-gods-session'
export const firebaseSessionCookieMaxAgeMs = 5 * 24 * 60 * 60 * 1000
export const firebaseSessionCookieMaxAgeSeconds = firebaseSessionCookieMaxAgeMs / 1000

export function getFirebaseSessionCookieDomain(hostname: string) {
  return getSharedCookieDomain(hostname)
}

type SessionErrorPayload = {
  error?: unknown
}

async function requestFirebaseSession(method: 'POST' | 'DELETE', body?: Record<string, unknown>): Promise<void> {
  const response = await fetch(SESSION_ENDPOINT, {
    method,
    cache: 'no-store',
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  })

  if (response.ok) {
    return
  }

  let errorMessage = 'Unable to update your authentication session.'

  try {
    const payload = (await response.json()) as SessionErrorPayload
    if (typeof payload.error === 'string' && payload.error.trim().length > 0) {
      errorMessage = payload.error
    }
  } catch {
    // Fall back to the default error message.
  }

  throw new Error(errorMessage)
}

export async function createFirebaseSession(idToken: string): Promise<void> {
  await requestFirebaseSession('POST', { idToken })
}

export async function clearFirebaseSession(): Promise<void> {
  await requestFirebaseSession('DELETE')
}
