import { auth } from '@/lib/firebase'
import { ConvexClient } from 'convex/browser'
import { onAuthStateChanged } from 'firebase/auth'
import { setPendingTronAccount } from '@/lib/tronweb/pending-account'
import { api } from '../../convex/_generated/api'

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

// Wallets key on `users` rows, so every signed-in user needs one. Tracking the
// uid keeps token refreshes (which re-fire the callback) from re-running it.
let ensuredUid: string | null = null

/**
 * Gives a user who has no TRON address one, on the first sign-in that finds the
 * field empty.
 *
 * The keypair is generated here, in the browser, and only the address is sent:
 * the private key is handed to its owner through `setPendingTronAccount` and
 * stored nowhere. `claimTrxAddress` answering `false` means the row already had
 * an address — another tab won, or this read was stale — and the key generated
 * here is then for an account nothing points at, so it is dropped unshown
 * rather than offered to someone as theirs.
 *
 * Nothing in here logs the account: a thrown Convex error carries the address at
 * most, but the key must not reach a console or an error reporter.
 */
const provisionTrxAddress = async (client: ConvexClient) => {
  if (!(await client.query(api.users.q.needsTrxAddress, {}))) return

  // Imported here, not at the top: keypair generation pulls in elliptic-curve
  // and mnemonic code worth ~230kB gzipped, and all but one sign-in per account
  // returns above without needing a byte of it.
  const { createTronAccount } = await import('@/lib/tronweb/account')
  const account = createTronAccount()
  const claimed = await client.mutation(api.users.m.claimTrxAddress, { trxAddress: account.address })
  if (claimed) setPendingTronAccount(account)
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

      if (!isAuthenticated) {
        ensuredUid = null
        return
      }
      const uid = user?.uid
      if (!uid || ensuredUid === uid) return
      ensuredUid = uid
      // A failed upsert must not block sign-in; clearing the marker lets the
      // next auth callback retry it.
      convexClient
        // Firebase leaves `picture` out of the ID token on several sign-in
        // paths, so the row would hold no photo at all; the client has one from
        // the same verified user and passes it as the fallback.
        .mutation(api.users.m.ensureCurrent, user?.photoURL ? { imageUrl: user.photoURL } : {})
        // Strictly after the upsert: provisioning reads the row that mutation
        // writes, and on a first-ever sign-in there is nothing to read before it.
        .then(() => provisionTrxAddress(convexClient))
        .catch((error) => {
          if (ensuredUid === uid) ensuredUid = null
          console.error('Failed to ensure the current user row', error)
        })
    })
  })
}
