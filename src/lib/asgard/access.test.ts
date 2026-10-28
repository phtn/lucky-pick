import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { canOpenAsgard } from './access'

describe('Asgard visibility', () => {
  test('offers Asgard only to a signed-in account holding the god claim', () => {
    assert.equal(canOpenAsgard(true, { god: true }), true)
  })

  test('hides it from an account without the claim', () => {
    assert.equal(canOpenAsgard(true, {}), false)
    assert.equal(canOpenAsgard(true, { admin: true, topg: true }), false)
  })

  test('refuses a claim that is merely truthy rather than true', () => {
    assert.equal(canOpenAsgard(true, { god: 'yes' }), false)
    assert.equal(canOpenAsgard(true, { god: 1 }), false)
  })

  test('hides it while signed out, whatever claims are left in state', () => {
    assert.equal(canOpenAsgard(false, { god: true }), false)
    assert.equal(canOpenAsgard(false, {}), false)
  })
})
