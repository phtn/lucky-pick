import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { asgardAccountEndpoint, readAsgardAccountRoute } from './account-api'

describe('Asgard account endpoints', () => {
  test('addresses one account under the roster endpoint', () => {
    assert.equal(asgardAccountEndpoint('ana-store'), '/api/asgard/accounts/ana-store')
  })
})

describe('Reading an Asgard accounts request path', () => {
  test('reads the roster, with or without a trailing slash', () => {
    assert.deepEqual(readAsgardAccountRoute('/api/asgard/accounts'), { kind: 'roster' })
    assert.deepEqual(readAsgardAccountRoute('/api/asgard/accounts/'), { kind: 'roster' })
  })

  test('reads one account from its slug', () => {
    assert.deepEqual(readAsgardAccountRoute('/api/asgard/accounts/ana-store'), {
      kind: 'account',
      slug: 'ana-store'
    })
  })

  test('refuses a segment that is not an account slug, so Convex is never asked', () => {
    assert.deepEqual(readAsgardAccountRoute('/api/asgard/accounts/Ana_Store'), { kind: 'unknown' })
    assert.deepEqual(readAsgardAccountRoute('/api/asgard/accounts/ana store'), { kind: 'unknown' })
  })

  test('refuses a deeper path, which this endpoint does not serve', () => {
    assert.deepEqual(readAsgardAccountRoute('/api/asgard/accounts/ana-store/entries'), { kind: 'unknown' })
  })

  test('refuses a path outside the accounts endpoint', () => {
    assert.deepEqual(readAsgardAccountRoute('/api/asgard/users'), { kind: 'unknown' })
  })
})
