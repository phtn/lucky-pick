/**
 * Pages that take over the main view from the lottery game grid.
 *
 * Kept as data so the grid-visibility check in App.btsx does not need a
 * hardcoded path each time a new page is added.
 */
export const APP_PAGE_PATHS: readonly string[] = ['/me', '/analytics', '/trx', '/tickets']

/**
 * Matches the normalization in `usePathname` (src/lib/navigation.ts), so a
 * trailing slash such as `/me/` resolves to the same page as `/me`.
 */
export function isAppPagePath(pathname: string) {
  const normalizedPathname = pathname.replace(/\/$/, '') || '/'
  return APP_PAGE_PATHS.includes(normalizedPathname)
}

/**
 * The simulator's own surface.
 *
 * Not a member of `APP_PAGE_PATHS`: those render inside the landing shell's
 * `Outlet`, whereas the game brings its own shell, frame and header, so it is
 * chosen in `AppRoot.btsx` the same way the consoles are.
 */
export const gameRoutePath = '/play'

export function isGameRoutePath(pathname: string) {
  const normalizedPathname = pathname.replace(/\/$/, '') || '/'
  return normalizedPathname === gameRoutePath
}
