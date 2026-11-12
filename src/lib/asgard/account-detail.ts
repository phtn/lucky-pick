import type { AccountLedgerEntry, AccountTopup } from '@/lib/asgard/accounts'

type LedgerKind = AccountLedgerEntry['kind']
type TopupStatus = AccountTopup['status']

/**
 * What each kind of movement is called where no memo says it better. Written
 * out rather than derived from the identifier, so `payoutSettle` reads as
 * something an operator would say.
 */
export const LEDGER_KIND_LABEL: Record<LedgerKind, string> = {
  mint: 'Mint',
  allocate: 'Allocation',
  ticketHold: 'Ticket hold',
  ticketCapture: 'Ticket captured',
  ticketRelease: 'Ticket released',
  prize: 'Prize',
  payoutReserve: 'Payout reserved',
  payoutSettle: 'Payout settled',
  payoutRelease: 'Payout released',
  reversal: 'Reversal',
  migration: 'Migration'
}

/**
 * `approved` is not the end of a top-up: the credits move only when the house's
 * contact claims it, so the chip says what it is still waiting for.
 */
export const TOPUP_STATUS_LABEL: Record<TopupStatus, string> = {
  pending: 'Pending',
  approved: 'Awaiting claim',
  claimed: 'Claimed',
  rejected: 'Rejected',
  cancelled: 'Cancelled'
}

export const TOPUP_STATUS_TONE: Record<TopupStatus, string> = {
  pending: 'border-orange-400/25 bg-orange-500/8 text-orange-700 dark:text-orange-300',
  approved: 'border-sky-500/25 bg-sky-500/8 text-sky-700 dark:text-sky-300',
  claimed: 'border-emerald-500/25 bg-emerald-500/8 text-emerald-600 dark:text-emerald-400',
  rejected: 'border-destructive/25 bg-destructive/8 text-destructive',
  cancelled: 'border-border/60 bg-foreground/5 text-muted-foreground'
}

/**
 * The status a top-up reads as. Requests approved before claiming existed
 * minted on approval: they are stored as `approved` but already carry the mint,
 * so they read as claimed rather than as waiting on a claim that cannot happen.
 */
export const topupDisplayStatus = (topup: { status: TopupStatus; txnId: string | null }): TopupStatus =>
  topup.status === 'approved' && topup.txnId !== null ? 'claimed' : topup.status

const groupedNumber = (value: number) => value.toLocaleString('en-US')

/**
 * A float row is a movement, so its sign is part of the reading. The minus is
 * a real minus sign rather than a hyphen, which is what keeps a column of
 * figures aligned in the console's mono face.
 */
export function formatLedgerAmount(amount: number) {
  if (amount === 0) return '0'
  return `${amount > 0 ? '+' : '−'}${groupedNumber(Math.abs(amount))}`
}

/**
 * What one movement says it is: the memo an operator wrote, or the name of the
 * kind when nothing was written. A memo of only spaces is nothing written.
 */
export function formatLedgerLabel(entry: { kind: LedgerKind; memo: string | null }) {
  return entry.memo?.trim() || LEDGER_KIND_LABEL[entry.kind]
}

/**
 * A wallet's spendable balance. A wallet the account does not have reads as an
 * em dash: that it is missing is a different fact from its being empty, and
 * showing `0` for both would hide one of them.
 */
export const formatWalletAvailable = (wallet: { available: number } | null) =>
  wallet === null ? '—' : groupedNumber(wallet.available)
