import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { isAppPagePath } from './app-pages'

describe('app page paths', () => {
  test('recognizes the pages that replace the game grid', () => {
    assert.equal(isAppPagePath('/me'), true)
    assert.equal(isAppPagePath('/analytics'), true)
    assert.equal(isAppPagePath('/trx'), true)
    assert.equal(isAppPagePath('/me/'), true)
    assert.equal(isAppPagePath('/trx/'), true)
    assert.equal(isAppPagePath('/tickets/'), true)
  })

  test('leaves the game and the consoles alone', () => {
    assert.equal(isAppPagePath('/'), false)
    assert.equal(isAppPagePath('/admin'), false)
    assert.equal(isAppPagePath('/asgard'), false)
    assert.equal(isAppPagePath('/mexico'), false)
  })
})
