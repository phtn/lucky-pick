import Sidebar, { ToggleSidebar, type AdminNavItem, type AdminSidebarProps } from './sidebar.btsx'

// The theme control is identical on both consoles — it only reads and writes
// the theme the app itself stores — so admin borrows Asgard's rather than
// carrying a copy that could drift out of step. It is imported from the file
// rather than through Asgard's barrel, which would drag that console's sidebar
// and stylesheet into this bundle.
import ThemeToggle from '@/components/asgard/theme-toggle.btsx'

export { Sidebar, ThemeToggle, ToggleSidebar }
export type { AdminNavItem, AdminSidebarProps }
