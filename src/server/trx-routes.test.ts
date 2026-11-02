import { afterEach, beforeEach, expect, test } from 'bun:test'
import { handleTrxBalance } from './trx-routes'

const HOSTS = ['TRON_TESTNET_FULL_HOST', 'TRON_MAINNET_FULL_HOST'] as const
const VALID = 'TVNtoaanAALqt7w6UPZh55xjFFsJkJr9Zy'

const saved = new Map<string, string | undefined>()

// The bindings are read at call time, and a host left set here would send the
// 503 case at a real node. Every assertion below is meant to settle before any
// request would go out.
beforeEach(() => {
  for (const name of HOSTS) {
    saved.set(name, process.env[name])
    delete process.env[name]
  }
})

afterEach(() => {
  for (const name of HOSTS) {
    const value = saved.get(name)
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

const get = (query: string) => handleTrxBalance(new Request(`https://lucky.test/api/trx/balance${query}`))

test('refuses anything but GET', async () => {
  const response = await handleTrxBalance(
    new Request('https://lucky.test/api/trx/balance', { method: 'POST' })
  )
  expect(response.status).toBe(405)
})

test('refuses an address it cannot verify', async () => {
  expect((await get('')).status).toBe(400)
  expect((await get('?address=')).status).toBe(400)
  expect((await get('?address=nope')).status).toBe(400)
  // Right shape, broken checksum: rejected before any node is asked.
  expect((await get('?address=TVNtoaanAALqt7w6UPZh55xjFFsJkJr9Zx')).status).toBe(400)
})

test('says so when no node is bound rather than guessing a balance', async () => {
  const response = await get(`?address=${VALID}`)
  expect(response.status).toBe(503)
  expect(await response.json()).toEqual({ error: 'TRON is not configured on this deployment.' })
})
