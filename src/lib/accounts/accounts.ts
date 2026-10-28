/**
 * Accounts are never deleted. `closed` is the terminal state an account holder
 * can choose; `suspended` is ours to apply and is reversible from our side.
 */
export const ACCOUNT_STATUS_VALUES = ['pending', 'confirmed', 'active', 'suspended', 'closed'] as const

export type AccountStatus = (typeof ACCOUNT_STATUS_VALUES)[number]

export const DEFAULT_ACCOUNT_STATUS: AccountStatus = 'pending'

export const ACCOUNT_PLAN_VALUES = ['trial', 'starter', 'pro', 'enterprise'] as const

export type AccountPlan = (typeof ACCOUNT_PLAN_VALUES)[number]

export const DEFAULT_ACCOUNT_PLAN: AccountPlan = 'trial'

export const ACCOUNT_NAME_MAX_LENGTH = 160
export const ACCOUNT_SLUG_MAX_LENGTH = 63
export const ACCOUNT_EMAIL_MAX_LENGTH = 320
export const ACCOUNT_PHONE_MAX_LENGTH = 32
export const ACCOUNT_TITLE_MAX_LENGTH = 120
export const ACCOUNT_NOTES_MAX_LENGTH = 2_000
export const ACCOUNT_WEBSITE_MAX_LENGTH = 2_048
export const ACCOUNT_CLOSE_REASON_MAX_LENGTH = 500

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

/**
 * Normalizes a human-entered website into an absolute HTTP(S) URL. Most people
 * type a hostname, so HTTPS is assumed when the scheme is omitted.
 */
export const normalizeAccountWebsiteUrl = (value: string): string | null => {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > ACCOUNT_WEBSITE_MAX_LENGTH || /\s/.test(trimmed)) return null

  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`

  try {
    const url = new URL(candidate)
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !url.hostname) return null
    return url.toString()
  } catch {
    return null
  }
}

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
