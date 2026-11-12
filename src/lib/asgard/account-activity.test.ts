import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { buildAccountActivity } from './account-activity'
import type { AccountRow, AccountTopup } from './accounts'

const account = (id: string, extra: Partial<AccountRow> = {}) =>
  ({
    _id: id,
    name: `House ${id}`,
    slug: `house-${id}`,
    createdAt: 100,
    initialCredits: 0,
    closedAt: null,
    closeReason: null,
    ...extra
  }) as unknown as AccountRow

const topup = (id: string, accountId: string, extra: Partial<AccountTopup> = {}) =>
  ({
    _id: id,
    accountId,
    amount: 5_000,
    status: 'pending',
    paymentReference: 'GCASH-1',
    note: null,
    decisionNote: null,
    decidedAt: null,
    createdAt: 200,
    ...extra
  }) as unknown as AccountTopup

describe('buildAccountActivity', () => {
  test('lists an account’s creation, confirmation and closing, newest first', () => {
    const { events } = buildAccountActivity(
      [account('a', { confirmedAt: 300, closedAt: 400, closeReason: 'Left' } as Partial<AccountRow>)],
      []
    )

    assert.deepEqual(
      events.map((event) => [event.kind, event.at, event.detail]),
      [
        ['account-closed', 400, 'Left'],
        ['account-confirmed', 300, null],
        ['account-created', 100, null]
      ]
    )
  })

  test('carries the opening grant on the creation event only when there was one', () => {
    const { events } = buildAccountActivity([account('a', { initialCredits: 50_000 }), account('b')], [])
    assert.deepEqual(
      events.map((event) => event.amount),
      [50_000, null]
    )
  })

  test('a pending top-up is filed and waiting, with no decision event', () => {
    const { events, pending } = buildAccountActivity([account('a')], [topup('t1', 'a')])

    assert.deepEqual(
      events.map((event) => event.kind),
      ['topup-filed', 'account-created']
    )
    assert.deepEqual(pending, [
      { id: 't1', at: 200, accountName: 'House a', accountSlug: 'house-a', amount: 5_000, reference: 'GCASH-1' }
    ])
  })

  test('a decided top-up adds its decision at the time it was decided', () => {
    const { events, pending } = buildAccountActivity(
      [account('a')],
      [topup('t1', 'a', { status: 'rejected', decidedAt: 500, decisionNote: 'No such payment' })]
    )

    assert.equal(pending.length, 0)
    assert.deepEqual(
      events.slice(0, 2).map((event) => [event.kind, event.at, event.detail]),
      [
        ['topup-rejected', 500, 'No such payment'],
        ['topup-filed', 200, 'GCASH-1']
      ]
    )
  })

  test('waiting requests are ordered oldest first', () => {
    const { pending } = buildAccountActivity(
      [account('a')],
      [topup('new', 'a', { createdAt: 900 }), topup('old', 'a', { createdAt: 150 })]
    )
    assert.deepEqual(
      pending.map((request) => request.id),
      ['old', 'new']
    )
  })

  test('a top-up whose account is off the roster still shows, without a link', () => {
    const { events } = buildAccountActivity([], [topup('t1', 'gone')])
    assert.equal(events[0]?.accountName, 'Unknown account')
    assert.equal(events[0]?.accountSlug, null)
  })

  test('a change to the approval rule shows who made it, against all accounts', () => {
    const { events } = buildAccountActivity(
      [account('a')],
      [],
      [
        { _id: 'c1', requireSecondGod: false, actorLabel: 'top@example.com', createdAt: 700 },
        { _id: 'c2', requireSecondGod: true, actorLabel: 'top@example.com', createdAt: 800 }
      ] as never
    )

    assert.deepEqual(
      events.slice(0, 2).map((event) => [event.kind, event.accountName, event.accountSlug, event.detail]),
      [
        ['rule-on', 'All accounts', null, 'top@example.com'],
        ['rule-off', 'All accounts', null, 'top@example.com']
      ]
    )
  })
})
