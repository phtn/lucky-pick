import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import { useEffect, useState, useSyncExternalStore } from 'octane'
import { convexClient, getConvexAuthState, subscribeToConvexAuthState } from '@/lib/convex-client'
import { toSubscriptionKey } from './subscription-key'

// A delivered value, tagged with the subscription that produced it.
interface Delivery<Query extends FunctionReference<'query'>> {
  reference: Query
  argsKey: string
  value: FunctionReturnType<Query>
}

/**
 * Live read of a Convex query. `convex/react` is unavailable here, so this
 * subscribes through `convexClient.onUpdate`.
 *
 * Returns `undefined` while there is no answer: loading, no client, a signed-out
 * viewer, `options.enabled === false`, or a query that errored (logged, not
 * thrown, so one failing panel leaves the rest of the page intact). The value is
 * cleared whenever the subscription ends, so one session's data never outlives it.
 */
export function useConvexQuery<Query extends FunctionReference<'query'>>(
  reference: Query,
  args: FunctionArgs<Query>,
  options?: { enabled?: boolean }
): FunctionReturnType<Query> | undefined {
  const [delivery, setDelivery] = useState<Delivery<Query> | undefined>(undefined)
  const { isAuthenticated } = useSyncExternalStore(subscribeToConvexAuthState, getConvexAuthState, getConvexAuthState)
  const enabled = options?.enabled !== false
  const argsKey = toSubscriptionKey(args)

  useEffect(() => {
    if (!convexClient || !isAuthenticated || !enabled) return undefined

    const unsubscribe = convexClient.onUpdate(
      reference,
      args,
      (value) => setDelivery({ reference, argsKey, value }),
      (error) => {
        // Non-fatal: leave the panel on its empty state instead of throwing.
        console.error('Convex query failed', error)
        setDelivery(undefined)
      }
    )
    return () => {
      unsubscribe()
      // Release the previous answer once its subscription ends (sign-out, disabled
      // query, changed args) rather than keeping another session's data in memory.
      setDelivery(undefined)
    }
    // `args` is intentionally keyed by `argsKey` so equal args do not re-subscribe.
  }, [reference, argsKey, isAuthenticated, enabled])

  // Effects and their cleanups run after the render that saw new inputs, so the
  // stored delivery is checked against the current subscription here. Without
  // this, query A's answer would be returned for one render while already
  // subscribed to query B. It is not redundant with the cleanup reset above.
  const isCurrent = delivery !== undefined && delivery.reference === reference && delivery.argsKey === argsKey
  return isAuthenticated && enabled && isCurrent ? delivery.value : undefined
}
