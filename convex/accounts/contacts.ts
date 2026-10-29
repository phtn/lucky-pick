import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'

// An account is provisioned before its contact has ever signed in, so there is
// nothing to match on but what the platform was told. The caps keep one sign-in
// bounded; a contact address shared by more accounts than this is not expected.
const LINK_LOOKUP_LIMIT = 25

/**
 * Attaches a signed-in user to every account whose primary contact is them and
 * is not yet linked. This is what lets later code authorize a partner by
 * `primaryContact.tokenIdentifier`, so the rules below are the security
 * decision: they decide who may act for an account.
 *
 * 1. A contact naming this user's `firebaseUid` is theirs. A god chose that uid
 *    on purpose, so no email check is needed.
 * 2. Otherwise a contact is claimed by email, but only when the identity
 *    provider has verified the address, and only when the contact is not
 *    reserved for some uid. Without the second guard, whoever signs up with a
 *    verified copy of the address could take an account a god set aside for
 *    someone else.
 *
 * A linked contact is never relinked: both rules require `tokenIdentifier` to
 * still be null. Only the identity fields change; the rest of the contact, and
 * the account, stay as the console left them. Returns the accounts linked.
 */
export async function linkAccountsToUser(ctx: MutationCtx, user: Doc<'users'>): Promise<Id<'accounts'>[]> {
  const linked: Id<'accounts'>[] = []
  const seen = new Set<Id<'accounts'>>()

  const link = async (account: Doc<'accounts'>) => {
    seen.add(account._id)
    await ctx.db.patch(account._id, {
      primaryContact: {
        ...account.primaryContact,
        tokenIdentifier: user.tokenIdentifier,
        firebaseUid: user.firebaseUid,
        userId: user._id,
        emailVerified: user.emailVerified
      }
    })
    linked.push(account._id)
  }

  const byUid = await ctx.db
    .query('accounts')
    .withIndex('by_primaryContact_firebaseUid', (q) => q.eq('primaryContact.firebaseUid', user.firebaseUid))
    .take(LINK_LOOKUP_LIMIT)

  for (const account of byUid) {
    if (account.primaryContact.tokenIdentifier === null) await link(account)
  }

  if (user.emailVerified === true && user.email) {
    const email = user.email.toLowerCase()
    const byEmail = await ctx.db
      .query('accounts')
      .withIndex('by_primaryContact_email', (q) => q.eq('primaryContact.email', email))
      .take(LINK_LOOKUP_LIMIT)

    for (const account of byEmail) {
      const contact = account.primaryContact
      if (!seen.has(account._id) && contact.tokenIdentifier === null && contact.firebaseUid === null) {
        await link(account)
      }
    }
  }

  return linked
}
