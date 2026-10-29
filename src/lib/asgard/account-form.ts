import { debounce, parseAsNumberLiteral, parseAsString, type SetValues, useQueryStates } from '@octanejs/nuqs'
import { useForm } from '@octanejs/tanstack-form'
import { ACCOUNT_CREDIT_OPTIONS, ACCOUNT_NAME_MAX_LENGTH, ACCOUNT_NOTES_MAX_LENGTH, ACCOUNT_PAYOUT_ACCOUNT_NAME_MAX_LENGTH, ACCOUNT_PAYOUT_ACCOUNT_NUMBER_MAX_LENGTH, ACCOUNT_PAYOUT_PROVIDER_MAX_LENGTH, ACCOUNT_PHONE_MAX_LENGTH, DEFAULT_ACCOUNT_CREDITS, isAccountEmailAddress, isAccountSlug, isPublicAccountSlug, RESERVED_ACCOUNT_SLUGS, toAccountSlug, type AccountCreditOption } from '@/lib/accounts/accounts'
import type { CreateAccountInput } from '@/lib/asgard/accounts'
import { readErrorMessage } from '@/lib/asgard/errors'

/**
 * Every value the create-account form owns, flattened so each one maps to a
 * single query-string key.
 */
export interface AccountFormValues {
  name: string
  slug: string
  /** The opening credit grant, one of `ACCOUNT_CREDIT_OPTIONS`. */
  initialCredits: AccountCreditOption
  contactName: string
  contactEmail: string
  contactPhone: string
  contactTitle: string
  /**
   * Firebase uid of the linked directory user. Empty when the contact was
   * typed by hand rather than picked from the directory.
   */
  contactUid: string
  payoutBankOrWallet: string
  payoutAccountName: string
  payoutAccountNumber: string
  payoutNotes: string
}

/** The fields a plain text control can bind, so one component covers them all. */
export type AccountTextField = Exclude<keyof AccountFormValues, 'initialCredits' | 'contactUid'>

export const ACCOUNT_FORM_DEFAULTS: AccountFormValues = {
  name: '',
  slug: '',
  initialCredits: DEFAULT_ACCOUNT_CREDITS,
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  contactTitle: '',
  contactUid: '',
  payoutBankOrWallet: '',
  payoutAccountName: '',
  payoutAccountNumber: '',
  payoutNotes: ''
}

/**
 * The draft lives in the query string, so a half-filled form survives a reload
 * and can be handed to someone else as a link. Keys are only written once a
 * value diverges from its default, which keeps an untouched form out of the URL.
 */
const ACCOUNT_DRAFT_PARSERS = {
  name: parseAsString.withDefault(ACCOUNT_FORM_DEFAULTS.name),
  slug: parseAsString.withDefault(ACCOUNT_FORM_DEFAULTS.slug),
  initialCredits: parseAsNumberLiteral(ACCOUNT_CREDIT_OPTIONS).withDefault(ACCOUNT_FORM_DEFAULTS.initialCredits),
  contactName: parseAsString.withDefault(ACCOUNT_FORM_DEFAULTS.contactName),
  contactEmail: parseAsString.withDefault(ACCOUNT_FORM_DEFAULTS.contactEmail),
  contactPhone: parseAsString.withDefault(ACCOUNT_FORM_DEFAULTS.contactPhone),
  contactTitle: parseAsString.withDefault(ACCOUNT_FORM_DEFAULTS.contactTitle),
  contactUid: parseAsString.withDefault(ACCOUNT_FORM_DEFAULTS.contactUid),
  payoutBankOrWallet: parseAsString.withDefault(ACCOUNT_FORM_DEFAULTS.payoutBankOrWallet),
  payoutAccountName: parseAsString.withDefault(ACCOUNT_FORM_DEFAULTS.payoutAccountName),
  payoutAccountNumber: parseAsString.withDefault(ACCOUNT_FORM_DEFAULTS.payoutAccountNumber),
  payoutNotes: parseAsString.withDefault(ACCOUNT_FORM_DEFAULTS.payoutNotes)
}

export type AccountDraftParsers = typeof ACCOUNT_DRAFT_PARSERS

const DRAFT_URL_DEBOUNCE_MS = 400

/**
 * Reads and writes the draft through the query string. The annotated return
 * type is the guard that keeps the parser map and the form values in step: a
 * field added to one and not the other fails to compile.
 */
export function useAccountDraft(): [AccountFormValues, SetValues<AccountDraftParsers>] {
  return useQueryStates(ACCOUNT_DRAFT_PARSERS, {
    // Typing must not stack one history entry per keystroke, and the URL only
    // has to catch up once the typing pauses.
    history: 'replace',
    limitUrlUpdates: debounce(DRAFT_URL_DEBOUNCE_MS)
  })
}

/**
 * Validates the whole form in one pass. Returning the errors keyed by field is
 * the shape TanStack Form spreads onto the individual fields, so the same
 * function drives both the per-field messages and the submit button.
 */
