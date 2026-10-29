import type { Id } from '../_generated/dataModel'
import type { QueryCtx } from '../_generated/server'

/**
 * Re-derives balances from the entries and checks two invariants: every
 * wallet's buckets equal the sum of its entries, and all wallets together sum
 * to zero. A non-zero `total` means money was created or destroyed outside a
 * balanced posting; a mismatched wallet means a balance was written without one.
 *
 * Reads at most `limit` wallets, so a larger ledger is only partly covered
 * here; Phase 5 paginates it.
 */
export const auditWallets = async (
  ctx: QueryCtx,
  limit = 500
): Promise<{ total: number; mismatched: Id<'wallets'>[] }> => {
  const wallets = await ctx.db.query('wallets').take(limit)
  let total = 0
  const mismatched: Id<'wallets'>[] = []

  for (const wallet of wallets) {
    total += wallet.available + wallet.held
    const sums = { available: 0, held: 0 }
    // A wallet's whole history, not a page of it: a partial sum would report a false mismatch.
    for await (const entry of ctx.db
      .query('ledgerEntries')
      .withIndex('by_walletId_and_createdAt', (q) => q.eq('walletId', wallet._id))) {
      sums[entry.bucket] += entry.amount
    }
    if (sums.available !== wallet.available || sums.held !== wallet.held) mismatched.push(wallet._id)
  }

  return { total, mismatched }
}
