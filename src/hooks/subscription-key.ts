// Serializes with sorted keys (at every depth) so equal arguments built in a
// different key order produce the same key and never trigger a re-subscribe.
export const toSubscriptionKey = (args: Record<string, unknown>): string =>
  JSON.stringify(args, (_key, value: unknown) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return value
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
  })
