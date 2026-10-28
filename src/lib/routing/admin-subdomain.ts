import { getAllowedRootDomain } from '@/lib/subdomains/config'

export const adminRoutePrefix = '/admin'
export const adminSubdomainLabel = 'admin'
export const adminSubdomainHandoffPath = '/admin-handoff'

export type AdminSubdomainMode = 'auto' | 'force' | 'off'

/**
 * Controls admin subdomain behavior.
 *
 * - 'auto' (default): Use subdomain when the hostname supports it (custom domains with proper DNS).
 *   Falls back to same-origin /admin-handoff on Vercel previews and IPs.
 * - 'force': Always attempt admin subdomain handoff (use when you have wildcard DNS even on custom vercel domains).
 * - 'off': Never use subdomain. Everything stays on the main origin using /admin-handoff + /admin paths.
 *
 * Can be set via ADMIN_SUBDOMAIN_MODE or NEXT_PUBLIC_ADMIN_SUBDOMAIN_MODE.
 */
function resolveAdminSubdomainMode(): AdminSubdomainMode {
  const raw =
    (typeof process !== 'undefined' && process.env
      ? (process.env.ADMIN_SUBDOMAIN_MODE ?? process.env.NEXT_PUBLIC_ADMIN_SUBDOMAIN_MODE)
      : undefined) ?? 'auto'

  if (raw === 'force') return 'force'
  if (raw === 'off') return 'off'
  return 'auto'
}

export const adminSubdomainMode: AdminSubdomainMode = resolveAdminSubdomainMode()

function normalizeHostname(hostname: string) {
  return hostname.trim().toLowerCase().replace(/\.$/, '')
}

export function getHostnameFromHostHeader(hostHeader: string | null | undefined) {
  if (!hostHeader) {
    return null
  }

  const firstHost = hostHeader.split(',')[0]?.trim()

  if (!firstHost) {
    return null
  }

  try {
    return normalizeHostname(new URL(`http://${firstHost}`).hostname)
  } catch {
    return normalizeHostname(firstHost.replace(/:\d+$/, ''))
  }
}

function isIpv4Address(hostname: string) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)
}

function isIpv6Address(hostname: string) {
  return hostname.includes(':')
}

export function isIpHostname(hostname: string) {
  const normalizedHostname = normalizeHostname(hostname)
  return isIpv4Address(normalizedHostname) || isIpv6Address(normalizedHostname)
}

export function isAdminSubdomainHostname(hostname: string) {
  return normalizeHostname(hostname).startsWith(`${adminSubdomainLabel}.`)
}

export function stripAdminSubdomain(hostname: string) {
  const normalizedHostname = normalizeHostname(hostname)

  if (!isAdminSubdomainHostname(normalizedHostname)) {
    return normalizedHostname
  }

  return normalizedHostname.slice(adminSubdomainLabel.length + 1)
}

export function getAppRootHostname(hostname: string) {
  const appHostname = stripAdminSubdomain(hostname)
  return getAllowedRootDomain(appHostname) ?? appHostname
}

function isVercelHostname(hostname: string) {
  const normalized = normalizeHostname(hostname)
  return normalized.endsWith('.vercel.app') || normalized.endsWith('.vercel.dev')
}

export function supportsAdminSubdomain(hostname: string) {
  const normalizedHostname = normalizeHostname(hostname)

  if (normalizedHostname.length === 0) {
    return false
  }

  if (isIpHostname(normalizedHostname)) {
    return false
  }

  if (adminSubdomainMode === 'off') {
    return false
  }

  if (adminSubdomainMode === 'force') {
    // When forced, we still block IPs but allow everything else (including vercel domains
    // if the user has configured the domain + DNS properly).
    return true
  }

  // 'auto' mode: Vercel preview/production vercel.app domains cannot reliably support
  // the admin.* subdomain without explicit wildcard DNS + domain configuration.
  // On these hosts we fall back to same-origin admin handoff at /admin-handoff.
  if (isVercelHostname(normalizedHostname)) {
    return false
  }

  return true
}

export function toAdminSubdomainHostname(hostname: string) {
  const normalizedHostname = normalizeHostname(hostname)

  if (isAdminSubdomainHostname(normalizedHostname)) {
    return normalizedHostname
  }

  const appHostname = getAppRootHostname(normalizedHostname)

  if (!supportsAdminSubdomain(appHostname)) {
    return appHostname
  }

  return `${adminSubdomainLabel}.${appHostname}`
}

export function toAdminExternalPath(pathname: string) {
  if (pathname === adminRoutePrefix) {
    return '/'
  }

  if (pathname.startsWith(`${adminRoutePrefix}/`)) {
    return pathname.slice(adminRoutePrefix.length)
  }

  return pathname
}

export function toAdminInternalPath(pathname: string) {
  if (pathname === '/' || pathname.length === 0) {
    return adminRoutePrefix
  }

  if (pathname === adminRoutePrefix || pathname.startsWith(`${adminRoutePrefix}/`)) {
    return pathname
  }

  return `${adminRoutePrefix}${pathname}`
}

export function isAdminRoutePath(pathname: string) {
  return pathname === adminRoutePrefix || pathname.startsWith(`${adminRoutePrefix}/`)
}

export function isAdminSubdomainPassthroughPath(pathname: string) {
  return pathname === adminSubdomainHandoffPath || pathname.startsWith(`${adminSubdomainHandoffPath}/`)
}

export function resolveAdminNavigationPath(destination: string, currentPathname: string) {
  const externalPath = toAdminExternalPath(destination)
  return isAdminRoutePath(currentPathname) ? toAdminInternalPath(externalPath) : externalPath
}

export function buildAdminHandoffUrl(currentUrl: URL, idToken: string) {
  const appHostname = getAppRootHostname(currentUrl.hostname)
  const useAdminSubdomain = supportsAdminSubdomain(appHostname)
  const handoffUrl = new URL(currentUrl)

  handoffUrl.hostname = useAdminSubdomain ? toAdminSubdomainHostname(appHostname) : appHostname
  handoffUrl.pathname = adminSubdomainHandoffPath
  handoffUrl.search = ''
  handoffUrl.hash = new URLSearchParams({
    idToken,
    redirectTo: '/admin-overview'
  }).toString()

  return handoffUrl
}

export function getSharedCookieDomain(hostname: string) {
  const appHostname = getAppRootHostname(hostname)

  if (appHostname === 'localhost') {
    return undefined
  }

  if (!supportsAdminSubdomain(appHostname)) {
    return undefined
  }

  return appHostname
}
