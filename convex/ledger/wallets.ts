import { ConvexError } from 'convex/values'
import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import type { SystemWalletKey } from './d'

/**
 * Wallets are created on first use rather than up front, so an account or a
 * system key never needs a provisioning step to be postable. Creation starts
 * every balance at zero: money only ever arrives through `post()`.
 */

export const getSystemWallet = async (ctx: MutationCtx, key: SystemWalletKey): Promise<Doc<'wallets'>> => {
  const existing = await ctx.db
    .query('wallets')
    .withIndex('by_systemKey', (q) => q.eq('systemKey', key))
    .unique()
  if (existing) return existing

  const now = Date.now()
  const id = await ctx.db.insert('wallets', {
    kind: 'system',
    accountId: null,
    userId: null,
    systemKey: key,
    available: 0,
    held: 0,
    // Issuance is the negative mirror of every credit outstanding; fees only ever accrue.
    floor: key === 'issuance' ? null : 0,
    status: 'active',
    createdAt: now,
    updatedAt: now
  })
  return (await ctx.db.get('wallets', id))!
}

const findPartnerWallet = async (
  ctx: QueryCtx,
  accountId: Id<'accounts'>,
  kind: 'partnerFloat' | 'partnerEarnings'
) =>
  await ctx.db
    .query('wallets')
    .withIndex('by_accountId_and_kind', (q) => q.eq('accountId', accountId).eq('kind', kind))
    .unique()

export const findPartnerWallets = async (ctx: QueryCtx, accountId: Id<'accounts'>) => ({
  float: await findPartnerWallet(ctx, accountId, 'partnerFloat'),
  earnings: await findPartnerWallet(ctx, accountId, 'partnerEarnings')
})

export const getPartnerWallets = async (
  ctx: MutationCtx,
  accountId: Id<'accounts'>
): Promise<{ float: Doc<'wallets'>; earnings: Doc<'wallets'> }> => {
  const found = await findPartnerWallets(ctx, accountId)
  if (found.float && found.earnings) return { float: found.float, earnings: found.earnings }

  // Checked only on the create path: a wallet must never exist for an account that does not.
  if (!(await ctx.db.get('accounts', accountId))) throw new ConvexError('Account not found.')

  const create = async (kind: 'partnerFloat' | 'partnerEarnings', floor: number | null) => {
    const now = Date.now()
    const id = await ctx.db.insert('wallets', {
      kind,
      accountId,
      userId: null,
      systemKey: null,
      available: 0,
      held: 0,
      floor,
      status: 'active',
      createdAt: now,
      updatedAt: now
    })
    return (await ctx.db.get('wallets', id))!
  }

  return {
    // Float is spent by allocating it, so it cannot go below zero.
    float: found.float ?? (await create('partnerFloat', 0)),
    // Earnings are unbounded below because a prize must always pay.
    earnings: found.earnings ?? (await create('partnerEarnings', null))
  }
}
