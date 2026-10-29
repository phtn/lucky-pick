import { isAccountCreditOption } from '@/lib/accounts/accounts'
import { AdminIdTokenError, mintAdminIdToken } from '@/lib/firebase-admin/admin-id-token'
import { getFirebaseAdminAuth } from '@/lib/firebase-admin/admin'
import { getVerifiedGodSession } from '@/lib/firebase-admin/server-auth'
import { getHostnameFromHostHeader } from '@/lib/routing/admin-subdomain'
import { isAsgardConsoleHostname } from '@/lib/routing/asgard-subdomain'
import { api } from '../../convex/_generated/api'
import { createConvexClient, RequestError } from './convex'

export interface AsgardAccountRouteEnvironment {
  convexUrl?: string
}

export type AsgardAccountListResponse = {
  accounts: Awaited<ReturnType<typeof listAccounts>>
}

export type AsgardAccountCreateResponse = AsgardAccountListResponse

export type AsgardAccountSlugAvailabilityResponse = Awaited<ReturnType<typeof checkAccountSlugAvailability>>

const ACCOUNT_LIST_LIMIT = 250

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

function isAsgardRequest(request: Request) {
  const hostname =
    getHostnameFromHostHeader(request.headers.get('x-forwarded-host') ?? request.headers.get('host')) ??
    new URL(request.url).hostname

  return isAsgardConsoleHostname(hostname)
}

function isSameOriginRequest(request: Request) {
  const origin = request.headers.get('origin')
  return origin === null || origin === new URL(request.url).origin
}

type AsgardConvexClient = ReturnType<typeof createConvexClient>
type GodSession = NonNullable<Awaited<ReturnType<typeof getVerifiedGodSession>>>

/**
 * Asgard authenticates with a god session cookie, which Convex cannot verify —
 * `verifySessionCookie` returns a decoded token, not a re-usable one. Re-mint a
 * real ID token for the already-verified god so Convex sees their genuine
 * claims; no identity is forged and Convex still enforces its own rules.
 */
async function getAsgardConvexClient(
  session: GodSession,
  environment: AsgardAccountRouteEnvironment
): Promise<AsgardConvexClient> {
  return createConvexClient(await mintAdminIdToken(session.decodedToken.uid), environment.convexUrl)
}

const listAccounts = (client: AsgardConvexClient) =>
  client.query(api.accounts.q.listForAsgard, { limit: ACCOUNT_LIST_LIMIT })

const checkAccountSlugAvailability = (client: AsgardConvexClient, slug: string) =>
  client.query(api.accounts.q.checkSlugAvailability, { slug })

const asTrimmedString = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

const asOptionalString = (value: unknown) => {
  const trimmed = asTrimmedString(value)
  return trimmed.length > 0 ? trimmed : undefined
}

const readObject = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

/**
 * Shapes the request body into the mutation's argument type. Convex re-validates
 * every field, so this only has to narrow `unknown` — it is not the authority on
 * what a valid account is.
 */
function readCreateAccountBody(body: unknown) {
  const payload = readObject(body)
  const contact = readObject(payload.primaryContact)
  const payoutDetails = readObject(payload.payoutDetails)

  const name = asTrimmedString(payload.name)
  const contactName = asTrimmedString(contact.name)
  const contactEmail = asTrimmedString(contact.email)

  if (!name) return { error: 'An account name is required.' as const }
  if (!contactName) return { error: 'A primary contact name is required.' as const }
  if (!contactEmail) return { error: 'A primary contact email is required.' as const }

  // The credit amount is re-checked against the ladder by the mutation, which
  // is what rejects an amount the console never offered.
  const initialCredits = typeof payload.initialCredits === 'number' ? payload.initialCredits : undefined
  if (initialCredits !== undefined && !isAccountCreditOption(initialCredits)) {
    return { error: 'That credit amount is not one of the offered grants.' as const }
  }

  return {
    input: {
      name,
      slug: asOptionalString(payload.slug),
      initialCredits,
      payoutDetails: {
        bankOrWallet: asOptionalString(payoutDetails.bankOrWallet),
        accountName: asOptionalString(payoutDetails.accountName),
        accountNumber: asOptionalString(payoutDetails.accountNumber),
        notes: asOptionalString(payoutDetails.notes)
      },
      primaryContact: {
        name: contactName,
        email: contactEmail,
        phone: asOptionalString(contact.phone) ?? null,
        title: asOptionalString(contact.title) ?? null,
        firebaseUid: asOptionalString(contact.firebaseUid) ?? null
      },
      billingEmail: asOptionalString(payload.billingEmail) ?? null,
      notes: asOptionalString(payload.notes) ?? null
    }
  }
}

// Convex reports our `ConvexError` messages inside the thrown Error's text.
// Surface that to the operator rather than a generic failure.
function readConvexErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return null

  const match = /Uncaught ConvexError:\s*(.+?)(?:\n|$)/.exec(error.message)
  return match ? match[1].trim() : null
}

function handleRouteError(error: unknown, fallback: string) {
  if (error instanceof RequestError) return json({ error: error.message }, error.status)
  if (error instanceof AdminIdTokenError) {
    return json({ error: 'The Asgard session could not be authenticated.' }, 500)
  }

  const convexMessage = readConvexErrorMessage(error)
  if (convexMessage) return json({ error: convexMessage }, 400)

  if (error instanceof Error && /Unauthorized|Unauthenticated/i.test(error.message)) {
    return json({ error: 'God access is required.' }, 403)
  }

  return json({ error: fallback }, 500)
}

/**
 * `GET /api/asgard/accounts` — every account and its status.
 * `GET /api/asgard/accounts?slug=…` — validate one prospective slug.
 * `POST /api/asgard/accounts` — provision a new account.
 */
export async function handleAsgardAccounts(
  request: Request,
  environment: AsgardAccountRouteEnvironment = {}
): Promise<Response> {
  if (!isAsgardRequest(request)) return json({ error: 'Not found.' }, 404)
  if (request.method !== 'GET' && request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405)
  }
  if (request.method === 'POST' && !isSameOriginRequest(request)) {
    return json({ error: 'Invalid request origin.' }, 403)
  }

  // Checked before the session so an unconfigured deployment reports what is
  // actually wrong rather than claiming the caller lacks access.
  if (!getFirebaseAdminAuth()) return json({ error: 'Firebase Admin credentials are not configured.' }, 503)

  const session = await getVerifiedGodSession(request)
  if (!session) return json({ error: 'God access is required.' }, 401)

  try {
    const client = await getAsgardConvexClient(session, environment)

    if (request.method === 'GET') {
      const slug = new URL(request.url).searchParams.get('slug')
      if (slug !== null) return json(await checkAccountSlugAvailability(client, slug))
      return json({ accounts: await listAccounts(client) })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return json({ error: 'A valid JSON request body is required.' }, 400)
    }

    const parsed = readCreateAccountBody(body)
    if ('error' in parsed) return json({ error: parsed.error }, 400)

    await client.mutation(api.accounts.m.create, parsed.input)

    // Re-read rather than appending the new row: the list is ordered and capped
    // server-side, so the client should not guess where it lands.
    const created: AsgardAccountCreateResponse = { accounts: await listAccounts(client) }
    return json(created, 201)
  } catch (error) {
    return handleRouteError(
      error,
      request.method === 'POST' ? 'Unable to create the account.' : 'Unable to load accounts.'
    )
  }
}
