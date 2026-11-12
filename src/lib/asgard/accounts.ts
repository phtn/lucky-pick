import { ACCOUNT_STATUS_VALUES, formatAccountCredits, type AccountStatus } from '@/lib/accounts/accounts'
import { ACCOUNT_STATUS_LABEL } from '@/lib/accounts/account-status'
import { ASGARD_ACCOUNTS_ENDPOINT, asgardAccountEndpoint } from '@/lib/asgard/account-api'
import type {
  AsgardAccountActivityResponse,
  AsgardAccountCreateResponse,
  AsgardAccountDetailResponse,
  AsgardAccountListResponse,
  AsgardAccountSettingsResponse,
  AsgardAccountSlugAvailabilityResponse
} from '@/server/asgard-account-routes'

// Type-only import: the Convex and Firebase Admin modules behind this response
// never reach the client bundle.
export type AccountRow = AsgardAccountListResponse['accounts'][number]

/** One account and everything its page shows. */
export type AccountDetail = AsgardAccountDetailResponse
export type AccountWallet = NonNullable<AccountDetail['wallets']['float']>
export type AccountLedgerEntry = AccountDetail['entries'][number]
export type AccountTopup = AccountDetail['topups'][number]

export type CreateAccountInput = {
  name: string
  slug?: string
  /** An https:// image address, or absent for a house with no logo of its own. */
  logoUrl?: string
  initialCredits?: number
  /** Minted into the float on creation, with no approval, so transfers can be tested. */
  testCredits?: number
  payoutDetails?: {
    bankOrWallet?: string
    accountName?: string
    accountNumber?: string
    notes?: string
  }
  primaryContact: {
    name: string
    email: string
    phone?: string
    title?: string
    /** Set when the contact was picked from the user directory. */
    firebaseUid?: string
  }
  billingEmail?: string
  notes?: string
}

async function readError(response: Response, fallback: string) {
  try {
    const body: unknown = await response.json()
    const error = typeof body === 'object' && body !== null ? (body as { error?: unknown }).error : undefined
    return typeof error === 'string' && error.length > 0 ? error : fallback
  } catch {
    return fallback
  }
}

async function requestJson<T>(input: string, init: RequestInit, fallback: string): Promise<T> {
  const response = await fetch(input, { credentials: 'same-origin', ...init })
  if (!response.ok) throw new Error(await readError(response, fallback))
  return (await response.json()) as T
}

export function fetchAccounts(signal?: AbortSignal) {
  return requestJson<AsgardAccountListResponse>(
    ASGARD_ACCOUNTS_ENDPOINT,
    { signal },
    'Could not load the account roster.'
  )
}

/** The roster and recent top-ups the Activity tab builds its feed from. */
export function fetchAccountActivity(signal?: AbortSignal) {
  return requestJson<AsgardAccountActivityResponse>(
    `${ASGARD_ACCOUNTS_ENDPOINT}?view=activity`,
    { signal },
    'Could not load account activity.'
  )
}

export type AccountSettings = AsgardAccountSettingsResponse
export type TopupPolicyChange = AsgardAccountActivityResponse['policyChanges'][number]

export function fetchAccountSettings(signal?: AbortSignal) {
  return requestJson<AccountSettings>(
    `${ASGARD_ACCOUNTS_ENDPOINT}?view=settings`,
    { signal },
    'Could not load the account rules.'
  )
}

/** Switches the second-god rule and answers with the settings as they now stand. */
export function setSecondGodRule(requireSecondGod: boolean) {
  return requestJson<AccountSettings>(
    ASGARD_ACCOUNTS_ENDPOINT,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'set-second-god-rule', requireSecondGod })
    },
    'Could not change the approval rule.'
  )
}

/** One account's page. A 404 is a real answer here, so it reads as `null`. */
export async function fetchAccount(slug: string, signal?: AbortSignal): Promise<AccountDetail | null> {
  const response = await fetch(asgardAccountEndpoint(slug), { credentials: 'same-origin', signal })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(await readError(response, 'Could not load this account.'))

  return (await response.json()) as AccountDetail
}

/** What the account page can do about top-ups. Mirrors the route's POST body. */
export type TopupAction =
  | { action: 'request'; amount: number; paymentReference: string; note?: string }
  | { action: 'approve'; id: string; decisionNote?: string }
  | { action: 'reject'; id: string; decisionNote: string }
  | { action: 'cancel'; id: string }

/** Files or decides a top-up and answers with the account as it now stands. */
export function submitTopupAction(slug: string, action: TopupAction) {
  return requestJson<AccountDetail>(
    asgardAccountEndpoint(slug),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(action)
    },
    'Could not update this top-up.'
  )
}

export function checkAccountSlugAvailability(slug: string, signal?: AbortSignal) {
  return requestJson<AsgardAccountSlugAvailabilityResponse>(
    `${ASGARD_ACCOUNTS_ENDPOINT}?slug=${encodeURIComponent(slug)}`,
    { signal },
    'Could not validate this slug.'
  )
}

export function createAccount(input: CreateAccountInput) {
  return requestJson<AsgardAccountCreateResponse>(
    ASGARD_ACCOUNTS_ENDPOINT,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input)
    },
    'Could not create the account.'
  )
}

export type AccountStatusFilter = 'all' | AccountStatus

export const ACCOUNT_STATUS_FILTERS: AccountStatusFilter[] = ['all', ...ACCOUNT_STATUS_VALUES]

export const ACCOUNT_STATUS_FILTER_LABEL: Record<AccountStatusFilter, string> = {
  all: 'All',
  ...ACCOUNT_STATUS_LABEL
}

export function countAccountsByStatus(accounts: AccountRow[]) {
  const counts: Record<AccountStatusFilter, number> = {
    all: accounts.length,
    pending: 0,
    confirmed: 0,
    active: 0,
    suspended: 0,
    closed: 0
  }

  for (const account of accounts) counts[account.status] += 1

  return counts
}

export function matchesAccountQuery(account: AccountRow, query: string) {
  const needle = query.trim().toLowerCase()
  if (!needle) return true

  return [
    account.name,
    account.slug,
    account.primaryContact.name,
    account.primaryContact.email,
    account.payoutDetails.accountName ?? '',
    account.payoutDetails.bankOrWallet ?? ''
  ].some((field) => field.toLowerCase().includes(needle))
}

const dateFormatter = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

/** The account's opening grant, as the roster shows it. */
export const formatAccountCreditGrant = (account: AccountRow) => `${formatAccountCredits(account.initialCredits)} CR`

export const formatAccountDate = (value: number | null) => (value === null ? '—' : dateFormatter.format(value))

/** Takes the name alone, so the roster row and the account page share it. */
export const getAccountInitials = (account: { name: string }) =>
  account.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')

/** First name plus a last initial, which is how a contact reads in a row. */
export function formatContactName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)

  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]

  return `${parts[0]} ${parts[parts.length - 1][0]}`
}
