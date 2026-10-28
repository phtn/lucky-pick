export type { SubdomainKey } from './config'
export {
  getAllowedRootDomain,
  getSubdomainRoute,
  isAllowedDomain,
  isReservedSubdomain,
  SUBDOMAIN_CONFIG
} from './config'
export type { SubdomainInfo } from './utils'
export { buildSubdomainUrl, extractSubdomain, getSubdomainFromHeaders } from './utils'

// Server-only exports are in ./server.ts - import directly:
// import { getSubdomain } from '@/lib/subdomains/server'
