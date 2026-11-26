import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { countUnread, toNotificationItems, type NotificationKind, type NotificationRow } from './notifications'

const row = (kind: NotificationKind, extra: Partial<NotificationRow> = {}): NotificationRow => ({
  notificationId: `n-${kind}`,
  kind,
  accountId: 'acc-1',
  accountName: 'Lucky Hall',
  amount: null,
  readAt: null,
  createdAt: 1,
  ...extra
})

const only = (r: NotificationRow) => toNotificationItems([r])[0]

describe('toNotificationItems', () => {
  test('renders a title and detail for each of the seven kinds', () => {
    const awaiting = only(row('house-awaiting-confirmation'))
    assert.deepEqual([awaiting.title, awaiting.detail], [
      'Lucky Hall is waiting for you to confirm',
      'You were named as its contact.'
    ])
    const suspended = only(row('house-suspended'))
    assert.deepEqual([suspended.title, suspended.detail], [
      'Lucky Hall was suspended',
      'You cannot play against it until it is active again.'
    ])
    const closed = only(row('house-closed'))
    assert.deepEqual([closed.title, closed.detail], ['Lucky Hall was closed', null])
    const activated = only(row('house-activated'))
    assert.deepEqual([activated.title, activated.detail], ['Lucky Hall is active', 'Players can choose it again.'])
    const approved = only(row('topup-approved', { amount: 2_000_000 }))
    assert.deepEqual([approved.title, approved.detail], ['Top-up approved for Lucky Hall', '2M CR is ready to claim.'])
    const rejected = only(row('topup-rejected'))
    assert.deepEqual([rejected.title, rejected.detail], ['Top-up rejected for Lucky Hall', 'No credits were added.'])
    const reversed = only(row('transaction-reversed'))
    assert.deepEqual([reversed.title, reversed.detail], [
      'A transaction on Lucky Hall was reversed',
      'Check the ledger for the correction.'
    ])
  })

  test('a ticket win names the amount, the game and the draw, and links to the tickets', () => {
    const one = only(row('ticket-won', { amount: 900, draw: { game: '6/42', drawDate: '2026-11-17', tickets: 1 } }))
    assert.deepEqual([one.title, one.detail, one.href], [
      `You won ${(900).toLocaleString()} CR at Lucky Hall`,
      'Your Lotto 6/42 ticket won in the Nov 17 draw.',
      '/tickets'
    ])
    const many = only(row('ticket-won', { amount: 5_000, draw: { game: '6/55', drawDate: '2026-12-01', tickets: 3 } }))
    assert.deepEqual([many.title, many.detail], ['You won 5K CR at Lucky Hall', '3 Grand Lotto 6/55 tickets won in the Dec 1 draw.'])
    // An older row with no draw still reads sensibly.
    assert.deepEqual([only(row('ticket-won', { amount: null })).title, only(row('ticket-won')).detail], ['You won at Lucky Hall', null])
  })

  test('interpolates the account name', () => {
    assert.equal(only(row('house-closed', { accountName: 'Zed' })).title, 'Zed was closed')
  })

  test('formats the amount with formatAccountCredits', () => {
    assert.equal(only(row('topup-approved', { amount: 500_000 })).detail, '500K CR is ready to claim.')
    assert.equal(only(row('topup-approved', { amount: 1_234 })).detail, `${(1_234).toLocaleString()} CR is ready to claim.`)
  })

  test('omits the detail of an approved top-up with no amount rather than claiming 0 CR', () => {
    assert.equal(only(row('topup-approved', { amount: null })).detail, null)
  })

  test('links house kinds and a claimable top-up to /me and leaves the rest null', () => {
    const kinds: NotificationKind[] = [
      'house-awaiting-confirmation',
      'house-suspended',
      'house-closed',
      'house-activated',
      'topup-approved',
      'topup-rejected',
      'transaction-reversed'
    ]
    assert.deepEqual(Object.fromEntries(kinds.map((k) => [k, only(row(k)).href])), {
      'house-awaiting-confirmation': '/me',
      'house-suspended': '/me',
      'house-closed': '/me',
      'house-activated': '/me',
      'topup-approved': '/me',
      'topup-rejected': null,
      'transaction-reversed': null
    })
  })

  test('marks a row with a null readAt as unread', () => {
    assert.equal(only(row('house-closed', { readAt: null })).isUnread, true)
    assert.equal(only(row('house-closed', { readAt: 5 })).isUnread, false)
  })

  test('preserves the query order and uses notificationId as id', () => {
    const items = toNotificationItems([
      row('house-closed', { notificationId: 'b', createdAt: 1 }),
      row('house-closed', { notificationId: 'a', createdAt: 9 })
    ])
    assert.deepEqual(
      items.map((i) => i.id),
      ['b', 'a']
    )
  })
})

describe('countUnread', () => {
  test('counts only rows with a null readAt', () => {
    assert.equal(countUnread([row('house-closed'), row('house-closed', { readAt: 3 }), row('topup-rejected')]), 2)
  })

  test('returns 0 for an empty list', () => {
    assert.equal(countUnread([]), 0)
  })
})

describe('unknown kinds', () => {
  test('renders a plain, non-clickable row for a kind this bundle does not know', () => {
    const item = only(row('mystery-kind' as NotificationKind))
    assert.equal(item.title, 'Something happened')
    assert.equal(item.detail, null)
    assert.equal(item.href, null)
    assert.equal(item.isUnread, true)
  })
})
