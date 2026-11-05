import { formatAccountCredits } from '../accounts/accounts'

/**
 * Mirrors `notificationKindSchema` in `convex/notifications/d.ts`. Re-declared rather than imported:
 * the dependency runs from `convex/` into `src/lib`, never back. The copy test names every kind.
 */
export type NotificationKind =
  | 'house-awaiting-confirmation'
  | 'house-suspended'
  | 'house-closed'
  | 'house-activated'
  | 'topup-approved'
  | 'topup-rejected'
  | 'transaction-reversed'

export interface NotificationRow {
  notificationId: string
  kind: NotificationKind
  accountId: string | null
  accountName: string
  amount: number | null
  readAt: number | null
  createdAt: number
}

export interface NotificationItem {
  id: string
  title: string
  detail: string | null
  href: string | null
  isUnread: boolean
}

interface Copy {
  title: string
  detail: string | null
  href: string | null
}

function copyFor(row: NotificationRow): Copy {
  const name = row.accountName
  switch (row.kind) {
    case 'house-awaiting-confirmation':
      return {
        title: `${name} is waiting for you to confirm`,
        detail: 'You were named as its contact.',
        href: '/me'
      }
    case 'house-suspended':
      return {
        title: `${name} was suspended`,
        detail: 'You cannot play against it until it is active again.',
        href: '/me'
      }
    case 'house-closed':
      return { title: `${name} was closed`, detail: null, href: '/me' }
    case 'house-activated':
      return { title: `${name} is active`, detail: 'Players can choose it again.', href: '/me' }
    case 'topup-approved':
      return {
        title: `Top-up approved for ${name}`,
        detail: `${formatAccountCredits(row.amount ?? 0)} CR was added.`,
        href: null
      }
    case 'topup-rejected':
      return { title: `Top-up rejected for ${name}`, detail: 'No credits were added.', href: null }
    case 'transaction-reversed':
      return {
        title: `A transaction on ${name} was reversed`,
        detail: 'Check the ledger for the correction.',
        href: null
      }
  }
}

/** Keeps the query's order (newest first); it is the single source of ordering. */
export function toNotificationItems(rows: NotificationRow[]): NotificationItem[] {
  return rows.map((row) => ({
    id: row.notificationId,
    ...copyFor(row),
    isUnread: row.readAt === null
  }))
}

export function countUnread(rows: NotificationRow[]): number {
  return rows.filter((row) => row.readAt === null).length
}
