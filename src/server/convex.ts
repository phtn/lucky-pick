import { ConvexHttpClient } from 'convex/browser'

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
  const url = configuredUrl?.trim() || process.env.CONVEX_URL?.trim() || process.env.PUBLIC_CONVEX_URL?.trim()
  if (!url) throw new RequestError(503, 'The Convex deployment is not configured.')
  return url
}

export function createConvexClient(token?: string, convexUrl?: string) {
  return new ConvexHttpClient(getConvexUrl(convexUrl), {
    ...(token ? { auth: token } : {}),
    logger: false
  })
}
