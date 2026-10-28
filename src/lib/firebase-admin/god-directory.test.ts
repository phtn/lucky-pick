import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { FirebaseAdminUserSummary } from './admin-users'
import type { FirebaseCustomClaims } from './custom-claims'
import {
  authorizeManagedClaimChange,
  matchesFirebaseUserSearch,
  normalizeUserSearchQuery,
  readFirebaseCustomClaims
} from './god-directory'

const user = (overrides: Partial<FirebaseAdminUserSummary> = {}): FirebaseAdminUserSummary => ({
  admin: false,
  createdAt: 'Wed, 01 Jan 2025 00:00:00 GMT',
  customClaimNames: [],
  disabled: false,
  displayName: 'Ada Lovelace',
  email: 'ada@example.com',
  emailVerified: true,
  lastSignInAt: null,
  photoUrl: null,
  providerIds: ['google.com'],
  god: false,
  topg: false,
  uid: 'firebase-uid',
  ...overrides
})

const target = (
  overrides: Partial<{
    claims: FirebaseCustomClaims
    email: string | null
    emailVerified: boolean
    uid: string
  }> = {}
) => ({
  claims: {},
  email: 'ada@example.com',
  emailVerified: true,
  uid: 'target-uid',
  ...overrides
})

describe('user search matching', () => {
  test('normalizes queries by trimming and lowercasing', () => {
    assert.equal(normalizeUserSearchQuery('  Ada@Example.COM '), 'ada@example.com')
  })

  test('matches on an email substring', () => {
    assert.equal(matchesFirebaseUserSearch(user(), 'example.com'), true)
    assert.equal(matchesFirebaseUserSearch(user(), 'ada@'), true)
  })

  test('matches on a display-name substring, case-insensitively', () => {
    assert.equal(matchesFirebaseUserSearch(user(), 'lovelace'), true)
  })

  test('matches a uid only on the full value, so partial ids do not leak accounts', () => {
    assert.equal(matchesFirebaseUserSearch(user(), 'firebase-uid'), true)
    assert.equal(matchesFirebaseUserSearch(user(), 'firebase'), false)
  })

  test('never matches on an empty query', () => {
    assert.equal(matchesFirebaseUserSearch(user(), ''), false)
  })

  test('tolerates accounts with no email or display name', () => {
    const anonymous = user({ displayName: null, email: null })
    assert.equal(matchesFirebaseUserSearch(anonymous, 'ada'), false)
    assert.equal(matchesFirebaseUserSearch(anonymous, 'firebase-uid'), true)
  })
})

