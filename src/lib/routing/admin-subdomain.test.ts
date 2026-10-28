import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { buildAdminHandoffUrl, resolveAdminNavigationPath, toAdminSubdomainHostname } from './admin-subdomain'

describe('admin routing', () => {
  test('targets the root admin subdomain from another application subdomain', () => {
    assert.equal(toAdminSubdomainHostname('asgard.luckypick.com'), 'admin.luckypick.com')
    assert.equal(toAdminSubdomainHostname('aris.localhost'), 'admin.localhost')
  })

  test('builds external links on the admin subdomain and internal links on same-origin admin', () => {
    assert.equal(resolveAdminNavigationPath('/configs', '/users'), '/configs')
    assert.equal(resolveAdminNavigationPath('/configs', '/admin/users'), '/admin/configs')
    assert.equal(resolveAdminNavigationPath('/', '/admin/users'), '/admin')
  })

  test('builds a cross-subdomain handoff URL with the canonical admin destination', () => {
    const handoffUrl = buildAdminHandoffUrl(new URL('http://aris.localhost:3000/c'), 'firebase-token')
    const hash = new URLSearchParams(handoffUrl.hash.slice(1))

    assert.equal(handoffUrl.origin, 'http://admin.localhost:3000')
    assert.equal(handoffUrl.pathname, '/admin-handoff')
    assert.equal(hash.get('idToken'), 'firebase-token')
    assert.equal(hash.get('redirectTo'), '/admin-overview')
  })

  test('uses the primary origin for admin handoff when admin subdomains are unsupported', () => {
    const handoffUrl = buildAdminHandoffUrl(new URL('https://luckypick.com/'), 'firebase-token')
    const hash = new URLSearchParams(handoffUrl.hash.slice(1))

    assert.equal(handoffUrl.origin, 'https://admin.luckypick.com')
    assert.equal(handoffUrl.pathname, '/admin-handoff')
    assert.equal(hash.get('redirectTo'), '/admin-overview')
  })
})
