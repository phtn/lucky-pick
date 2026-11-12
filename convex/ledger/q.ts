import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { ConvexError, v } from 'convex/values'
import type { Doc, Id } from '../_generated/dataModel'
import type { QueryCtx } from '../_generated/server'
import { query } from '../_generated/server'
import { getAccountBySlug, requireAccountManager } from '../accounts/helpers'
import { isPlatformStaff } from '../lib/auth'
import schema from '../schema'
import { getUserByTokenIdentifier } from '../users/q'
import { ledgerKindSchema, MY_HISTORY_LIMIT, walletBucketSchema } from './d'
import { findPartnerWallets, findUserWallet } from './wallets'

/** Staff read any account; everyone else must manage the one they are asking about. */
const requireAccountReader = async (ctx: QueryCtx, accountId: Id<'accounts'>) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity || !isPlatformStaff(identity)) await requireAccountManager(ctx, accountId)
}

/** How much of a float's life one read returns. */
const FLOAT_HISTORY_LIMIT = 50

/** Published to both `partnerFloatHistory` and `myLedgerHistory`: one joined-entry shape, so the two panels cannot drift. */
const historyEntryValidator = v.object({
  _id: v.id('ledgerEntries'),
  amount: v.number(),
  balanceAfter: v.number(),
  bucket: walletBucketSchema,
  createdAt: v.number(),
  kind: ledgerKindSchema,
  memo: v.union(v.string(), v.null())
})

/**
 * Joins each entry to the kind and memo of its transaction, keeping the order.
 *
 * One `get` per distinct transaction, bounded by the number of entries: entries
 * of one transaction share a header, so this is at most that many reads and
 * usually fewer.
 */
const withTransactionHeaders = async (ctx: QueryCtx, entries: Doc<'ledgerEntries'>[]) => {
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

/** The signed-in user's own wallet, or `null` when signed out, unseen, or never allocated credits. */
const findMyWallet = async (ctx: QueryCtx) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return null

  const user = await getUserByTokenIdentifier(ctx, identity.tokenIdentifier)
  if (!user) return null

  // A user holds one wallet per account they play on; the oldest is the one a
  // profile shows. Deliberately `.first()` and not the `.unique()` that
  // `balanceForCurrentUser` uses on its own index: a second row must read as a
  // profile, not as a `ConvexError` in the hero tile. Pinned by
  // "myWallet returns the oldest wallet" in `my-reads.test.ts`.
  return await ctx.db
    .query('wallets')
    .withIndex('by_userId', (q) => q.eq('userId', user._id))
    .first()
}

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
  returns: v.array(historyEntryValidator),
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

    return await withTransactionHeaders(ctx, entries)
  }
})

/** Houses one contact can front, and how much of each float's history the profile carries. */
const MY_HOUSE_LIMIT = 50

const balanceValidator = v.union(v.object({ available: v.number(), held: v.number() }), v.null())
const readBalance = (wallet: { available: number; held: number } | null) =>
  wallet ? { available: wallet.available, held: wallet.held } : null

/**
 * The wallets of every house the caller is the linked contact of, with each
 * float's recent movements. A top-up is claimed into the house's float, not
 * into the contact's own wallet, so this is where a claim shows up on `/me`.
 * Matches on the identity's token like `myHouses`, and returns balances only:
 * floors, ids of other wallets and payout details stay out.
 */
