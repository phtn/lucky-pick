import { getAppRootHostname } from './admin-subdomain'
import { getAsgardAppRootHostname, isAsgardSubdomainHostname } from './asgard-subdomain'

/**
 * Builds an absolute URL to a page on the main app, from anywhere in the admin
 * or Asgard console. Each console can live on its own subdomain, so the host
 * drops back to the app root; when a console shares the main origin only the
 * pathname changes.
 */
export function buildAppUrl(currentUrl: URL, pathname: string) {
  const appUrl = new URL(currentUrl)

  appUrl.hostname = isAsgardSubdomainHostname(currentUrl.hostname)
    ? getAsgardAppRootHostname(currentUrl.hostname)
    : getAppRootHostname(currentUrl.hostname)
  appUrl.pathname = pathname
  appUrl.search = ''
  appUrl.hash = ''

  return appUrl
}
