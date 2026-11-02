import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { toSubscriptionKey } from './subscription-key'

describe('toSubscriptionKey', () => {
  test('two argument objects differing only in key order share a key', () => {
    assert.equal(toSubscriptionKey({ a: 1, b: 2 }), toSubscriptionKey({ b: 2, a: 1 }))
  })

  test('a changed value changes the key', () => {
    assert.notEqual(toSubscriptionKey({ a: 1 }), toSubscriptionKey({ a: 2 }))
  })

  test('an empty object has a stable key', () => {
    assert.equal(toSubscriptionKey({}), toSubscriptionKey({}))
  })
})
