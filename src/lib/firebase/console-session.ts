import { signInWithCustomToken } from 'firebase/auth'
import { useEffect } from 'octane'
import { auth, isFirebaseConfigured } from './'

/** The consoles that hand out a custom token for their own session cookie. */
export type ConsoleScope = 'admin' | 'asgard'

const tokenPaths: Record<ConsoleScope, string> = {
  admin: '/api/admin/session/token',
  asgard: '/api/asgard/session/token'
}

/**
 * Firebase auth state is per-origin. A console reached through the handoff holds
 * only a session cookie, so its client SDK has no user: no display name, no
 * photo, and no custom claims for the UI to gate on. This trades the cookie the
 * browser already carries for a custom token and signs in with it, giving the
 * console the same client session the main app has.
 */
async function adoptConsoleSession(scope: ConsoleScope) {
  const response = await fetch(tokenPaths[scope], {
    method: 'POST',
    credentials: 'same-origin',
    signal: AbortSignal.timeout(10_000)
  })

  if (!response.ok) return

  const payload: unknown = await response.json()
  const customToken =
    typeof payload === 'object' && payload !== null ? (payload as { customToken?: unknown }).customToken : undefined

  if (typeof customToken !== 'string' || customToken.length === 0) return

  await signInWithCustomToken(auth, customToken)
}

/**
 * Signs the console's origin in once its session is verified, unless the SDK
 * already has a user there. `isReady` gates it so the exchange only runs behind
 * a session the server has already accepted.
 */
export function useConsoleFirebaseSession(scope: ConsoleScope, isReady: boolean) {
  useEffect(() => {
    if (!isReady || !isFirebaseConfigured || auth.currentUser) return

    let cancelled = false

    void adoptConsoleSession(scope).catch((error) => {
      // The console still works off its session cookie; only the profile and
      // claim-gated links are missing, so this must not break the page.
      if (!cancelled) console.error(`Could not restore the ${scope} sign-in.`, error)
    })

    return () => {
      cancelled = true
    }
  }, [scope, isReady])
}
