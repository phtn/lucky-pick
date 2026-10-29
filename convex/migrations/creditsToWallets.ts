import { v } from 'convex/values'
import { internal } from '../_generated/api'
import { internalMutation } from '../_generated/server'
import { post } from '../ledger/post'
import { getPartnerWallets, getSystemWallet } from '../ledger/wallets'

/**
 * One-shot move of the pre-ledger `credits` balances into partner float. Each
 * positive balance becomes a `migration` posting out of issuance, so the
 * ledger still sums to zero, and its row is then deleted. Every row is deleted
 * once handled, which is what lets the next batch simply take the first rows
 * left, and what makes a re-run a no-op. The idempotency key backs that up
 * should a row ever be seen twice.
 */

const BATCH_SIZE = 100
const ACTOR = 'system:migration'

export const run = internalMutation({
  args: {},
  returns: v.object({ migrated: v.number(), done: v.boolean() }),
  handler: async (ctx) => {
    const rows = await ctx.db.query('credits').take(BATCH_SIZE)
    if (rows.length === 0) return { migrated: 0, done: true }

    const issuance = await getSystemWallet(ctx, 'issuance')
    let migrated = 0
    let orphans = 0

    for (const row of rows) {
      // Legacy accounts may have been removed while their credits were left behind.
      const account = await ctx.db.get('accounts', row.accountId)
      if (!account) {
        orphans++
      } else if (row.balance > 0) {
        const { float } = await getPartnerWallets(ctx, row.accountId)
        await post(ctx, {
          kind: 'migration',
          idempotencyKey: `migration:credits:${row._id}`,
          actorTokenIdentifier: ACTOR,
          accountId: row.accountId,
          ref: { type: 'migration', id: row._id },
          memo: `credits.${row.lastReason}`,
          legs: [
            { walletId: issuance._id, bucket: 'available', amount: -row.balance },
            { walletId: float._id, bucket: 'available', amount: row.balance }
          ]
        })
        migrated++
      }
      await ctx.db.delete('credits', row._id)
    }

    if (orphans > 0) {
      console.warn(`credits migration: deleted ${orphans} credits rows whose account no longer exists`)
    }

    // A full batch may be followed by more rows; a short one has drained the table.
    const done = rows.length < BATCH_SIZE
    if (!done) await ctx.scheduler.runAfter(0, internal.migrations.creditsToWallets.run, {})
    return { migrated, done }
  }
})
