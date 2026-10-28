import { ACCOUNT_STATUS_VALUES, type AccountPlan, type AccountStatus } from '@/lib/accounts/accounts'
import type {
  AsgardAccountCreateResponse,
  AsgardAccountListResponse,
  AsgardAccountSlugAvailabilityResponse
} from '@/server/asgard-account-routes'

// Type-only import: the Convex and Firebase Admin modules behind this response
// never reach the client bundle.
export type AccountRow = AsgardAccountListResponse['accounts'][number]

export type CreateAccountInput = {
  name: string
  slug?: string
  plan?: AccountPlan
  organization?: {
    legalName?: string
    website?: string
    industry?: string
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

const ASGARD_ACCOUNTS_ENDPOINT = '/api/asgard/accounts'

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

export const ACCOUNT_STATUS_LABEL: Record<AccountStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  active: 'Active',
  suspended: 'Suspended',
  closed: 'Closed'
}

export const ACCOUNT_STATUS_FILTER_LABEL: Record<AccountStatusFilter, string> = {
  all: 'All',
  ...ACCOUNT_STATUS_LABEL
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

export const ACCOUNT_PLAN_LABEL: Record<AccountPlan, string> = {
  trial: 'Trial',
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise'
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
    account.organization.legalName ?? '',
    account.organization.industry ?? ''
  ].some((field) => field.toLowerCase().includes(needle))
}

const dateFormatter = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

export const formatAccountDate = (value: number | null) => (value === null ? '—' : dateFormatter.format(value))

export const getAccountInitials = (account: AccountRow) =>
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
