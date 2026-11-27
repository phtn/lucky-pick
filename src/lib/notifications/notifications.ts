import { formatAccountCredits } from '../accounts/accounts'
import { GAMES, type GameId } from '../games'

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
  | 'ticket-won'
  | 'draw-result'

interface Draw {
  game: string
  /** Manila calendar date, `YYYY-MM-DD`. */
  drawDate: string
}

export type NotificationDraw = Draw & ({ tickets: number } | { numbers: number[] })

export interface NotificationRow {
  notificationId: string
  kind: NotificationKind
  accountId: string | null
  accountName: string
  amount: number | null
  /** Older rows and the house kinds carry none. */
  draw?: NotificationDraw | null
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

const drawDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

/** `Nov 17` — the draw's own calendar day, read as a date rather than an instant. */
const formatDrawDay = (date: string) => {
  const day = new Date(`${date}T00:00:00Z`)
  return Number.isNaN(day.getTime()) ? date : drawDay.format(day)
}

/** `Your Lotto 6/42 ticket won in the Nov 17 draw.` / `2 Lotto 6/42 tickets won …` */
function winDetail(draw: NotificationDraw | null | undefined): string | null {
  if (!draw || !('tickets' in draw)) return null
  const game = GAMES[draw.game as GameId]?.name ?? draw.game
  const which = draw.tickets === 1 ? `Your ${game} ticket` : `${draw.tickets.toLocaleString()} ${game} tickets`
  return `${which} won in the ${formatDrawDay(draw.drawDate)} draw.`
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
        // Approval adds nothing by itself: the contact claims it on /me, which is where this leads.
        // A null amount is omitted rather than shown as "0 CR", which would contradict "approved".
        detail: row.amount === null ? null : `${formatAccountCredits(row.amount)} CR is ready to claim.`,
        href: '/me'
      }
    case 'topup-rejected':
      return { title: `Top-up rejected for ${name}`, detail: 'No credits were added.', href: null }
    case 'transaction-reversed':
      return {
        title: `A transaction on ${name} was reversed`,
        detail: 'Check the ledger for the correction.',
        href: null
      }
    case 'ticket-won':
      return {
        // A win always has an amount; a missing one says "won" rather than "won 0 CR".
        title: row.amount === null ? `You won at ${name}` : `You won ${formatAccountCredits(row.amount)} CR at ${name}`,
        detail: winDetail(row.draw),
        href: '/tickets'
      }
    case 'draw-result': {
      const draw = row.draw
      if (!draw || !('numbers' in draw)) return { title: 'Draw results are in', detail: null, href: '/tickets' }
      const game = GAMES[draw.game as GameId]?.name ?? draw.game
      return {
        title: `${game} results · ${formatDrawDay(draw.drawDate)}`,
        detail: draw.numbers.map((number) => String(number).padStart(2, '0')).join(' · '),
        href: '/tickets'
      }
    }
    default: {
      // Compile time: adding a kind to the union without a case above fails here.
      const unhandled: never = row.kind
      void unhandled
      // Run time: an older bundle can receive a kind newer than itself over the live subscription.
      return { title: 'Something happened', detail: null, href: null }
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