describe('managed claim change authorization', () => {
  test('lets a topg account grant god', () => {
    const decision = authorizeManagedClaimChange({
      actorClaims: { god: true, topg: true },
      actorUid: 'actor-uid',
      claim: 'god',
      enabled: true,
      target: target()
    })

    assert.deepEqual(decision, { allowed: true })
  })

  test('refuses a god account that is not topg from granting god', () => {
    const decision = authorizeManagedClaimChange({
      actorClaims: { god: true },
      actorUid: 'actor-uid',
      claim: 'god',
      enabled: true,
      target: target()
    })

    assert.equal(decision.allowed, false)
    assert.equal(decision.allowed === false && decision.status, 403)
  })

  test('refuses a god account that is not topg from REVOKING god', () => {
    const decision = authorizeManagedClaimChange({
      actorClaims: { god: true },
      actorUid: 'actor-uid',
      claim: 'god',
      enabled: false,
      target: target({ claims: { god: true } })
    })

    assert.equal(decision.allowed, false)
    assert.equal(decision.allowed === false && decision.status, 403)
  })

  test('refuses an account with no claims at all', () => {
    for (const enabled of [true, false]) {
      assert.equal(
        authorizeManagedClaimChange({
          actorClaims: {},
          actorUid: 'actor-uid',
          claim: 'god',
          enabled,
          target: target()
        }).allowed,
        false
      )
    }
  })

  test('refuses a non-topg actor targeting a topg account, without revealing the target is topg', () => {
    const decision = authorizeManagedClaimChange({
      actorClaims: { god: true },
      actorUid: 'actor-uid',
      claim: 'god',
      enabled: false,
      target: target({ claims: { god: true, topg: true } })
    })

    assert.equal(decision.allowed, false)
    // The top-god check fires first, so the refusal is about the actor's rights
    // and says nothing about the target. The visibility guard behind it is
    // unreachable today and exists only to survive a loosened manage rule.
    assert.equal(decision.allowed === false && decision.status, 403)
  })

  test('refuses a grant to an account with an unverified email', () => {
    const decision = authorizeManagedClaimChange({
      actorClaims: { topg: true },
      actorUid: 'actor-uid',
      claim: 'god',
      enabled: true,
      target: target({ emailVerified: false })
    })

    assert.equal(decision.allowed, false)
    assert.equal(decision.allowed === false && decision.status, 409)
  })

  test('refuses a grant to an account with no email address', () => {
    const decision = authorizeManagedClaimChange({
      actorClaims: { topg: true },
      actorUid: 'actor-uid',
      claim: 'god',
      enabled: true,
      target: target({ email: null })
    })

    assert.equal(decision.allowed, false)
  })

  test('refuses self-revocation so the last god cannot lock themselves out', () => {
    const decision = authorizeManagedClaimChange({
      actorClaims: { god: true, topg: true },
      actorUid: 'actor-uid',
      claim: 'god',
      enabled: false,
      target: target({ claims: { god: true, topg: true }, uid: 'actor-uid' })
    })

    assert.equal(decision.allowed, false)
    assert.equal(decision.allowed === false && decision.status, 409)
  })

  test('refuses self-revocation of admin too, not just god', () => {
    const decision = authorizeManagedClaimChange({
      actorClaims: { admin: true, topg: true },
      actorUid: 'actor-uid',
      claim: 'admin',
      enabled: false,
      target: target({ claims: { admin: true, topg: true }, uid: 'actor-uid' })
    })

    assert.equal(decision.allowed, false)
    assert.equal(decision.allowed === false && decision.status, 409)
  })

  test('refuses self-revocation even for a topg acting on a topg peer record', () => {
    const decision = authorizeManagedClaimChange({
      actorClaims: { topg: true },
      actorUid: 'shared-uid',
      claim: 'god',
      enabled: false,
      target: target({ claims: { topg: true }, uid: 'shared-uid' })
    })

    assert.equal(decision.allowed, false)
  })

  test('still lets an actor grant to themselves, which cannot cause a lock-out', () => {
    const decision = authorizeManagedClaimChange({
      actorClaims: { topg: true },
      actorUid: 'actor-uid',
      claim: 'god',
      enabled: true,
      target: target({ uid: 'actor-uid' })
    })

    assert.deepEqual(decision, { allowed: true })
  })

  test('allows revoking someone else, and does not require a verified email to do it', () => {
    const decision = authorizeManagedClaimChange({
      actorClaims: { topg: true },
      actorUid: 'actor-uid',
      claim: 'god',
      enabled: false,
      target: target({ claims: { god: true }, emailVerified: false, uid: 'other-uid' })
    })

    assert.deepEqual(decision, { allowed: true })
  })

  test('lets a topg revoke a topg peer, since they can see each other', () => {
    const decision = authorizeManagedClaimChange({
      actorClaims: { topg: true },
      actorUid: 'actor-uid',
      claim: 'god',
      enabled: false,
      target: target({ claims: { god: true, topg: true }, uid: 'other-topg-uid' })
    })

    assert.deepEqual(decision, { allowed: true })
  })

  test('gates the admin claim behind topg as well', () => {
    assert.equal(
      authorizeManagedClaimChange({
        actorClaims: { admin: true },
        actorUid: 'actor-uid',
        claim: 'admin',
        enabled: true,
        target: target()
      }).allowed,
      false
    )
  })
})

describe('custom claim reading', () => {
  test('falls back to an empty object for absent or malformed claims', () => {
    assert.deepEqual(readFirebaseCustomClaims(undefined), {})
    assert.deepEqual(readFirebaseCustomClaims({ god: true }), { god: true })
  })
})
