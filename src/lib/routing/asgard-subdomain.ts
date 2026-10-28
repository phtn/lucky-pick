import { getAllowedRootDomain } from '@/lib/subdomains/config'
import { isIpHostname } from './admin-subdomain'

export const asgardSubdomainLabel = 'asgard'

/**
 * The path on the main origin that hands a god off to Asgard. Asgard itself
 * lives at the root of its own subdomain, so the handoff only exists to mint an
 * ID token on the origin the client SDK is signed in on.
 */
export const asgardHandoffPath = '/asgard'

function normalizeHostname(hostname: string) {
  return hostname.trim().toLowerCase().replace(/\.$/, '')
}

export function isAsgardSubdomainHostname(hostname: string) {
  return normalizeHostname(hostname).startsWith(`${asgardSubdomainLabel}.`)
}

export function getAsgardAppRootHostname(hostname: string) {
  const normalizedHostname = normalizeHostname(hostname)
  const appHostname = isAsgardSubdomainHostname(normalizedHostname)
    ? normalizedHostname.slice(asgardSubdomainLabel.length + 1)
    : normalizedHostname

  return getAllowedRootDomain(appHostname) ?? appHostname
}

/**
 * Whether Asgard can have a subdomain of its own on this host.
 *
 * `*.workers.dev` cannot: the certificate Cloudflare serves there is a
 * single-label wildcard, so `asgard.<worker>.<account>.workers.dev` fails TLS
 * before any request is made. A bare IP has no subdomain to speak of either.
 * On both, the console falls back to the handoff path on the origin it is
 * already on, and moves to its own subdomain once a real domain is in front.
 */
export function supportsAsgardSubdomain(hostname: string) {
  const normalizedHostname = normalizeHostname(hostname)

  if (normalizedHostname.length === 0) return false
  if (isIpHostname(normalizedHostname)) return false

  return !normalizedHostname.endsWith('.workers.dev')
}

/**
 * Whether this host is where the console itself runs — its own subdomain, or
 * the main origin standing in for one. It decides who mints the session: on the
 * console's own subdomain the token arrives through the handoff, while a
 * stand-in origin already holds the client's sign-in and can exchange it
 * directly.
 */
export function isAsgardConsoleHostname(hostname: string) {
  return isAsgardSubdomainHostname(hostname) || !supportsAsgardSubdomain(hostname)
}

/**
 * Sends the god to Asgard's root with their ID token in the fragment, which the
 * console trades for its own session cookie. A fragment never reaches a server
 * log or a proxy, unlike a query string.
 */
export function buildAsgardHandoffUrl(currentUrl: URL, idToken: string) {
  const appHostname = getAsgardAppRootHostname(currentUrl.hostname)
  const handoffUrl = new URL(currentUrl)

  handoffUrl.hostname = supportsAsgardSubdomain(appHostname) ? `${asgardSubdomainLabel}.${appHostname}` : appHostname
  // Asgard's own root. Where the subdomain is unsupported (a bare IP), the
  // handoff path on the main origin is the console instead.
  handoffUrl.pathname = supportsAsgardSubdomain(appHostname) ? '/' : asgardHandoffPath
  handoffUrl.search = ''
  handoffUrl.hash = new URLSearchParams({ idToken }).toString()

  return handoffUrl
}
