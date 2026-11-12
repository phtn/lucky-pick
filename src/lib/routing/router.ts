import { createRootRoute, createRoute, createRouter, lazyRouteComponent, type RouteComponent } from '@octanejs/tanstack-router'
import AnalyticsRoute from '@/pages/AnalyticsRoute.btsx'
import AppRoot from '@/pages/AppRoot.btsx'
import { adminRoutePrefix, isAdminSubdomainHostname } from './admin-subdomain'
import { gameRoutePath } from './app-pages'
import { asgardHandoffPath, isAsgardSubdomainHostname } from './asgard-subdomain'

// Asgard is a surface of its own, not a page of the app: on its subdomain the
// console *is* the site, so the host picks the tree once, at load. Nothing
// downstream has to ask which host it is on, and the main bundle never carries
// the console.
const isAsgardHost = typeof window !== 'undefined' && isAsgardSubdomainHostname(window.location.hostname)

// The admin console is the same arrangement on `admin.`: its own tree, chosen
// once by the host. Asgard is checked first, since a host can only be one of
// them and the two labels never overlap.
const isAdminHost = typeof window !== 'undefined' && isAdminSubdomainHostname(window.location.hostname)

// The router library types `lazyRouteComponent`'s `preload` as possibly
// returning `undefined`, but a route's `component` wants one that always
// returns a promise. The two are the library's own halves of one feature, so
// the mismatch is bridged once here rather than at every route.
const lazyPage = (importer: () => Promise<unknown>) => lazyRouteComponent(importer) as unknown as RouteComponent

const asgardShell = lazyPage(() => import('@/pages/asgard-page.btsx'))
const asgardOverview = lazyPage(() => import('@/pages/asgard-overview-page.btsx'))
const asgardAccounts = lazyPage(() => import('@/pages/asgard-accounts-page.btsx'))
const asgardAccount = lazyPage(() => import('@/pages/asgard-account-page.btsx'))
const asgardGames = lazyPage(() => import('@/pages/asgard-games-page.btsx'))

const profilePage = lazyPage(() => import('@/pages/profile-page.btsx'))
const trxPage = lazyPage(() => import('@/pages/trx-page.btsx'))

// The simulator is a surface of its own, not a page inside the landing shell:
// it brings its own `app-shell`, frame and header, so it hangs off the root
// rather than the landing page's `Outlet`. Lazy, so arriving at the landing
// page does not pay for the whole game up front.
const gamePage = lazyPage(() => import('../../Tickets.btsx'))
const ticketsPage = lazyPage(() => import('@/pages/tickets-page.btsx'))

const adminShell = lazyPage(() => import('@/pages/admin-page.btsx'))
const adminOverview = lazyPage(() => import('@/pages/admin-overview-page.btsx'))
const adminPlayers = lazyPage(() => import('@/pages/admin-players-page.btsx'))

function createAdminRouteTree() {
  const rootRoute = createRootRoute({ component: adminShell })

  const overviewRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: adminOverview
  })

  const playersRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/players',
    component: adminPlayers
  })

  return rootRoute.addChildren([overviewRoute, playersRoute])
}

function createAsgardRouteTree() {
  const rootRoute = createRootRoute({ component: asgardShell })

  const overviewRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: asgardOverview
  })

  const accountsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/accounts',
    component: asgardAccounts
  })

  // One account's own page. Keyed by slug rather than id: it is already unique
  // and reserved-checked, and it makes the address one an operator can read.
  const accountRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/accounts/$slug',
    component: asgardAccount
  })

  const gamesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/games',
    component: asgardGames
  })

  return rootRoute.addChildren([overviewRoute, accountsRoute, accountRoute, gamesRoute])
}

function createAppRouteTree() {
  const rootRoute = createRootRoute({ component: AppRoot })

  const landingRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/'
  })

  const playRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: gameRoutePath,
    component: gamePage
  })

  const analyticsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/analytics',
    component: AnalyticsRoute
  })

  // A page of the app rather than a console: it renders inside the game shell's
  // `Outlet`, which is why it is lazy like the asgard pages and not a tree.
  const profileRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/me',
    component: profilePage
  })

  // The TRX account, on its own path rather than a panel on `/me`: the profile
  // page is the account's record, and this is the one page that reads a chain.
  const trxRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/trx',
    component: trxPage
  })
  const ticketsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/tickets',
    component: ticketsPage
  })

  // The handoff mints an ID token on the origin the client SDK is signed in on
  // and sends the god to Asgard's root with it. It renders the console's own
  // shell rather than a page inside the app, since the app is not where it ends.
  const asgardRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: asgardHandoffPath,
    component: asgardShell
  })

  // Where the host cannot carry an `asgard.` subdomain — a workers.dev origin,
  // an IP — this path is the console rather than a doorway to it, so the shell
  // needs the overview beneath it. On a host that can, the shell redirects
  // before this ever renders.
  const asgardIndexRoute = createRoute({
    getParentRoute: () => asgardRoute,
    path: '/',
    component: asgardOverview
  })

  const asgardAccountsRoute = createRoute({
    getParentRoute: () => asgardRoute,
    path: 'accounts',
    component: asgardAccounts
  })

  const asgardAccountRoute = createRoute({
    getParentRoute: () => asgardRoute,
    path: 'accounts/$slug',
    component: asgardAccount
  })

  const asgardGamesRoute = createRoute({
    getParentRoute: () => asgardRoute,
    path: 'games',
    component: asgardGames
  })

  // Where no `admin.` subdomain is in front of the app — the dev server, a
  // workers.dev origin — `/admin` is the console rather than a doorway to it,
  // so the whole surface hangs off this path. On a host that carries the
  // subdomain the admin tree is chosen instead and this never renders.
  const adminRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: adminRoutePrefix,
    component: adminShell
  })

  const adminIndexRoute = createRoute({
    getParentRoute: () => adminRoute,
    path: '/',
    component: adminOverview
  })

  const adminPlayersRoute = createRoute({
    getParentRoute: () => adminRoute,
    path: 'players',
    component: adminPlayers
  })

  return rootRoute.addChildren([
    landingRoute,
    ticketsRoute,
    playRoute,
    analyticsRoute,
    profileRoute,
    trxRoute,
    asgardRoute.addChildren([asgardIndexRoute, asgardAccountsRoute, asgardAccountRoute, asgardGamesRoute]),
    adminRoute.addChildren([adminIndexRoute, adminPlayersRoute])
  ])
}

const routeTree = isAsgardHost ? createAsgardRouteTree() : isAdminHost ? createAdminRouteTree() : createAppRouteTree()

export const router = createRouter({ routeTree, scrollRestoration: true })

declare module '@tanstack/router-core' {
  interface Register {
    router: typeof router
  }
}
