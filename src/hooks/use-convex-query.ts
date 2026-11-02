import { type FunctionArgs, type FunctionReference, type FunctionReturnType, getFunctionName } from 'convex/server'
import { useEffect, useState, useSyncExternalStore } from 'octane'
import { convexClient, getConvexAuthState, subscribeToConvexAuthState } from '@/lib/convex-client'
import { toSubscriptionKey } from './subscription-key'

// A delivered value, tagged with the subscription that produced it. The tag
// uses the function's name, never the reference object: `api.*` hands back a
// fresh Proxy on every property access, so reference identity is never stable
// across renders.
interface Delivery<Query extends FunctionReference<'query'>> {
  functionName: string
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
  const functionName = getFunctionName(reference)
  const argsKey = toSubscriptionKey(args)

  useEffect(() => {
    if (!convexClient || !isAuthenticated || !enabled) return undefined

    const unsubscribe = convexClient.onUpdate(
      reference,
      args,
      (value) => setDelivery({ functionName, argsKey, value }),
      (error) => {
        // Non-fatal: leave the panel on its empty state instead of throwing.
        console.error('Convex query failed', error)
        setDelivery(undefined)
      }
    )
    return () => {
      unsubscribe()
      // Privacy guarantee, do not remove as redundant: after a sign-out, the old
      // user's delivery still matches the same function and args, so when the next
      // user signs in it would render their predecessor's data (e.g. a balance)
      // until the first delivery arrives. Ending the subscription must drop it.
      setDelivery(undefined)
    }
    // `reference` and `args` are intentionally keyed by `functionName` and
    // `argsKey`, so a fresh Proxy or an equal args object does not re-subscribe.
  }, [functionName, argsKey, isAuthenticated, enabled])

  // Effects and their cleanups run after the render that saw new inputs, so the
  // stored delivery is checked against the current subscription here. Without
  // this, query A's answer would be returned for one render while already
  // subscribed to query B. It is not redundant with the cleanup reset above.
  const isCurrent = delivery !== undefined && delivery.functionName === functionName && delivery.argsKey === argsKey
  return isAuthenticated && enabled && isCurrent ? delivery.value : undefined
}
