import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { ConvexError, v } from 'convex/values'
import type { Id } from '../_generated/dataModel'
import type { QueryCtx } from '../_generated/server'
import { query } from '../_generated/server'
import { getAccountBySlug, requireAccountManager } from '../accounts/helpers'
import { isPlatformStaff } from '../lib/auth'
import schema from '../schema'
import { getUserByTokenIdentifier } from '../users/q'
import { ledgerKindSchema, walletBucketSchema } from './d'
import { findPartnerWallets } from './wallets'

/** Staff read any account; everyone else must manage the one they are asking about. */
const requireAccountReader = async (ctx: QueryCtx, accountId: Id<'accounts'>) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity || !isPlatformStaff(identity)) await requireAccountManager(ctx, accountId)
}

/** How much of a float's life one read returns. */
const FLOAT_HISTORY_LIMIT = 50

/** What the signed-in user can spend on one account: 0 until they have a wallet there. */
export const balanceForCurrentUser = query({
  args: { accountSlug: v.string() },
  returns: v.number(),
  handler: async (ctx, { accountSlug }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return 0

    const account = await getAccountBySlug(ctx, accountSlug.trim().toLowerCase())
    const user = account && (await getUserByTokenIdentifier(ctx, identity.tokenIdentifier))
    if (!account || !user) return 0

    const wallet = await ctx.db
      .query('wallets')
      .withIndex('by_accountId_and_userId', (q) => q.eq('accountId', account._id).eq('userId', user._id))
      .unique()
    return wallet?.available ?? 0
  }
})

/** A partner's two wallets, `null` for one that has not been used yet. */
export const partnerWallets = query({
  args: { accountId: v.id('accounts') },
  returns: v.object({
    float: v.union(schema.doc('wallets'), v.null()),
    earnings: v.union(schema.doc('wallets'), v.null())
  }),
  handler: async (ctx, { accountId }) => {
    await requireAccountReader(ctx, accountId)
    return await findPartnerWallets(ctx, accountId)
  }
})

/**
 * A partner float's recent movements, newest first, each carrying the kind and
 * memo of the transaction it belongs to.
 *
 * An entry on its own says only how much moved: what the money *was* lives on
 * the transaction. The console shows a float's history as lines an operator can
 * read ("Opening grant", "MPESA-1"), so the join happens here rather than
 * leaving every caller to make it. Capped rather than paginated: this is the
 * recent life of an account, not an audit trail.
 */
export const partnerFloatHistory = query({
  args: { accountId: v.id('accounts'), limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      _id: v.id('ledgerEntries'),
      amount: v.number(),
      balanceAfter: v.number(),
      bucket: walletBucketSchema,
      createdAt: v.number(),
      kind: ledgerKindSchema,
      memo: v.union(v.string(), v.null())
    })
  ),
  handler: async (ctx, { accountId, limit }) => {
    await requireAccountReader(ctx, accountId)

    const { float } = await findPartnerWallets(ctx, accountId)
    if (!float) return []

    const take = Math.min(Math.max(Math.floor(limit ?? FLOAT_HISTORY_LIMIT), 1), FLOAT_HISTORY_LIMIT)
    const entries = await ctx.db
      .query('ledgerEntries')
      .withIndex('by_walletId_and_createdAt', (q) => q.eq('walletId', float._id))
      .order('desc')
      .take(take)

    // One `get` per entry, bounded by `take`. Entries of one transaction share
    // a header, so this is at most `take` reads and usually fewer.
    const headers = new Map<string, { kind: typeof ledgerKindSchema.type; memo: string | null }>()
    for (const entry of entries) {
      if (headers.has(entry.txnId)) continue
      const txn = await ctx.db.get('ledgerTransactions', entry.txnId)
      // A transaction is immutable and never deleted, so this is defensive only.
      if (txn) headers.set(entry.txnId, { kind: txn.kind, memo: txn.memo })
    }

    return entries.flatMap((entry) => {
      const header = headers.get(entry.txnId)
      if (!header) return []

      return [
        {
          _id: entry._id,
          amount: entry.amount,
          balanceAfter: entry.balanceAfter,
          bucket: entry.bucket,
          createdAt: entry.createdAt,
          kind: header.kind,
          memo: header.memo
        }
      ]
    })
  }
})

/**
 * A wallet's history, newest first. Readable by staff, by the manager of the
 * wallet's account, and by the person a user wallet belongs to. System wallets
 * have no account and no owner, so only staff reach them. Every refusal reads
 * the same, so a caller cannot probe which wallet ids exist.
 */
export const walletEntries = query({
  args: { walletId: v.id('wallets'), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(schema.doc('ledgerEntries')),
  handler: async (ctx, { walletId, paginationOpts }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new ConvexError('Unauthorized.')

    if (!isPlatformStaff(identity)) {
      const wallet = await ctx.db.get('wallets', walletId)
      if (!wallet) throw new ConvexError('Unauthorized.')

      const owner = wallet.kind === 'user' && wallet.userId ? await ctx.db.get('users', wallet.userId) : null
      if (owner?.tokenIdentifier !== identity.tokenIdentifier) {
        if (!wallet.accountId) throw new ConvexError('Unauthorized.')
        await requireAccountManager(ctx, wallet.accountId)
      }
    }

    return await ctx.db
      .query('ledgerEntries')
      .withIndex('by_walletId_and_createdAt', (q) => q.eq('walletId', walletId))
      .order('desc')
      .paginate(paginationOpts)
  }
})
