import { adminRoutePrefix, isAdminSubdomainHostname } from '@/lib/routing/admin-subdomain'

/**
 * Where the admin console's own routes start on this host: the root on its
 * `admin.` subdomain, `/admin` everywhere else. Paths are built through here
 * because the same page has two addresses depending on the host.
 */
export const adminConsoleBase = (hostname: string) => (isAdminSubdomainHostname(hostname) ? '' : adminRoutePrefix)

export const adminPlayersPath = (hostname: string) => `${adminConsoleBase(hostname)}/players`

/** Convex ids are URL-safe, so neither segment needs escaping. */
export const adminPlayerPath = (hostname: string, accountId: string, userId: string) =>
  `${adminPlayersPath(hostname)}/${accountId}/${userId}`
