import type { AccountRow, AccountTopup, TopupPolicyChange } from '@/lib/asgard/accounts'

/**
 * What the Activity tab shows: one feed across every account, built from the
 * roster, the top-up requests and the log of approval-rule changes. Only the
 * rule changes are recorded as events; the rest exist only where a document
 * still carries its timestamp.
 */
export type AccountActivityKind =
  | 'account-created'
  | 'account-confirmed'
  | 'account-closed'
  | 'topup-filed'
  | 'topup-approved'
  | 'topup-claimed'
  | 'topup-rejected'
  | 'topup-cancelled'
  | 'rule-on'
  | 'rule-off'

export interface AccountActivityEvent {
  id: string
  kind: AccountActivityKind
  at: number
  accountName: string
  /** Null when the account is not on the roster the feed was built from. */
  accountSlug: string | null
  /** Credits involved, for the kinds that move or would move any. */
  amount: number | null
  /** The reference, reason or note that says more than the kind does. */
  detail: string | null
}

export interface PendingTopup {
  id: string
  at: number
  accountName: string
  accountSlug: string | null
  amount: number
  reference: string | null
}

export const ACCOUNT_ACTIVITY_LABEL: Record<AccountActivityKind, string> = {
  'account-created': 'Account created',
  'account-confirmed': 'Account confirmed',
  'account-closed': 'Account closed',
  'topup-filed': 'Top-up filed',
  'topup-approved': 'Top-up approved',
  'topup-claimed': 'Top-up claimed',
  'topup-rejected': 'Top-up rejected',
  'topup-cancelled': 'Top-up cancelled',
  'rule-on': 'Second god required',
  'rule-off': 'Second god waived'
}

export const ACCOUNT_ACTIVITY_TONE: Record<AccountActivityKind, string> = {
  'account-created': 'bg-foreground/40',
  'account-confirmed': 'bg-emerald-500',
  'account-closed': 'bg-muted-foreground/50',
  'topup-filed': 'bg-orange-400',
  'topup-approved': 'bg-sky-500',
  'topup-claimed': 'bg-emerald-500',
  'topup-rejected': 'bg-destructive',
  'topup-cancelled': 'bg-muted-foreground/50',
  'rule-on': 'bg-emerald-500',
  'rule-off': 'bg-destructive'
}

// A claimed top-up was approved first, so its decision still reads as an approval.
const DECISION_KIND: Record<Exclude<AccountTopup['status'], 'pending'>, AccountActivityKind> = {
  approved: 'topup-approved',
  claimed: 'topup-approved',
  rejected: 'topup-rejected',
  cancelled: 'topup-cancelled'
}

const UNKNOWN_ACCOUNT = 'Unknown account'

/** A rule change belongs to no one house, so it names what it covers instead. */
export const ALL_ACCOUNTS = 'All accounts'

export function buildAccountActivity(
  accounts: readonly AccountRow[],
  topups: readonly AccountTopup[],
  policyChanges: readonly TopupPolicyChange[] = []
): { pending: PendingTopup[]; events: AccountActivityEvent[] } {
  const byId = new Map(accounts.map((account) => [account._id as string, account]))
  const events: AccountActivityEvent[] = []
  const pending: PendingTopup[] = []

  for (const account of accounts) {
    const base = { accountName: account.name, accountSlug: account.slug, amount: null }

    events.push({
      ...base,
      id: `${account._id}:created`,
      kind: 'account-created',
      at: account.createdAt,
      // The opening grant is the one figure a new account arrives with.
      amount: account.initialCredits > 0 ? account.initialCredits : null,
      detail: null
    })
    if (account.confirmedAt !== undefined) {
      events.push({ ...base, id: `${account._id}:confirmed`, kind: 'account-confirmed', at: account.confirmedAt, detail: null })
    }
    if (account.closedAt !== null) {
      events.push({ ...base, id: `${account._id}:closed`, kind: 'account-closed', at: account.closedAt, detail: account.closeReason })
    }
  }

  for (const topup of topups) {
    const account = byId.get(topup.accountId as string)
    const base = {
      accountName: account?.name ?? UNKNOWN_ACCOUNT,
      accountSlug: account?.slug ?? null,
      amount: topup.amount
    }

    events.push({
      ...base,
      id: `${topup._id}:filed`,
      kind: 'topup-filed',
      at: topup.createdAt,
      detail: topup.paymentReference ?? topup.note
    })

    if (topup.status === 'pending') {
      pending.push({ ...base, id: topup._id, at: topup.createdAt, reference: topup.paymentReference ?? topup.note })
    } else if (topup.decidedAt !== null) {
      events.push({
        ...base,
        id: `${topup._id}:decided`,
        kind: DECISION_KIND[topup.status],
        at: topup.decidedAt,
        detail: topup.decisionNote ?? topup.paymentReference
      })
    }

    // The claim is its own moment: it is when the credits reached the float.
    if (topup.claimedAt !== undefined) {
      events.push({
        ...base,
        id: `${topup._id}:claimed`,
        kind: 'topup-claimed',
        at: topup.claimedAt,
        detail: topup.paymentReference
      })
    }
  }

  for (const change of policyChanges) {
    events.push({
      id: `${change._id}:rule`,
      kind: change.requireSecondGod ? 'rule-on' : 'rule-off',
      at: change.createdAt,
      accountName: ALL_ACCOUNTS,
      accountSlug: null,
      amount: null,
      // Who switched it is the whole point of logging it.
      detail: change.actorLabel
    })
  }

  // Newest first for the feed; oldest first for what is waiting, since the
  // request that has waited longest is the one to look at.
  events.sort((a, b) => b.at - a.at)
  pending.sort((a, b) => a.at - b.at)

  return { pending, events }
}

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit'
})

export const formatActivityTime = (at: number) => timeFormatter.format(at)