export const myHouseWallets = query({
  args: {},
  returns: v.array(
    v.object({
      accountId: v.id('accounts'),
      name: v.string(),
      float: balanceValidator,
      earnings: balanceValidator,
      entries: v.array(historyEntryValidator)
    })
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new ConvexError('Unauthorized.')

    const accounts = await ctx.db
      .query('accounts')
      .withIndex('by_primaryContact_tokenIdentifier', (q) =>
        q.eq('primaryContact.tokenIdentifier', identity.tokenIdentifier)
      )
      .take(MY_HOUSE_LIMIT)

    const houses = []
    for (const account of accounts) {
      const { float, earnings } = await findPartnerWallets(ctx, account._id)
      const entries = float
        ? await ctx.db
            .query('ledgerEntries')
            .withIndex('by_walletId_and_createdAt', (q) => q.eq('walletId', float._id))
            .order('desc')
            .take(MY_HISTORY_LIMIT)
        : []

      houses.push({
        accountId: account._id,
        name: account.name,
        float: readBalance(float),
        earnings: readBalance(earnings),
        entries: await withTransactionHeaders(ctx, entries)
      })
    }

    return houses.sort((a, b) => a.name.localeCompare(b.name))
  }
})

/**
 * One player as their banker sees them: who they are, what they hold at the
 * house, how that has moved, and what the house has left to give. Only the
 * house's linked contact may read it, and only for someone who plays there;
 * both refusals read the same, so an id tells a stranger nothing. Like
 * `myPlayers`, it carries a display name and picture and nothing private.
 */
export const playerAtMyHouse = query({
  args: { accountId: v.id('accounts'), userId: v.id('users') },
  returns: v.union(
    v.null(),
    v.object({
      houseName: v.string(),
      /** What the house can still hand out. */
      floatAvailable: v.number(),
      name: v.string(),
      imageUrl: v.union(v.string(), v.null()),
      joinedAt: v.number(),
      balance: v.number(),
      held: v.number(),
      isFrozen: v.boolean(),
      entries: v.array(historyEntryValidator)
    })
  ),
  handler: async (ctx, { accountId, userId }) => {
    const { account } = await requireAccountManager(ctx, accountId)

    const player = await ctx.db.get('users', userId)
    const wallet = player ? await findUserWallet(ctx, accountId, userId) : null
    if (!player || (player.selectedAccountId !== accountId && !wallet)) return null

    const { float } = await findPartnerWallets(ctx, accountId)
    const entries = wallet
      ? await ctx.db
          .query('ledgerEntries')
          .withIndex('by_walletId_and_createdAt', (q) => q.eq('walletId', wallet._id))
          .order('desc')
          .take(MY_HISTORY_LIMIT)
      : []

    return {
      houseName: account.name,
      floatAvailable: float?.available ?? 0,
      name: player.nickname ?? player.name ?? player.preferredUsername ?? 'Player',
      imageUrl: player.imageUrl ?? null,
      joinedAt: player.createdAt,
      balance: wallet?.available ?? 0,
      held: wallet?.held ?? 0,
      isFrozen: wallet?.status === 'frozen',
      entries: await withTransactionHeaders(ctx, entries)
    }
  }
})

/** The caller's own wallet. Takes no id: it is derived from the identity, so there is nothing to probe. */
export const myWallet = query({
  args: {},
  returns: v.union(schema.doc('wallets'), v.null()),
  handler: async (ctx) => await findMyWallet(ctx)
})

/**
 * The caller's own recent movements, newest first, shaped like
 * `partnerFloatHistory`. Capped rather than paginated: it feeds a fixed panel.
 */
export const myLedgerHistory = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(historyEntryValidator),
  handler: async (ctx, { limit }) => {
    const wallet = await findMyWallet(ctx)
    if (!wallet) return []

    // Clamps up to 1, like `partnerFloatHistory` beside it; `plays.q.mine`
    // reads a non-positive limit as malformed and falls back to its own page
    // size. Each follows its own neighbourhood's convention.
    const take = Math.min(Math.max(Math.floor(limit ?? MY_HISTORY_LIMIT), 1), MY_HISTORY_LIMIT)
    const entries = await ctx.db
      .query('ledgerEntries')
      .withIndex('by_walletId_and_createdAt', (q) => q.eq('walletId', wallet._id))
      .order('desc')
      .take(take)

    return await withTransactionHeaders(ctx, entries)
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
