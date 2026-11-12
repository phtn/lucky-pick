import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { adminPlayerPath, adminPlayersPath } from './console-paths'

describe('Admin console paths', () => {
  test('hang off /admin on the main origin', () => {
    assert.equal(adminPlayersPath('localhost'), '/admin/players')
    assert.equal(adminPlayerPath('localhost', 'acc1', 'usr1'), '/admin/players/acc1/usr1')
  })

  test('hang off the root on the admin subdomain', () => {
    assert.equal(adminPlayersPath('admin.example.com'), '/players')
    assert.equal(adminPlayerPath('admin.example.com', 'acc1', 'usr1'), '/players/acc1/usr1')
  })
})
