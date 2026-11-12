import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { canOpenAdmin } from './access'

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
