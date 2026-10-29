import { ConvexError } from 'convex/values'
import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'
import type { LedgerKind, LedgerRef, WalletBucket } from './d'

/**
 * The only code that changes a wallet balance. It runs inside the caller's
 * mutation, so a posting commits or rolls back with the business change that
 * caused it, and Convex's serializable transactions keep concurrent postings
 * from interleaving. What it adds on top is idempotency and the invariants:
 * legs are whole and sum to zero, `held` never ends negative, and `available`
 * never ends below the wallet's floor.
 */

export type Leg = { walletId: Id<'wallets'>; bucket: WalletBucket; amount: number }

export type PostInput = {
  kind: LedgerKind
  idempotencyKey: string
  actorTokenIdentifier: string
  accountId: Id<'accounts'> | null
  ref: LedgerRef | null
  memo: string | null
  legs: Leg[]
  reversesTxnId?: Id<'ledgerTransactions'>
}

const MAX_IDEMPOTENCY_KEY_LENGTH = 200
// A win settles stake and prize in one transaction; 16 leaves room for that with margin.
const MAX_LEGS = 16

/**
 * Fields are listed explicitly so the hash depends on what was asked for, not
 * on the property order a caller happened to build its objects in. Actor and
 * memo are left out: a retry by another god, or with a reworded memo, is still
 * the same movement of money.
 */
const hashPayload = async ({ kind, accountId, ref, legs }: PostInput) => {
  const payload = JSON.stringify({
    kind,
    accountId,
    ref: ref && { type: ref.type, id: ref.id },
    legs: legs.map((leg) => ({ walletId: leg.walletId, bucket: leg.bucket, amount: leg.amount }))
  })
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

const validateLegs = (legs: Leg[]) => {
  if (legs.length < 1 || legs.length > MAX_LEGS) {
    throw new ConvexError(`A transaction needs between 1 and ${MAX_LEGS} legs.`)
  }
  if (legs.some((leg) => !Number.isSafeInteger(leg.amount) || leg.amount === 0)) {
    throw new ConvexError('Every leg must move a whole, non-zero number of credits.')
  }
  // Summed as bigints: a float sum of large amounts could round to a false zero.
  if (legs.reduce((sum, leg) => sum + BigInt(leg.amount), 0n) !== 0n) {
    throw new ConvexError('The legs of a transaction must add up to zero.')
  }
}

export async function post(
  ctx: MutationCtx,
  input: PostInput
): Promise<{ txnId: Id<'ledgerTransactions'>; replayed: boolean }> {
  const { idempotencyKey, legs } = input
  if (idempotencyKey.length < 1 || idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw new ConvexError(`An idempotency key must be 1 to ${MAX_IDEMPOTENCY_KEY_LENGTH} characters.`)
  }

  // Replays are answered before any other check, so a retry still succeeds
  // after a wallet it touched has since been frozen or spent down.
  const payloadHash = await hashPayload(input)
  const existing = await ctx.db
    .query('ledgerTransactions')
    .withIndex('by_idempotencyKey', (q) => q.eq('idempotencyKey', idempotencyKey))
    .unique()
  if (existing) {
    if (existing.payloadHash !== payloadHash) {
      throw new ConvexError('This request was already recorded with different details.')
    }
    return { txnId: existing._id, replayed: true }
  }

  validateLegs(legs)

  // Each wallet is read once and its buckets advanced in leg order, so the
  // same wallet may appear in several legs and each entry records its running value.
  const wallets = new Map<Id<'wallets'>, Doc<'wallets'>>()
  for (const { walletId } of legs) {
    if (wallets.has(walletId)) continue
    const wallet = await ctx.db.get('wallets', walletId)
    if (!wallet) throw new ConvexError('Wallet not found.')
    if (wallet.status !== 'active') throw new ConvexError('This wallet is frozen.')
    wallets.set(walletId, wallet)
  }

  const running = new Map([...wallets].map(([id, wallet]) => [id, { available: wallet.available, held: wallet.held }]))
  const balancesAfter = legs.map((leg) => {
    const state = running.get(leg.walletId)!
    state[leg.bucket] += leg.amount
    return state[leg.bucket]
  })

  // Limits apply to the final state only: a win moves the stake out of `held`
  // and the prize out of earnings in one transaction, and the order of its legs
  // must not decide whether it settles.
  for (const [id, wallet] of wallets) {
    const final = running.get(id)!
    if (!Number.isSafeInteger(final.available) || !Number.isSafeInteger(final.held)) {
      throw new ConvexError('This wallet cannot hold that many credits.')
    }
    if (final.held < 0) {
      throw new ConvexError(
        `This wallet has ${wallet.held} credits on hold, so it cannot release ${wallet.held - final.held}.`
      )
    }
    if (wallet.floor !== null && final.available < wallet.floor) {
      throw new ConvexError(
        `This wallet holds ${wallet.available} credits, so it cannot give up ${wallet.available - final.available}.`
      )
    }
  }

  const now = Date.now()
  const txnId = await ctx.db.insert('ledgerTransactions', {
    kind: input.kind,
    idempotencyKey,
    payloadHash,
    accountId: input.accountId,
    actorTokenIdentifier: input.actorTokenIdentifier,
    ref: input.ref,
    memo: input.memo,
    reversesTxnId: input.reversesTxnId ?? null,
    createdAt: now
  })
  for (const [index, leg] of legs.entries()) {
    await ctx.db.insert('ledgerEntries', {
      txnId,
      walletId: leg.walletId,
      bucket: leg.bucket,
      amount: leg.amount,
      balanceAfter: balancesAfter[index],
      createdAt: now
    })
  }
  for (const [id, final] of running) {
    await ctx.db.patch('wallets', id, { available: final.available, held: final.held, updatedAt: now })
  }

  return { txnId, replayed: false }
}

/**
 * Undoes a transaction by posting its legs negated. The key is derived from
 * the original, so a correction can only ever be applied once and a retried
 * reversal replays. It can still fail like any posting, e.g. when the credits
 * it would take back have already been spent.
 */
export async function reverse(
  ctx: MutationCtx,
  args: { txnId: Id<'ledgerTransactions'>; actorTokenIdentifier: string; memo: string }
): Promise<{ txnId: Id<'ledgerTransactions'>; replayed: boolean }> {
  const txn = await ctx.db.get('ledgerTransactions', args.txnId)
  if (!txn) throw new ConvexError('Transaction not found.')
  // Undoing a reversal would re-apply the original under a new key, a second copy of it.
  if (txn.kind === 'reversal') throw new ConvexError('A reversal cannot be reversed.')

  const entries = await ctx.db
    .query('ledgerEntries')
    .withIndex('by_txnId', (q) => q.eq('txnId', txn._id))
    .take(MAX_LEGS)

  return await post(ctx, {
    kind: 'reversal',
    idempotencyKey: `reversal:${txn._id}`,
    actorTokenIdentifier: args.actorTokenIdentifier,
    accountId: txn.accountId,
    ref: null,
    memo: args.memo,
    legs: entries.map((entry) => ({ walletId: entry.walletId, bucket: entry.bucket, amount: -entry.amount })),
    reversesTxnId: txn._id
  })
}
