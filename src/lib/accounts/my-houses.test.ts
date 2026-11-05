import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { AccountStatus } from './accounts'
import { toMyHouseItems, type MyHouseRow } from './my-houses'

const row = (name: string, status: AccountStatus = 'confirmed', extra: Partial<MyHouseRow> = {}): MyHouseRow => ({
  accountId: `id-${name}`,
  slug: name.toLowerCase(),
  name,
  status,
  confirmedAt: status === 'pending' ? null : 1,
  ...extra
})

describe('toMyHouseItems', () => {
  test('marks only pending rows confirmable', () => {
    const statuses: AccountStatus[] = ['pending', 'confirmed', 'active', 'suspended', 'closed']
    const items = toMyHouseItems(statuses.map((s) => row(s, s)))
    const confirmable = Object.fromEntries(items.map((i) => [i.status, i.canConfirm]))
    assert.deepEqual(confirmable, {
      pending: true,
      confirmed: false,
      active: false,
      suspended: false,
      closed: false
    })
  })

  test('labels a pending row "Waiting for you to confirm"', () => {
    const [item] = toMyHouseItems([row('Alpha', 'pending')])
    assert.equal(item.detail, 'Waiting for you to confirm')
  })

  test('labels non-pending rows with their status label', () => {
    const items = toMyHouseItems([row('Alpha', 'suspended'), row('Bravo', 'closed')])
    assert.deepEqual(
      items.map((i) => i.detail),
      ['Suspended', 'Closed']
    )
  })

  test('puts pending houses first, then alphabetical within each group', () => {
    const items = toMyHouseItems([
      row('Alpha', 'confirmed'),
      row('Zulu', 'pending'),
      row('Charlie', 'active'),
      row('Mike', 'pending')
    ])
    assert.deepEqual(
      items.map((i) => i.name),
      ['Mike', 'Zulu', 'Alpha', 'Charlie']
    )
  })

  test('breaks a name tie by slug', () => {
    const a = row('Same', 'confirmed', { accountId: 'a', slug: 'a-house' })
    const b = row('Same', 'confirmed', { accountId: 'b', slug: 'b-house' })
    assert.deepEqual(
      toMyHouseItems([b, a]).map((i) => i.id),
      ['a', 'b']
    )
  })

  test('returns an empty array for no rows', () => {
    assert.deepEqual(toMyHouseItems([]), [])
  })

  test('handles mixed statuses in one list', () => {
    const rows = [row('Bravo', 'suspended'), row('Alpha', 'confirmed'), row('Charlie', 'pending')]
    const items = toMyHouseItems(rows)
    assert.deepEqual(
      items.map((i) => [i.id, i.canConfirm, i.detail]),
      [
        ['id-Charlie', true, 'Waiting for you to confirm'],
        ['id-Alpha', false, 'Confirmed'],
        ['id-Bravo', false, 'Suspended']
      ]
    )
    assert.deepEqual(
      rows.map((r) => r.name),
      ['Bravo', 'Alpha', 'Charlie']
    )
  })
})
