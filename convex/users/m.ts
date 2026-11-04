import type { UserIdentity } from 'convex/server'
import { ConvexError, v } from 'convex/values'
import type { Id } from '../_generated/dataModel'
import { type MutationCtx, mutation } from '../_generated/server'
import { canUseAccount } from '../../src/lib/accounts/accounts'
import { linkAccountsToUser } from '../accounts/contacts'
import { isTronAddressShape, trimOrNull } from '../utils'
import { getUserByTokenIdentifier } from './q'

function identityToUserData(identity: UserIdentity, now: number) {
  const trimOrUndefined = (value: string | undefined) => trimOrNull(value) ?? undefined

  return {
    tokenIdentifier: identity.tokenIdentifier,
    firebaseUid: identity.subject,
    subject: identity.subject,
    issuer: identity.issuer,
    name: trimOrUndefined(identity.name),
    nickname: trimOrNull(identity.nickname),
    preferredUsername: trimOrNull(identity.preferredUsername),
    imageUrl: trimOrUndefined(identity.pictureUrl),
    email: trimOrUndefined(identity.email),
    phone: trimOrNull(identity.phoneNumber),
    emailVerified: identity.emailVerified ?? null,
    createdAt: now,
    updatedAt: now
  }
}

async function upsertCurrentUser(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) {
    throw new ConvexError('Unauthenticated.')
  }

  const existingUser = await getUserByTokenIdentifier(ctx, identity.tokenIdentifier)
  const now = Date.now()
  const userData = identityToUserData(identity, now)

  let userId: Id<'users'>
  if (existingUser) {
    // `createdAt` is the one field a refresh must not move.
    await ctx.db.patch(existingUser._id, { ...userData, createdAt: existingUser.createdAt })
    userId = existingUser._id
  } else {
    userId = await ctx.db.insert('users', userData)
  }

  // Link after the write, from the stored row, so linking sees exactly what a
  // later lookup of this user will.
  const user = await ctx.db.get(userId)
  if (user) await linkAccountsToUser(ctx, user)

  return userId
}

/** Creates or refreshes the signed-in user's row from their verified identity. */
export const ensureCurrent = mutation({
  args: {},
  returns: v.id('users'),
  handler: async (ctx) => {
    return await upsertCurrentUser(ctx)
  }
})

/**
 * Stores the signed-in user's TRON payout address, or clears it when given
 * `null`. Kept off `ensureCurrent`: that one rebuilds the row from the Firebase
 * identity on every refresh, which knows nothing about a TRON address.
 */
export const setTrxAddress = mutation({
  args: { trxAddress: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new ConvexError('Unauthenticated.')
    }

    const user = await getUserByTokenIdentifier(ctx, identity.tokenIdentifier)
    if (!user) {
      throw new ConvexError('No user row yet. Call `users:ensureCurrent` first.')
    }

    const trxAddress = trimOrNull(args.trxAddress)
    if (trxAddress !== null && !isTronAddressShape(trxAddress)) {
      throw new ConvexError('Not a TRON address.')
    }

    // The field is optional, so `undefined` is what removes it — `null` is not a
    // value this column accepts.
    await ctx.db.patch(user._id, { trxAddress: trxAddress ?? undefined, updatedAt: Date.now() })
    return null
  }
})

/**
 * Stores the house the signed-in player has chosen as their banker, or clears
 * it when given `null`. Only a house that can currently take players may be
 * chosen.
 */
export const selectBanker = mutation({
  args: { accountId: v.union(v.id('accounts'), v.null()) },
  returns: v.null(),
  handler: async (ctx, { accountId }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new ConvexError('Unauthenticated.')
    }

    const user = await getUserByTokenIdentifier(ctx, identity.tokenIdentifier)
    if (!user) {
      // Reachable from the picker while the profile row is still being created,
      // so this one is worded for the player rather than for a developer.
      throw new ConvexError('Your profile is still being set up. Try again in a moment.')
    }

    if (accountId !== null) {
      const account = await ctx.db.get('accounts', accountId)
      if (!account) {
        throw new ConvexError('That house is no longer available.')
      }
      if (!canUseAccount(account.status)) {
        throw new ConvexError('That house is not taking players right now.')
      }
    }

    // The field is optional, so `undefined` is what removes it.
    await ctx.db.patch(user._id, { selectedAccountId: accountId ?? undefined, updatedAt: Date.now() })
    return null
  }
})

/**
 * Takes a freshly generated address, but only onto a row that has none, and says
 * whether this address is the one now stored.
 *
 * The caller holds the only copy of the matching private key, which is what
 * makes the refusal the important half: overwriting an address that is already
 * there would strand whatever was sent to it, so a row keeps the first address
 * it was given and a later claim is told `false` rather than merged. That answer
 * is also what tells the caller whether its key is worth showing or worth
 * discarding.
 *
 * A mutation is a transaction, so the read and the write cannot interleave with
 * a second claim — two tabs signing in at once produce one address, not two.
 */
export const claimTrxAddress = mutation({
  args: { trxAddress: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new ConvexError('Unauthenticated.')
    }

    const user = await getUserByTokenIdentifier(ctx, identity.tokenIdentifier)
    if (!user) {
      throw new ConvexError('No user row yet. Call `users:ensureCurrent` first.')
    }

    if (user.trxAddress !== undefined) return false

    const trxAddress = trimOrNull(args.trxAddress)
    if (trxAddress === null || !isTronAddressShape(trxAddress)) {
      throw new ConvexError('Not a TRON address.')
    }

    await ctx.db.patch(user._id, { trxAddress, updatedAt: Date.now() })
    return true
  }
})
