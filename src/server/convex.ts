import { ConvexHttpClient } from 'convex/browser'
import { readEnvSecret, readEnvValue } from '@/lib/env/env-secret'

export class RequestError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
    this.name = 'RequestError'
  }
}

function getConvexUrl(configuredUrl?: string) {
  // Same quote stripping as every other secret the Worker reads: a deployment
  // URL stored with the quotes from an env line is not a URL.
  const url = readEnvValue(configuredUrl) ?? readEnvSecret('CONVEX_URL') ?? readEnvSecret('PUBLIC_CONVEX_URL')
  if (!url) throw new RequestError(503, 'The Convex deployment is not configured.')
  return url
}

export function createConvexClient(token?: string, convexUrl?: string) {
  return new ConvexHttpClient(getConvexUrl(convexUrl), {
    ...(token ? { auth: token } : {}),
    logger: false
  })
}
