import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { buildAsgardHandoffUrl, isAsgardConsoleHostname, isAsgardSubdomainHostname, supportsAsgardSubdomain } from './asgard-subdomain'

describe('Asgard routing', () => {
  test('lands on the Asgard root with the ID token in the fragment', () => {
    const handoffUrl = buildAsgardHandoffUrl(new URL('https://luckypick.com/asgard'), 'firebase-token')
    const hash = new URLSearchParams(handoffUrl.hash.slice(1))

    assert.equal(handoffUrl.origin, 'https://asgard.luckypick.com')
    assert.equal(handoffUrl.pathname, '/')
    assert.equal(hash.get('idToken'), 'firebase-token')
  })

  test('keeps the console on the handoff path where a subdomain is unsupported', () => {
    const handoffUrl = buildAsgardHandoffUrl(new URL('http://127.0.0.1:3000/asgard'), 'firebase-token')

    assert.equal(handoffUrl.origin, 'http://127.0.0.1:3000')
    assert.equal(handoffUrl.pathname, '/asgard')
  })

  test('recognizes only the asgard subdomain', () => {
    assert.equal(isAsgardSubdomainHostname('asgard.luckypick.com'), true)
    assert.equal(isAsgardSubdomainHostname('asgard.localhost'), true)
    assert.equal(isAsgardSubdomainHostname('admin.luckypick.com'), false)
  })
})

describe('Asgard subdomain support', () => {
  test('refuses a subdomain where the TLS wildcard cannot reach it', () => {
    assert.equal(supportsAsgardSubdomain('lucky-pick.phtn458.workers.dev'), false)
    assert.equal(supportsAsgardSubdomain('127.0.0.1'), false)
    assert.equal(supportsAsgardSubdomain('luckypick.com'), true)
  })

  test('keeps the console on the origin it is already on when it has no subdomain', () => {
    const handoffUrl = buildAsgardHandoffUrl(new URL('https://lucky-pick.phtn458.workers.dev/asgard'), 'firebase-token')

    assert.equal(handoffUrl.origin, 'https://lucky-pick.phtn458.workers.dev')
    assert.equal(handoffUrl.pathname, '/asgard')
  })

  test('treats a stand-in origin as the console host, alongside the real subdomain', () => {
    assert.equal(isAsgardConsoleHostname('asgard.luckypick.com'), true)
    assert.equal(isAsgardConsoleHostname('lucky-pick.phtn458.workers.dev'), true)
    assert.equal(isAsgardConsoleHostname('luckypick.com'), false)
  })
})
