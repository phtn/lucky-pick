import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import { useEffect, useState, useSyncExternalStore } from 'octane'
import { convexClient, getConvexAuthState, subscribeToConvexAuthState } from '@/lib/convex-client'
import { toSubscriptionKey } from './subscription-key'

/**
 * Live read of a Convex query. `convex/react` is unavailable here, so this
 * subscribes through `convexClient.onUpdate`.
 *
 * Returns `undefined` while there is no answer: loading, no client, a signed-out
 * viewer, or `options.enabled === false`. The value is cleared whenever the
 * subscription ends, so one session's data never outlives it.
 */
export function useConvexQuery<Query extends FunctionReference<'query'>>(
  reference: Query,
  args: FunctionArgs<Query>,
  options?: { enabled?: boolean }
): FunctionReturnType<Query> | undefined {
  const [value, setValue] = useState<FunctionReturnType<Query> | undefined>(undefined)
  const { isAuthenticated } = useSyncExternalStore(subscribeToConvexAuthState, getConvexAuthState, getConvexAuthState)
  const enabled = options?.enabled !== false
  const argsKey = toSubscriptionKey(args)

  useEffect(() => {
    if (!convexClient || !isAuthenticated || !enabled) return undefined

    const unsubscribe = convexClient.onUpdate(reference, args, setValue)
    return () => {
      unsubscribe()
      // Drop the value with the subscription: on sign-out, a disabled query or
      // changed args, the previous answer must not be shown as the current one.
      setValue(undefined)
    }
    // `args` is intentionally keyed by `argsKey` so equal args do not re-subscribe.
  }, [reference, argsKey, isAuthenticated, enabled])

  return isAuthenticated && enabled ? value : undefined
}