export function validateAccountForm(values: AccountFormValues) {
  const fields: Partial<Record<AccountTextField, string>> = {}

  const name = values.name.trim()
  if (name.length === 0) fields.name = 'An account name is required.'
  else if (name.length > ACCOUNT_NAME_MAX_LENGTH) fields.name = `Keep this under ${ACCOUNT_NAME_MAX_LENGTH} characters.`

  const slugMessage = validateAccountSlug(resolveAccountSlug(values))
  if (slugMessage) fields.slug = slugMessage

  if (values.contactName.trim().length === 0) fields.contactName = 'A contact name is required.'

  const contactEmail = values.contactEmail.trim()
  if (contactEmail.length === 0) fields.contactEmail = 'A contact email is required.'
  else if (!isAccountEmailAddress(contactEmail)) fields.contactEmail = 'Enter a valid email address.'

  if (values.contactPhone.trim().length > ACCOUNT_PHONE_MAX_LENGTH)
    fields.contactPhone = `Keep this under ${ACCOUNT_PHONE_MAX_LENGTH} characters.`

  if (values.payoutBankOrWallet.trim().length > ACCOUNT_PAYOUT_PROVIDER_MAX_LENGTH)
    fields.payoutBankOrWallet = `Keep this under ${ACCOUNT_PAYOUT_PROVIDER_MAX_LENGTH} characters.`

  if (values.payoutAccountName.trim().length > ACCOUNT_PAYOUT_ACCOUNT_NAME_MAX_LENGTH)
    fields.payoutAccountName = `Keep this under ${ACCOUNT_PAYOUT_ACCOUNT_NAME_MAX_LENGTH} characters.`

  if (values.payoutAccountNumber.trim().length > ACCOUNT_PAYOUT_ACCOUNT_NUMBER_MAX_LENGTH)
    fields.payoutAccountNumber = `Keep this under ${ACCOUNT_PAYOUT_ACCOUNT_NUMBER_MAX_LENGTH} characters.`

  if (values.payoutNotes.trim().length > ACCOUNT_NOTES_MAX_LENGTH)
    fields.payoutNotes = `Keep this under ${ACCOUNT_NOTES_MAX_LENGTH} characters.`

  return Object.keys(fields).length > 0 ? { fields } : undefined
}

/** The exact slug the create mutation will receive, including its name fallback. */
export const resolveAccountSlug = (values: Pick<AccountFormValues, 'name' | 'slug'>) =>
  values.slug.trim() || toAccountSlug(values.name)

/** Synchronous slug rules shared by the form and the availability workflow. */
export function validateAccountSlug(slug: string) {
  if (!slug) return 'Enter an account name or a custom slug.'
  if (!isAccountSlug(slug)) return 'Use lowercase letters, numbers, and single dashes.'
  if (RESERVED_ACCOUNT_SLUGS.has(slug)) return `“${slug}” is reserved by the application. Choose another slug.`
  if (!isPublicAccountSlug(slug)) return 'This slug cannot be used for a public account.'
  return null
}

const trimmed = (value: string) => {
  const next = value.trim()
  return next.length > 0 ? next : undefined
}

export function toCreateAccountInput(values: AccountFormValues): CreateAccountInput {
  return {
    name: values.name.trim(),
    slug: trimmed(values.slug),
    initialCredits: values.initialCredits,
    payoutDetails: {
      bankOrWallet: trimmed(values.payoutBankOrWallet),
      accountName: trimmed(values.payoutAccountName),
      accountNumber: trimmed(values.payoutAccountNumber),
      notes: trimmed(values.payoutNotes)
    },
    primaryContact: {
      name: values.contactName.trim(),
      email: values.contactEmail.trim(),
      phone: trimmed(values.contactPhone),
      title: trimmed(values.contactTitle),
      firebaseUid: trimmed(values.contactUid)
    }
  }
}

/** Validation errors are typed as `unknown`, so only real strings are shown. */
export const readValidationMessage = (errors: ReadonlyArray<unknown>) => {
  const message = errors.find((error) => typeof error === 'string' && error.length > 0)
  return typeof message === 'string' ? message : null
}

export interface UseAccountFormOptions {
  /** Seed values, read from the query string once when the form mounts. */
  defaultValues: AccountFormValues
  /** Called with every edit so the draft can be mirrored back into the URL. */
  onDraftChange: (values: AccountFormValues) => void
  onSubmit: (input: CreateAccountInput) => Promise<void>
}

/**
 * Owns the create-account form. A failed submission is written back into the
 * form's own error map rather than into component state, so the button, the
 * banner, and the field messages all read from one place.
 */
export function useAccountForm({ defaultValues, onDraftChange, onSubmit }: UseAccountFormOptions) {
  return useForm({
    defaultValues,
    validators: {
      onChange: ({ value }) => validateAccountForm(value)
    },
    listeners: {
      onChange: ({ formApi }) => onDraftChange(formApi.state.values)
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        await onSubmit(toCreateAccountInput(value))
      } catch (error: unknown) {
        formApi.setErrorMap({
          onSubmit: { form: readErrorMessage(error, 'Could not create the account.'), fields: {} }
        })
      }
    }
  })
}

export type AccountForm = ReturnType<typeof useAccountForm>
