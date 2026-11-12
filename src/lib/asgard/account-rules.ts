import {
  ACCOUNT_CLOSE_REASON_MAX_LENGTH,
  ACCOUNT_CREDIT_OPTIONS,
  ACCOUNT_NAME_MAX_LENGTH,
  ACCOUNT_NOTES_MAX_LENGTH,
  ACCOUNT_SLUG_MAX_LENGTH,
  RESERVED_ACCOUNT_SLUGS,
  formatAccountCredits
} from '@/lib/accounts/accounts'
import { CREDIT_CURRENCY, MAX_TOPUP_CREDITS } from '@/lib/money/credits'

/**
 * The rules every account runs under, as the Settings tab states them. All but
 * one are read-only because they are constants and checks in code, not stored
 * settings; top-up approval is the exception and is listed by
 * `topupApprovalRules`. Here the figures come from the same constants the server enforces, and
 * the sentences describe what the Convex functions check.
 */
export interface AccountRule {
  label: string
  value: string
  detail?: string
}

export interface AccountRuleGroup {
  title: string
  rules: AccountRule[]
}

const grouped = (value: number) => value.toLocaleString('en-US')

/** The top-up approval rules, which read differently once the second-god check is off. */
export const topupApprovalRules = (requireSecondGod: boolean): AccountRule[] => [
  { label: 'File a request', value: 'Any god' },
  requireSecondGod
    ? { label: 'Approve or reject', value: 'A different god', detail: 'A rejection needs a reason.' }
    : {
        label: 'Approve or reject',
        value: 'Any god, including the one who filed it',
        detail: 'A rejection needs a reason. The record still names who filed and who decided.'
      },
  {
    label: 'Credits reach the float',
    value: 'When the account’s contact claims it',
    detail: 'Approval notifies the contact. Only a linked contact of a confirmed or active account can claim.'
  },
  { label: 'Cancel', value: 'Only the god who filed it' },
  { label: 'Closed accounts', value: 'Cannot be topped up' },
  { label: 'Switch the second-god check', value: 'Top god only', detail: 'Every switch is logged in Activity.' }
]

export const ACCOUNT_RULE_GROUPS: AccountRuleGroup[] = [
  {
    title: 'Credits',
    rules: [
      { label: 'Unit', value: `1 credit = 1 ${CREDIT_CURRENCY}`, detail: 'Whole credits only.' },
      {
        label: 'Opening grant',
        value: `0 to ${grouped(MAX_TOPUP_CREDITS)}`,
        detail: `Minted when the account is created, with no approval. Shortcuts: ${ACCOUNT_CREDIT_OPTIONS.map(formatAccountCredits).join(', ')}.`
      },
      {
        label: 'One top-up',
        value: `1 to ${grouped(MAX_TOPUP_CREDITS)}`,
        detail: 'Needs a payment reference.'
      }
    ]
  },
  {
    title: 'Who may do what',
    rules: [
      {
        label: 'Read accounts, wallets and top-ups',
        value: 'God or admin',
        detail: 'This console itself opens only for a god session.'
      },
      { label: 'Create an account', value: 'God' },
      { label: 'Choose the primary contact', value: 'God', detail: 'The contact is who may act for the house.' },
      { label: 'Edit other account details', value: 'God or admin' },
      { label: 'Delete an account permanently', value: 'Top god only', detail: 'Closing keeps the record; deleting does not.' }
    ]
  },
  {
    title: 'Status',
    rules: [
      { label: 'New account', value: 'Pending', detail: 'Until its primary contact signs in and confirms it.' },
      { label: 'Open to players', value: 'Confirmed or active' },
      {
        label: 'Contact is notified when',
        value: 'Activated, suspended or closed'
      }
    ]
  },
  {
    title: 'Record limits',
    rules: [
      { label: 'Name', value: `${ACCOUNT_NAME_MAX_LENGTH} characters` },
      {
        label: 'Slug',
        value: `${ACCOUNT_SLUG_MAX_LENGTH} characters`,
        detail: `Lowercase letters, digits and hyphens. ${RESERVED_ACCOUNT_SLUGS.size} names are reserved.`
      },
      { label: 'Notes', value: `${grouped(ACCOUNT_NOTES_MAX_LENGTH)} characters` },
      { label: 'Close reason', value: `${ACCOUNT_CLOSE_REASON_MAX_LENGTH} characters` },
      { label: 'Logo', value: 'https address only' }
    ]
  }
]
