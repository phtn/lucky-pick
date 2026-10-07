import { useRouterState } from '@octanejs/tanstack-router'
import { analyticsRouter } from './analytics-router'

export const usePathname = () => useRouterState({
  select: state => state.location.pathname.replace(/\/$/, '') || '/',
})

export function navigate(path: string) {
  void analyticsRouter.navigate({ to: path, hash: true })
}

export function followRoute(event: MouseEvent, path: string) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  navigate(path)
}
