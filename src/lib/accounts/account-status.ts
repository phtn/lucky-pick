// Kept apart from `accounts.ts` on purpose. Convex modules import `accounts.ts`
// and `convex/tsconfig.json` has no `paths` mapping, while `ACCOUNT_STATUS_ICON`
// needs `IconName`. Merging the two would pull the icons barrel into Convex's
// typecheck graph and bring back the TS2307 that broke this repo (f705041).
import type { AccountStatus } from './accounts'
import type { IconName } from '../icons/icons'

export const ACCOUNT_STATUS_LABEL: Record<AccountStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  active: 'Active',
  suspended: 'Suspended',
  closed: 'Closed'
}

export const ACCOUNT_STATUS_ICON: Record<AccountStatus, IconName> = {
  pending: 'clock',
  confirmed: 'check-circle-fill',
  active: 'check-circle-fill',
  suspended: 'alert-triangle',
  closed: 'close'
}

// Used with `Badge`'s `plain` variant so the whole status palette lives here
// rather than being split between the badge's variants and the call site.
export const ACCOUNT_STATUS_TONE: Record<AccountStatus, string> = {
  pending: 'border-orange-400/25 bg-orange-500/8 text-orange-700 dark:text-orange-300',
  confirmed: 'border-emerald-500/25 bg-emerald-500/8 text-emerald-600 dark:text-emerald-400',
  active: 'border-emerald-500/25 bg-emerald-500/8 text-emerald-600 dark:text-emerald-400',
  suspended: 'border-destructive/25 bg-destructive/8 text-destructive',
  closed: 'border-border/60 bg-foreground/5 text-muted-foreground'
}
