import { auth } from '@/lib/firebase'
import { ConvexClient } from 'convex/browser'
import { onAuthStateChanged } from 'firebase/auth'

const url = import.meta.env.PUBLIC_CONVEX_URL
// Debug mode disables proof mutations at their call sites, but owner-scoped
// queries must still be available to show the signed-in user's submissions.
export const convexClient = url ? new ConvexClient(url) : null

const fetchAuthToken = async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
  const user = auth?.currentUser
  return user ? user.getIdToken(forceRefreshToken) : null
}

export interface ConvexAuthState {
  isAuthenticated: boolean
  isLoading: boolean
  userId: string | null
}

// `convex/react` is a React-only package, so its `useConvexAuth` is unavailable
// here. This store mirrors the same contract off the client's `setAuth` change
// callback so an Octane hook can subscribe to it.
let convexAuthState: ConvexAuthState = { isAuthenticated: false, isLoading: Boolean(convexClient), userId: null }
const convexAuthListeners = new Set<() => void>()

const publishConvexAuthState = (next: ConvexAuthState) => {
  if (
    next.isAuthenticated === convexAuthState.isAuthenticated &&
    next.isLoading === convexAuthState.isLoading &&
    next.userId === convexAuthState.userId
  ) {
    return
  }

  convexAuthState = next
  for (const listener of convexAuthListeners) listener()
}

// Identity-stable so `useSyncExternalStore` never sees a changed snapshot for
// an unchanged state.
export const getConvexAuthState = (): ConvexAuthState => convexAuthState

export const subscribeToConvexAuthState = (onStoreChange: () => void) => {
  convexAuthListeners.add(onStoreChange)
  return () => {
    convexAuthListeners.delete(onStoreChange)
  }
}

if (convexClient && auth) {
  onAuthStateChanged(auth, (user) => {
    // Reconfigure only on sign-in and sign-out. Convex owns token rotation;
    // re-registering on every Firebase token change can create refresh races.
    publishConvexAuthState({ isAuthenticated: false, isLoading: Boolean(user), userId: null })
    convexClient.setAuth(fetchAuthToken, (isAuthenticated) => {
      if (auth?.currentUser?.uid !== user?.uid) return
      publishConvexAuthState({
        isAuthenticated,
        isLoading: false,
        userId: isAuthenticated ? (user?.uid ?? null) : null
      })
    })
  })
}
