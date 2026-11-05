import { asgardHandoffPath, isAsgardSubdomainHostname } from '@/lib/routing/asgard-subdomain'

/**
 * Where the console's own routes start on this host. On Asgard's subdomain the
 * console *is* the site, so its pages hang off the root and the base is empty.
 * Anywhere else — a workers.dev origin, a bare IP — the console lives under the
 * handoff path instead, so every link has to carry it.
 *
 * Paths are built through here rather than written out because the same page
 * has two addresses depending on the host, and the roster, the account page and
 * the sidebar all have to agree on which one they are on.
 */
export const asgardConsoleBase = (hostname: string) => (isAsgardSubdomainHostname(hostname) ? '' : asgardHandoffPath)

/**
 * One console path. `path` is root-relative with a leading slash, or empty for
 * the console root — which on the subdomain leaves nothing at all, so it falls
 * back to `/` rather than an empty href no link could follow.
 *
 * Slugs need no escaping: `isAccountSlug` admits only `[a-z0-9-]`.
 */
export const asgardConsolePath = (hostname: string, path: string) => `${asgardConsoleBase(hostname)}${path}` || '/'

export const asgardAccountsPath = (hostname: string) => asgardConsolePath(hostname, '/accounts')

export const asgardAccountPath = (hostname: string, slug: string) =>
  asgardConsolePath(hostname, `/accounts/${slug}`)

export const asgardGamesPath = (hostname: string) => asgardConsolePath(hostname, '/games')
