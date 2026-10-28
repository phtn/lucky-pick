import type { UserIdentity } from 'convex/server'

/**
 * Claims are minted by Firebase and carried on the verified ID token, so these
 * read the identity rather than any value the caller supplied.
 */
export const isGod = (identity: UserIdentity) => identity.god === true
export const isTopGod = (identity: UserIdentity) => identity.topg === true

/** Anyone who may read the console's data: gods and platform admins alike. */
export const isPlatformStaff = (identity: UserIdentity) => identity.god === true || identity.admin === true
