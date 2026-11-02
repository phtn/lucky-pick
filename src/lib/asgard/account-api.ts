import { isAccountSlug } from '@/lib/accounts/accounts'

/** The console's account API. The roster is the endpoint itself; one account hangs off it. */
export const ASGARD_ACCOUNTS_ENDPOINT = '/api/asgard/accounts'

/** Slugs need no escaping: `isAccountSlug` admits only `[a-z0-9-]`. */
export const asgardAccountEndpoint = (slug: string) => `${ASGARD_ACCOUNTS_ENDPOINT}/${slug}`

/**
 * What a request to the accounts endpoint is asking for. `unknown` covers a
 * path this endpoint does not serve *and* a segment that could not be an
 * account slug, so a junk URL is refused here rather than spending a Convex
 * query to discover there is no such account.
 */
export type AsgardAccountRoute = { kind: 'roster' } | { kind: 'account'; slug: string } | { kind: 'unknown' }

export function readAsgardAccountRoute(pathname: string): AsgardAccountRoute {
  if (pathname === ASGARD_ACCOUNTS_ENDPOINT) return { kind: 'roster' }
  if (!pathname.startsWith(`${ASGARD_ACCOUNTS_ENDPOINT}/`)) return { kind: 'unknown' }

  const rest = pathname.slice(ASGARD_ACCOUNTS_ENDPOINT.length + 1)
  if (rest.length === 0) return { kind: 'roster' }

  return isAccountSlug(rest) ? { kind: 'account', slug: rest } : { kind: 'unknown' }
}
