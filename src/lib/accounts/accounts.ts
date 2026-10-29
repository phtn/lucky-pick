/**
 * Accounts are never deleted. `closed` is the terminal state an account holder
 * can choose; `suspended` is ours to apply and is reversible from our side.
 */
export const ACCOUNT_STATUS_VALUES = ['pending', 'confirmed', 'active', 'suspended', 'closed'] as const

export type AccountStatus = (typeof ACCOUNT_STATUS_VALUES)[number]

export const DEFAULT_ACCOUNT_STATUS: AccountStatus = 'pending'

/**
 * The credit balance an account opens with. A fixed ladder rather than a free
 * number: the grant is chosen from the console, so the options are the policy.
 */
export const ACCOUNT_CREDIT_OPTIONS = [0, 5_000, 50_000, 100_000, 250_000, 500_000, 1_000_000] as const

export type AccountCreditOption = (typeof ACCOUNT_CREDIT_OPTIONS)[number]

export const DEFAULT_ACCOUNT_CREDITS: AccountCreditOption = 0

export const isAccountCreditOption = (value: number): value is AccountCreditOption =>
  (ACCOUNT_CREDIT_OPTIONS as readonly number[]).includes(value)

/** `0`, `5K`, `250K`, `1M` — the ladder's own shorthand, not a locale format. */
export function formatAccountCredits(value: number) {
  if (value === 0) return '0'
  if (value % 1_000_000 === 0) return `${value / 1_000_000}M`
  if (value % 1_000 === 0) return `${value / 1_000}K`
  return value.toLocaleString()
}

export const ACCOUNT_NAME_MAX_LENGTH = 160
export const ACCOUNT_SLUG_MAX_LENGTH = 63
export const ACCOUNT_EMAIL_MAX_LENGTH = 320
export const ACCOUNT_PHONE_MAX_LENGTH = 32
export const ACCOUNT_TITLE_MAX_LENGTH = 120
export const ACCOUNT_NOTES_MAX_LENGTH = 2_000
export const ACCOUNT_CLOSE_REASON_MAX_LENGTH = 500

export const ACCOUNT_PAYOUT_PROVIDER_MAX_LENGTH = 120
export const ACCOUNT_PAYOUT_ACCOUNT_NAME_MAX_LENGTH = 160
export const ACCOUNT_PAYOUT_ACCOUNT_NUMBER_MAX_LENGTH = 64

const EMAIL_ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const isAccountEmailAddress = (value: string) =>
  value.length <= ACCOUNT_EMAIL_MAX_LENGTH && EMAIL_ADDRESS_PATTERN.test(value)

export const isAccountSlug = (value: string) =>
  value.length > 0 && value.length <= ACCOUNT_SLUG_MAX_LENGTH && SLUG_PATTERN.test(value)

export const toAccountSlug = (value: string) =>
  value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, ACCOUNT_SLUG_MAX_LENGTH)
    .replace(/-+$/g, '')

export const isClosedAccountStatus = (status: AccountStatus) => status === 'closed'

/** Statuses whose members can still act on the account. */
export const canUseAccount = (status: AccountStatus) => status === 'confirmed' || status === 'active'

/** Top-level application routes and subdomains cannot also be account handles. */
export const RESERVED_ACCOUNT_SLUGS = new Set([
  'account',
  'accounts',
  'admin',
  'analytics',
  'api',
  'asgard',
  'assets',
  'auth',
  'favicon',
  'draw',
  'draws',
  'game',
  'games',
  'legal',
  'login',
  'logout',
  'pick',
  'play',
  'results',
  'robots',
  'settings',
  'signin',
  'signout',
  'signup',
  'sitemap',
  'static',
  'tickets',
  'www'
])

export const isPublicAccountSlug = (slug: string) => isAccountSlug(slug) && !RESERVED_ACCOUNT_SLUGS.has(slug)
