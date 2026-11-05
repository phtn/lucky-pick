import { ACCOUNT_STATUS_LABEL } from './account-status'
import type { AccountStatus } from './accounts'

export interface MyHouseRow {
  accountId: string
  slug: string
  name: string
  status: AccountStatus
  confirmedAt: number | null
}

export interface MyHouseItem {
  id: string
  name: string
  status: AccountStatus
  /** The muted second line. */
  detail: string
  canConfirm: boolean
}

/** Houses awaiting confirmation first, then by name; slug breaks name ties so order never depends on read order. */
export function compareMyHouseRows(a: MyHouseRow, b: MyHouseRow): number {
  const awaiting = Number(b.status === 'pending') - Number(a.status === 'pending')
  if (awaiting !== 0) return awaiting
  return a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug)
}

export function toMyHouseItems(rows: MyHouseRow[]): MyHouseItem[] {
  return [...rows].sort(compareMyHouseRows).map((row) => ({
    id: row.accountId,
    name: row.name,
    status: row.status,
    detail: row.status === 'pending' ? 'Waiting for you to confirm' : ACCOUNT_STATUS_LABEL[row.status],
    canConfirm: row.status === 'pending'
  }))
}
