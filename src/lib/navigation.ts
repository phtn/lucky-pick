import { useSyncExternalStore } from 'octane'

const getPath = () => window.location.pathname.replace(/\/$/, '') || '/'
const subscribe = (notify: () => void) => {
  window.addEventListener('popstate', notify)
  return () => window.removeEventListener('popstate', notify)
}

export const usePathname = () => useSyncExternalStore(subscribe, getPath, () => '/')

export function navigate(path: string) {
  if (getPath() === path) return
  window.history.pushState(null, '', path + window.location.hash)
  window.dispatchEvent(new PopStateEvent('popstate'))
  window.scrollTo(0, 0)
}

export function followRoute(event: MouseEvent, path: string) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  navigate(path)
}
