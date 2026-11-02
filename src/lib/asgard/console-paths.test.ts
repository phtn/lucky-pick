import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { asgardAccountPath, asgardAccountsPath, asgardConsoleBase, asgardConsolePath } from './console-paths'

describe('Asgard console base', () => {
  test('roots the console at / on its own subdomain', () => {
    assert.equal(asgardConsoleBase('asgard.luckypick.com'), '')
    assert.equal(asgardConsoleBase('asgard.localhost'), '')
  })

  test('roots the console under the handoff path on an origin standing in for one', () => {
    assert.equal(asgardConsoleBase('lucky-pick.phtn458.workers.dev'), '/asgard')
    assert.equal(asgardConsoleBase('127.0.0.1'), '/asgard')
  })
})

describe('Asgard console paths', () => {
  test('gives the console root a path a link can use', () => {
    // The nav's Overview item is the base itself, which is empty on the
    // subdomain; a link needs `/` rather than an empty href.
    assert.equal(asgardConsolePath('asgard.luckypick.com', ''), '/')
    assert.equal(asgardConsolePath('lucky-pick.phtn458.workers.dev', ''), '/asgard')
  })

  test('builds the roster path for either host', () => {
    assert.equal(asgardAccountsPath('asgard.luckypick.com'), '/accounts')
    assert.equal(asgardAccountsPath('lucky-pick.phtn458.workers.dev'), '/asgard/accounts')
  })

  test('builds one account page path for either host', () => {
    assert.equal(asgardAccountPath('asgard.luckypick.com', 'ana-store'), '/accounts/ana-store')
    assert.equal(asgardAccountPath('127.0.0.1', 'ana-store'), '/asgard/accounts/ana-store')
  })
})
