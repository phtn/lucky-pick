import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { canOpenAdmin, readAdminGate } from './access'

describe('Admin console visibility', () => {
  test('offers it to the contact of a confirmed or active house', () => {
    assert.equal(canOpenAdmin(true, {}, [{ status: 'active' }]), true)
    assert.equal(canOpenAdmin(true, {}, [{ status: 'confirmed' }]), true)
    assert.equal(canOpenAdmin(true, {}, [{ status: 'closed' }, { status: 'active' }]), true)
  })

  test('hides it when every house is pending, suspended or closed', () => {
    assert.equal(canOpenAdmin(true, {}, [{ status: 'pending' }, { status: 'suspended' }, { status: 'closed' }]), false)
  })

  test('hides it from someone who fronts no house, and before the houses have been read', () => {
    assert.equal(canOpenAdmin(true, {}, []), false)
    assert.equal(canOpenAdmin(true, {}, undefined), false)
  })

  test('offers it to the admin claim with no house at all', () => {
    assert.equal(canOpenAdmin(true, { admin: true }, undefined), true)
    assert.equal(canOpenAdmin(true, { admin: 'yes' }, []), false)
  })

  test('hides it while signed out, whatever is left in state', () => {
    assert.equal(canOpenAdmin(false, { admin: true }, [{ status: 'active' }]), false)
  })
})

describe('Admin console gate', () => {
  const session = { isAuthLoading: false, isSignedIn: true, claims: {}, houses: undefined, canReadHouses: true }

  test('waits for the session and for the houses before judging', () => {
    assert.equal(readAdminGate({ ...session, isAuthLoading: true, isSignedIn: false }), 'loading')
    assert.equal(readAdminGate(session), 'loading')
  })

  test('opens for a banker and for the admin claim', () => {
    assert.equal(readAdminGate({ ...session, houses: [{ status: 'active' }] }), 'open')
    // An administrator does not wait on houses they may not have.
    assert.equal(readAdminGate({ ...session, claims: { admin: true } }), 'open')
    assert.equal(readAdminGate({ ...session, claims: { admin: true }, canReadHouses: false }), 'open')
  })

  test('refuses a signed-out visitor, and an account that fronts no usable house', () => {
    assert.equal(readAdminGate({ ...session, isSignedIn: false, claims: { admin: true }, houses: [{ status: 'active' }] }), 'signed-out')
    assert.equal(readAdminGate({ ...session, houses: [] }), 'denied')
    assert.equal(readAdminGate({ ...session, houses: [{ status: 'pending' }, { status: 'suspended' }] }), 'denied')
    assert.equal(readAdminGate({ ...session, claims: { god: true }, houses: [] }), 'denied')
  })

  test('says the console cannot answer where there is no backend to read houses from', () => {
    assert.equal(readAdminGate({ ...session, canReadHouses: false }), 'unavailable')
  })
})
