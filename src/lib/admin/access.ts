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
