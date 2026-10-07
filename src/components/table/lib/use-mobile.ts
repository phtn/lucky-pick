import { useSyncExternalStore } from 'octane'

const MOBILE_BREAKPOINT = 575
const MOBILE_LANDSCAPE_MAX_HEIGHT = 500

export const MOBILE_MEDIA_QUERY = [
  `(max-width: ${MOBILE_BREAKPOINT - 1}px)`,
  `(orientation: landscape) and (max-height: ${MOBILE_LANDSCAPE_MAX_HEIGHT}px)`
].join(', ')

const subscribeToMobileViewport = (onStoreChange: VoidFunction) => {
  const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY)
  mediaQuery.addEventListener('change', onStoreChange)

  return () => mediaQuery.removeEventListener('change', onStoreChange)
}

const getMobileViewportSnapshot = () => window.matchMedia(MOBILE_MEDIA_QUERY).matches
const getServerMobileViewportSnapshot = () => true

export function useMobile() {
  return useSyncExternalStore(subscribeToMobileViewport, getMobileViewportSnapshot, getServerMobileViewportSnapshot)
}
