import { getFirebaseSessionCookieDomain } from '@/lib/firebase-admin/session'
import { getHostnameFromHostHeader } from '@/lib/routing/admin-subdomain'

export function resolveFirebaseSessionCookieDomain(request: Request) {
  const requestHostname =
    getHostnameFromHostHeader(request.headers.get('x-forwarded-host') ?? request.headers.get('host')) ??
    new URL(request.url).hostname

  return getFirebaseSessionCookieDomain(requestHostname)
}
