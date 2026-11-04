import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { formatAccountCredits, type AccountStatus } from './accounts'
import {
  compareBankerRows,
  describeBankerStatus,
  resolveSelectedBanker,
  toBankerItems,
  type BankerRow
} from './bankers'

const row = (name: string, status: AccountStatus = 'active', extra: Partial<BankerRow> = {}): BankerRow => ({
  accountId: `id-${name}`,
  slug: name.toLowerCase(),
  name,
  status,
  balance: 0,
  ...extra
})

describe('compareBankerRows', () => {
  test('puts usable houses before unusable ones', () => {
    const sorted = [row('Alpha', 'suspended'), row('Zulu', 'active'), row('Beta', 'pending')].sort(compareBankerRows)
    assert.deepEqual(
      sorted.map((r) => r.name),
      ['Zulu', 'Alpha', 'Beta']
    )
  })

  test('sorts alphabetically within a group', () => {
    const sorted = [row('Charlie', 'confirmed'), row('Alpha', 'active'), row('Bravo')].sort(compareBankerRows)
    assert.deepEqual(
      sorted.map((r) => r.name),
      ['Alpha', 'Bravo', 'Charlie']
    )
  })

  test('breaks a name tie by slug', () => {
    const a = row('Same', 'active', { slug: 'a-house' })
    const b = row('Same', 'active', { slug: 'b-house' })
    assert.ok(compareBankerRows(a, b) < 0)
    assert.ok(compareBankerRows(b, a) > 0)
    assert.deepEqual([b, a].sort(compareBankerRows), [a, b])
  })
})

describe('describeBankerStatus', () => {
  test('returns null for confirmed and active', () => {
    assert.equal(describeBankerStatus('confirmed'), null)
    assert.equal(describeBankerStatus('active'), null)
  })

  test('maps pending and suspended', () => {
    assert.equal(describeBankerStatus('pending'), 'Not yet open')
    assert.equal(describeBankerStatus('suspended'), 'Temporarily off')
  })
})

describe('toBankerItems', () => {
  test('disables pending and suspended rows', () => {
    const items = toBankerItems([row('A', 'pending'), row('B', 'suspended')])
    assert.deepEqual(
      items.map((i) => i.disabled),
      [true, true]
    )
    assert.deepEqual(
      items.map((i) => i.description),
      ['Not yet open', 'Temporarily off']
    )
  })

  test('leaves confirmed and active rows enabled', () => {
    const items = toBankerItems([row('A', 'confirmed'), row('B', 'active')])
    assert.deepEqual(
      items.map((i) => i.disabled),
      [false, false]
    )
    assert.deepEqual(
      items.map((i) => i.description),
      [undefined, undefined]
    )
  })

  test('shows the balance as meta via formatAccountCredits', () => {
    const [item] = toBankerItems([row('A', 'active', { balance: 250_000 })])
    assert.equal(item?.meta, formatAccountCredits(250_000))
    assert.equal(item?.meta, '250K')
    assert.equal(item?.id, 'id-A')
    assert.equal(item?.label, 'A')
    assert.equal(item?.icon, 'cash')
  })
})

describe('resolveSelectedBanker', () => {
  test('returns null for undefined, null, and an id not in the roster', () => {
    const rows = [row('A')]
    assert.equal(resolveSelectedBanker(rows, undefined), null)
    assert.equal(resolveSelectedBanker(rows, null), null)
    assert.equal(resolveSelectedBanker(rows, 'missing'), null)
  })

  test('returns a suspended row that is still in the roster', () => {
    const suspended = row('A', 'suspended')
    assert.equal(resolveSelectedBanker([suspended], suspended.accountId), suspended)
  })
})
