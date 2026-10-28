/**
 * Subdomain configuration for the Next.js app
 * Maps subdomains to their corresponding app routes
 */

export const SUBDOMAIN_CONFIG = {
  /**
   * Available subdomains and their route mappings
   */
  subdomains: {},

  /**
   * The main/root domain (no subdomain)
   * Requests to this will serve the root app
   */
  rootDomain: 'localhost',

  /**
   * Domains where subdomain routing should be active
   * Add your production domains here
   */
  allowedDomains: ['localhost', 'luckypick.com'],

  /**
   * Reserved subdomains that should not be routed
   * These will be treated as the root domain
   */
  reservedSubdomains: ['www', 'api', 'admin', 'asgard']
} as const

export type SubdomainKey = keyof typeof SUBDOMAIN_CONFIG.subdomains

const normalizeDomain = (domain: string) => domain.trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '')

export function getAllowedRootDomain(hostname: string): string | null {
  const normalizedHostname = normalizeDomain(hostname)

  return (
    SUBDOMAIN_CONFIG.allowedDomains.find(
      (allowed) => normalizedHostname === allowed || normalizedHostname.endsWith(`.${allowed}`)
    ) ?? null
  )
}

export function getSubdomainRoute(subdomain: string): string | null {
  const key = subdomain.toLowerCase() as SubdomainKey
  return SUBDOMAIN_CONFIG.subdomains[key] ?? null
}

export function isReservedSubdomain(subdomain: string): boolean {
  return SUBDOMAIN_CONFIG.reservedSubdomains.includes(
    subdomain.toLowerCase() as (typeof SUBDOMAIN_CONFIG.reservedSubdomains)[number]
  )
}

export function isAllowedDomain(domain: string): boolean {
  return getAllowedRootDomain(domain) !== null
}
