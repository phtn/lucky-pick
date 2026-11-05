// Deliberately the module, not the `../icons` barrel: that barrel re-exports
// `./icon.btsx`, and this file is reachable from `convex/accounts/q.ts`, whose
// typecheck cannot resolve a `.btsx` module. Importing the barrel here breaks
// `convex dev`.
import type { IconName } from '../icons/icons'
import { canUseAccount, formatAccountCredits, type AccountStatus } from './accounts'

export interface BankerRow {
  accountId: string
  slug: string
  name: string
  status: AccountStatus
  balance: number
}

export interface BankerItem {
  id: string
  label: string
  icon: IconName
  description?: string
  meta?: string
  disabled?: boolean
}

/** Usable houses first, then by name; slug breaks name ties so order never depends on read order. */
export function compareBankerRows(a: BankerRow, b: BankerRow): number {
  const usable = Number(canUseAccount(b.status)) - Number(canUseAccount(a.status))
  if (usable !== 0) return usable
  return a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug)
}

// `closed` never reaches the roster, but the record stays exhaustive over AccountStatus.
const BANKER_STATUS_LABEL: Record<AccountStatus, string | null> = {
  pending: 'Not yet open',
  confirmed: null,
  active: null,
  suspended: 'Temporarily off',
  closed: 'Closed'
}

export function describeBankerStatus(status: AccountStatus): string | null {
  return BANKER_STATUS_LABEL[status]
}

export function toBankerItems(rows: BankerRow[]): BankerItem[] {
  return [...rows].sort(compareBankerRows).map((row) => ({
    id: row.accountId,
    label: row.name,
    icon: 'cash',
    description: describeBankerStatus(row.status) ?? undefined,
    // A balance only means something at a house the player can play at.
    meta: canUseAccount(row.status) ? formatAccountCredits(row.balance) : undefined,
    disabled: !canUseAccount(row.status)
  }))
}

export function resolveSelectedBanker(rows: BankerRow[], selectedAccountId: string | null | undefined): BankerRow | null {
  if (!selectedAccountId) return null
  return rows.find((row) => row.accountId === selectedAccountId) ?? null
}
