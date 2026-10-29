import type { UserIdentity } from 'convex/server'
import { ConvexError, v } from 'convex/values'
import type { Id } from '../_generated/dataModel'
import { type MutationCtx, mutation } from '../_generated/server'
import { linkAccountsToUser } from '../accounts/contacts'
import { trimOrNull } from '../utils'
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
