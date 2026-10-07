import { subSlot, useCallback } from 'octane'

/**
 * A utility to compose multiple event handlers into a single event handler.
 * Run originalEventHandler first, then ourEventHandler unless prevented.
 */
function composeEventHandlers<E>(
  originalEventHandler?: (event: E) => void,
  ourEventHandler?: (event: E) => void,
  { checkForDefaultPrevented = true } = {}
) {
  return function handleEvent(event: E) {
    originalEventHandler?.(event)

    if (checkForDefaultPrevented === false || !(event as unknown as Event).defaultPrevented) {
      return ourEventHandler?.(event)
    }
  }
}

/**
 * Adapted from the common compose-refs pattern used by primitive UI libraries.
 */

type RefCallback<T> = {
  bivarianceHack(value: T | null): undefined | (() => void)
}['bivarianceHack']
type Ref<T> = RefCallback<T> | { current: T | null } | null
type PossibleRef<T> = Ref<T> | undefined

const COMPOSED_REFS_SLOT = Symbol.for('table:useComposedRefs')

/**
 * Set a given ref to a given value.
 * This utility takes care of different types of refs: callback refs and RefObject(s).
 */
function setRef<T>(ref: PossibleRef<T>, value: T | null): undefined | (() => void) {
  if (typeof ref === 'function') {
    return ref(value)
  }

  if (ref !== null && ref !== undefined) {
    ref.current = value
  }
}

/**
 * A utility to compose multiple refs together.
 * Accepts callback refs and RefObject(s).
 */
function composeRefs<T>(...refs: Array<PossibleRef<T>>): RefCallback<T> {
  return (node) => {
    let hasCleanup = false
    const cleanups = refs.map((ref) => {
      const cleanup = setRef(ref, node)
      if (!hasCleanup && typeof cleanup === 'function') {
        hasCleanup = true
      }
      return cleanup
    })

    // Octane supports cleanup-returning callback refs. If a callback owns
    // cleanup, run it; otherwise detach that ref with null.

    if (hasCleanup) {
      return () => {
        for (let i = 0; i < cleanups.length; i++) {
          const cleanup = cleanups[i]
          if (typeof cleanup === 'function') {
            cleanup()
          } else {
            setRef(refs[i], null)
          }
        }
      }
    }
  }
}

/**
 * A custom hook that composes multiple refs.
 * Accepts callback refs and RefObject(s).
 */
function useComposedRefs<T>(...args: unknown[]): RefCallback<T> {
  const tail = args[args.length - 1]
  const injectedSlot = typeof tail === 'symbol' ? tail : undefined
  const refs = (injectedSlot ? args.slice(0, -1) : args) as Array<PossibleRef<T>>
  const slot = injectedSlot ?? COMPOSED_REFS_SLOT

  return useCallback(composeRefs(...refs), refs, subSlot(slot, 'callback'))
}

export type { Ref, RefCallback }
export { composeEventHandlers, composeRefs, useComposedRefs }
