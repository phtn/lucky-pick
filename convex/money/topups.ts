import { ConvexError, v } from 'convex/values'
import { CREDIT_CURRENCY, isTopupAmount } from '../../src/lib/money/credits'
import type { Doc, Id } from '../_generated/dataModel'
import { mutation, query, type MutationCtx } from '../_generated/server'
import { requireGodIdentity, requireStaffIdentity } from '../accounts/helpers'
import { post } from '../ledger/post'
import { getPartnerWallets, getSystemWallet } from '../ledger/wallets'
import schema from '../schema'
import { trimOrNull } from '../utils'
import { topupStatusSchema } from './d'

/**
 * Top-ups are the only way credits come into existence, so they are
 * maker-checker: one god records that money arrived (`request`), a different
 * god confirms it (`approve`), and only approval mints. Nothing here moves a
 * balance except through `post()`.
 */

const DEFAULT_LIST_LIMIT = 100
const MAX_LIST_LIMIT = 250
const PAYMENT_REFERENCE_MAX_LENGTH = 120
const NOTE_MAX_LENGTH = 2_000

const normalizeListLimit = (limit: number | undefined) => {
  if (limit === undefined || !Number.isFinite(limit)) {
    return DEFAULT_LIST_LIMIT
  }

  return Math.min(Math.max(Math.floor(limit), 1), MAX_LIST_LIMIT)
}

const assertTopupAmount = (amount: number) => {
  if (!isTopupAmount(amount)) {
    throw new ConvexError('A top-up must be a whole number of credits from 1 to 10,000,000.')
  }
}

/** `null` stays `null` (the opening grant has no payment); a given reference must say something. */
const normalizePaymentReference = (reference: string | null) => {
  if (reference === null) {
    return null
  }

  const trimmed = reference.trim()

  if (trimmed.length < 1 || trimmed.length > PAYMENT_REFERENCE_MAX_LENGTH) {
    throw new ConvexError(`A payment reference of 1 to ${PAYMENT_REFERENCE_MAX_LENGTH} characters is required.`)
  }

  return trimmed
}

const normalizeNote = (note: string | null | undefined) => {
  const trimmed = trimOrNull(note)

  if (trimmed && trimmed.length > NOTE_MAX_LENGTH) {
    throw new ConvexError('Notes must be 2,000 characters or fewer.')
  }

  return trimmed
}

/**
 * Records a pending request. A plain helper, not a registered function, so the
 * account-creation mutation can reuse it for the opening grant in the same
 * transaction. Callers are responsible for having authorized the maker.
 */
export async function createTopupRequest(
  ctx: MutationCtx,
  args: {
    accountId: Id<'accounts'>
    amount: number
    paymentReference: string | null
    note: string | null
    makerTokenIdentifier: string
  }
): Promise<Id<'topupRequests'>> {
  // Validated before any read so a malformed request fails fast and writes nothing.
  assertTopupAmount(args.amount)
  const paymentReference = normalizePaymentReference(args.paymentReference)
  const note = normalizeNote(args.note)

  const account = await ctx.db.get('accounts', args.accountId)

  if (!account) {
    throw new ConvexError('Account not found.')
  }

  if (account.status === 'closed') {
    throw new ConvexError('This account is closed.')
  }

  const now = Date.now()

  return await ctx.db.insert('topupRequests', {
    accountId: args.accountId,
    amount: args.amount,
    currency: CREDIT_CURRENCY,
    paymentReference,
    note,
    status: 'pending',
    makerTokenIdentifier: args.makerTokenIdentifier,
    checkerTokenIdentifier: null,
    decisionNote: null,
    decidedAt: null,
    txnId: null,
    createdAt: now,
    updatedAt: now
  })
}

/** Every decision is made on a request that is still waiting; anything else has already been settled. */
const getPendingRequest = async (ctx: MutationCtx, id: Id<'topupRequests'>) => {
  const request = await ctx.db.get('topupRequests', id)

  if (!request) {
    throw new ConvexError('Top-up request not found.')
  }

  if (request.status !== 'pending') {
    throw new ConvexError(`This top-up is already ${request.status}.`)
  }

  return request
}

export const request = mutation({
  args: {
    accountId: v.id('accounts'),
    amount: v.number(),
    paymentReference: v.string(),
    note: v.optional(v.string())
  },
  returns: v.id('topupRequests'),
  handler: async (ctx, { accountId, amount, paymentReference, note }) => {
    const identity = await requireGodIdentity(ctx)

    // Unlike the opening grant, a hand-entered top-up must say which payment it answers to.
    return await createTopupRequest(ctx, {
      accountId,
      amount,
      paymentReference,
      note: note ?? null,
      makerTokenIdentifier: identity.tokenIdentifier
    })
  }
})

