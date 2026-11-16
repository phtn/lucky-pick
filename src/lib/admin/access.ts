import { canUseAccount, type AccountStatus } from '@/lib/accounts/accounts'
import { hasFirebaseAdminAccess, type FirebaseCustomClaims } from '@/lib/firebase-admin/custom-claims'

/**
 * Whether the app should offer the admin console to the account in front of it.
 *
 * It is offered to a banker — the linked contact of at least one house that is
 * confirmed or active — and to anyone holding the `admin` claim. A house that
 * is still pending, or has been suspended or closed, does not make its contact
 * a banker: there is nothing of it to administer yet, or any more.
 *
 * Like `canOpenAsgard`, this is visibility, not access. It only decides whether
 * the menu shows the door; whatever the console serves has to authorize the
 * caller itself.
 */
export function canOpenAdmin(
  isSignedIn: boolean,
  claims: FirebaseCustomClaims,
  houses: readonly { status: AccountStatus }[] | undefined
): boolean {
  if (!isSignedIn) return false
  return hasFirebaseAdminAccess(claims) || (houses ?? []).some((house) => canUseAccount(house.status))
}

/**
 * What the admin console's shell does with the account in front of it.
 *
 * - `loading`: the session, or the houses that would make it a banker's, has
 *   not been read yet. Judging now would flash a refusal at a banker.
 * - `signed-out`: nobody is signed in on this origin.
 * - `unavailable`: there is no backend to ask who this account's houses are,
 *   so a banker cannot be told from anyone else.
 * - `denied`: signed in, and neither a banker nor an administrator.
 * - `open`: `canOpenAdmin` says yes.
 *
 * This keeps the console's pages from rendering for anyone else, and it is
 * still not the access check: every query and mutation those pages call
 * authorizes the caller from their own identity on the server.
 */
export type AdminGate = 'loading' | 'signed-out' | 'unavailable' | 'denied' | 'open'

export function readAdminGate(session: {
  isAuthLoading: boolean
  isSignedIn: boolean
  claims: FirebaseCustomClaims
  /** `undefined` until the caller's houses have been read. */
  houses: readonly { status: AccountStatus }[] | undefined
  /** False on a deployment with no backend, where `houses` can never arrive. */
  canReadHouses: boolean
}): AdminGate {
  if (session.isAuthLoading) return 'loading'
  if (!session.isSignedIn) return 'signed-out'
  if (canOpenAdmin(true, session.claims, session.houses)) return 'open'
  if (!session.canReadHouses) return 'unavailable'
  // An administrator was let in above without waiting; everyone else is only
  // refused once the houses have actually answered.
  return session.houses === undefined ? 'loading' : 'denied'
}
