import { createRootRoute, createRoute, createRouter } from '@octanejs/tanstack-router'
import AnalyticsRoot from '../pages/AnalyticsRoot.btsx'
import AnalyticsRoute from '../pages/AnalyticsRoute.btsx'

const rootRoute = createRootRoute({ component: AnalyticsRoot })

const playRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
})

const analyticsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/analytics',
  component: AnalyticsRoute,
})

const routeTree = rootRoute.addChildren([playRoute, analyticsRoute])

export const analyticsRouter = createRouter({ routeTree, scrollRestoration: true })

declare module '@tanstack/router-core' {
  interface Register {
    router: typeof analyticsRouter
  }
}
