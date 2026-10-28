import { getAllowedRootDomain, isReservedSubdomain } from './config'

export interface SubdomainInfo {
  subdomain: string | null
  domain: string
  isSubdomain: boolean
}

/**
 * Extracts subdomain information from a hostname
 */
export function extractSubdomain(hostname: string): SubdomainInfo {
  const firstHost = hostname.split(',')[0]?.trim() ?? ''
  let normalizedHostname = firstHost.toLowerCase().replace(/\.$/, '')

  try {
    normalizedHostname = new URL(`http://${normalizedHostname}`).hostname.toLowerCase().replace(/\.$/, '')
  } catch {
    normalizedHostname = normalizedHostname.replace(/:\d+$/, '')
  }

  const matchingDomain = getAllowedRootDomain(normalizedHostname)

  if (!matchingDomain) {
    return { subdomain: null, domain: normalizedHostname, isSubdomain: false }
  }

  // If it's exactly the root domain, no subdomain
  if (normalizedHostname === matchingDomain) {
    return { subdomain: null, domain: matchingDomain, isSubdomain: false }
  }

  // Extract subdomain
  const subdomain = normalizedHostname.slice(0, -(matchingDomain.length + 1))

  // Check if it's a reserved subdomain
  if (isReservedSubdomain(subdomain)) {
    return { subdomain: null, domain: matchingDomain, isSubdomain: false }
  }

  return { subdomain, domain: matchingDomain, isSubdomain: true }
}

/**
 * Gets the current subdomain from headers (for use in server components)
 */
export function getSubdomainFromHeaders(headersList: Headers): SubdomainInfo {
  const host = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost'
  return extractSubdomain(host)
}

/**
 * Builds a URL with a subdomain
 */
export function buildSubdomainUrl(subdomain: string, domain: string, path = '/', protocol = 'https'): string {
  const port = domain === 'localhost' ? ':3000' : ''
  const proto = domain === 'localhost' ? 'http' : protocol
  return `${proto}://${subdomain}.${domain}${port}${path}`
}
