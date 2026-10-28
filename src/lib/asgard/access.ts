import { hasFirebaseGodAccess, type FirebaseCustomClaims } from '@/lib/firebase-admin/custom-claims'

/**
 * Whether the app should offer Asgard to the account in front of it.
 *
 * Visibility is not access: the Worker verifies the `god` claim again on every
 * `/api/asgard/*` request, and the console's shell refuses a session without
 * it. This only decides whether an account is shown a door it can open, so it
 * answers false for a signed-out visitor, for an account whose claims have not
 * loaded yet, and for one whose claims came back without `god`.
 */
export function canOpenAsgard(isSignedIn: boolean, claims: FirebaseCustomClaims): boolean {
  return isSignedIn && hasFirebaseGodAccess(claims)
}