export const approve = mutation({
  args: { id: v.id('topupRequests'), decisionNote: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { id, decisionNote }) => {
    const identity = await requireGodIdentity(ctx)
    const note = normalizeNote(decisionNote)
    const topup = await getPendingRequest(ctx, id)

    // The point of maker-checker: the god who recorded the payment cannot also be the one who confirms it.
    if (topup.makerTokenIdentifier === identity.tokenIdentifier) {
      throw new ConvexError('A top-up must be approved by someone other than the god who requested it.')
    }

    // Re-checked here because the account may have closed since the request was made.
    const account = await ctx.db.get('accounts', topup.accountId)

    if (!account) {
      throw new ConvexError('Account not found.')
    }

    if (account.status === 'closed') {
      throw new ConvexError('This account is closed.')
    }

    const issuance = await getSystemWallet(ctx, 'issuance')
    const { float } = await getPartnerWallets(ctx, topup.accountId)

    // The key is derived from the request, so even a replay that got past the status check cannot mint twice.
    const { txnId } = await post(ctx, {
      kind: 'mint',
      idempotencyKey: `topup:${id}`,
      actorTokenIdentifier: identity.tokenIdentifier,
      accountId: topup.accountId,
      ref: { type: 'topup', id },
      memo: topup.paymentReference,
      legs: [
        { walletId: issuance._id, bucket: 'available', amount: -topup.amount },
        { walletId: float._id, bucket: 'available', amount: topup.amount }
      ]
    })

    const now = Date.now()
    await ctx.db.patch('topupRequests', id, {
      status: 'approved',
      checkerTokenIdentifier: identity.tokenIdentifier,
      decisionNote: note,
      decidedAt: now,
      txnId,
      updatedAt: now
    })

    return null
  }
})

export const reject = mutation({
  args: { id: v.id('topupRequests'), decisionNote: v.string() },
  returns: v.null(),
  handler: async (ctx, { id, decisionNote }) => {
    const identity = await requireGodIdentity(ctx)
    const note = normalizeNote(decisionNote)

    if (!note) {
      throw new ConvexError('A rejection needs a reason.')
    }

    const topup = await getPendingRequest(ctx, id)

    // A maker who has changed their mind withdraws the request instead; only a checker refuses it.
    if (topup.makerTokenIdentifier === identity.tokenIdentifier) {
      throw new ConvexError('A top-up must be rejected by someone other than the god who requested it.')
    }

    const now = Date.now()
    await ctx.db.patch('topupRequests', id, {
      status: 'rejected',
      checkerTokenIdentifier: identity.tokenIdentifier,
      decisionNote: note,
      decidedAt: now,
      updatedAt: now
    })

    return null
  }
})

export const cancel = mutation({
  args: { id: v.id('topupRequests') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const identity = await requireGodIdentity(ctx)
    const topup = await getPendingRequest(ctx, id)

    if (topup.makerTokenIdentifier !== identity.tokenIdentifier) {
      throw new ConvexError('Only the god who requested a top-up can cancel it.')
    }

    const now = Date.now()
    await ctx.db.patch('topupRequests', id, { status: 'cancelled', decidedAt: now, updatedAt: now })

    return null
  }
})

/** The console's top-up queue: newest first, capped, optionally narrowed by status and/or account. */
export const list = query({
  args: {
    status: v.optional(topupStatusSchema),
    accountId: v.optional(v.id('accounts')),
    limit: v.optional(v.number())
  },
  returns: v.array(schema.doc('topupRequests')),
  handler: async (ctx, { status, accountId, limit }): Promise<Doc<'topupRequests'>[]> => {
    await requireStaffIdentity(ctx)

    const take = normalizeListLimit(limit)

    if (accountId) {
      const byAccount = ctx.db
        .query('topupRequests')
        .withIndex('by_accountId_and_createdAt', (q) => q.eq('accountId', accountId))
        .order('desc')

      // One account has few requests, so filtering its history by status stays small.
      return await (status ? byAccount.filter((q) => q.eq(q.field('status'), status)) : byAccount).take(take)
    }

    if (status) {
      return await ctx.db
        .query('topupRequests')
        .withIndex('by_status_and_createdAt', (q) => q.eq('status', status))
        .order('desc')
        .take(take)
    }

    return await ctx.db.query('topupRequests').order('desc').take(take)
  }
})
