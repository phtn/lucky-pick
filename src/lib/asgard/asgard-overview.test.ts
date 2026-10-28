import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { COMPARISON_DAYS, GROWTH_DAYS, readGovernance, readIntegrity, readLedger } from './asgard-overview'
import type { GodUser } from './gods-users'
import type { LotteryResult, ResultDataset, ResultGameId } from '@/lib/results'

const DAY_MS = 86_400_000

function draw(date: string, overrides: Partial<LotteryResult> = {}): LotteryResult {
  return {
    id: `${date}-${overrides.time ?? 'daily'}`,
    date,
    time: null,
    numbers: [1, 2, 3, 4, 5, 6],
    rawNumbers: null,
    jackpotCents: 100_000,
    winners: 0,
    ...overrides
  }
}

function dataset(game: ResultGameId, records: LotteryResult[], excludedRows = 0): ResultDataset {
  return { version: 1, game, sourceRows: records.length + excludedRows, excludedRows, records }
}

/** `YYYY-MM-DD` for a day offset from `now`, in the local zone the readings use. */
function day(now: number, offset: number) {
  const date = new Date(now - offset * DAY_MS)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

describe('Asgard ledger readings', () => {
  const now = Date.parse('2026-06-15T12:00:00')

  test('counts draws, refused rows and prize pool across every game file', () => {
    const ledger = readLedger(
      [
        dataset('lotto', [draw('2026-06-10'), draw('2026-06-12', { winners: 2 })], 3),
        dataset('mega', [draw('2026-01-02', { numbers: null, jackpotCents: 50_000 })], 1)
      ],
      now
    )

    assert.equal(ledger.total, 3)
    assert.equal(ledger.excluded, 4)
    assert.equal(ledger.coverage, 3 / 7)
    assert.equal(ledger.incomplete, 1)
    assert.equal(ledger.completeRate, 2 / 3)
    assert.equal(ledger.jackpotPesos, 2500)
    assert.equal(ledger.wonDraws, 1)
    assert.equal(ledger.firstDate, '2026-01-02')
    assert.equal(ledger.lastDate, '2026-06-12')
  })

  test('orders games by the results index and drops empty segments', () => {
    const ledger = readLedger([dataset('mega', [draw('2026-06-10')]), dataset('lotto', [draw('2026-06-11')])], now)

    assert.deepEqual(
      ledger.games.map((game) => game.id),
      ['lotto', 'mega']
    )
    assert.deepEqual(
      ledger.gameSegments.map((segment) => segment.key),
      ['lotto', 'mega']
    )
  })

  test('windows recent draws against the prior period and plots a cumulative line', () => {
    const records = [draw(day(now, 1)), draw(day(now, 2)), draw(day(now, COMPARISON_DAYS + 2))]
    const ledger = readLedger([dataset('lotto', records)], now)

    assert.deepEqual(ledger.totals, { current: 2, previous: 1 })
    assert.equal(ledger.growth.length, GROWTH_DAYS)
    assert.equal(ledger.growth[ledger.growth.length - 1].value, 3)
  })

  test('reads an empty ledger without emitting NaN', () => {
    const ledger = readLedger([], now)

    assert.equal(ledger.total, 0)
    assert.equal(ledger.coverage, 0)
    assert.equal(ledger.completeRate, 0)
    assert.equal(ledger.wonRate, 0)
    assert.equal(ledger.firstDate, null)
  })
})

describe('Asgard import report readings', () => {
  test('groups findings by source file, worst first', () => {
    const integrity = readIntegrity([
      { file: 'lotto.csv', line: 1, message: 'Duplicate result.' },
      { file: 'mega.csv', line: 2, message: 'Expected 5 columns, found 6.' },
      { file: 'lotto.csv', line: 3, message: 'Duplicate result.' }
    ])

    assert.equal(integrity.issues, 3)
    assert.deepEqual(integrity.files, [
      { file: 'lotto.csv', issues: 2 },
      { file: 'mega.csv', issues: 1 }
    ])
  })
})

describe('Asgard governance readings', () => {
  const god = (overrides: Partial<GodUser>): GodUser => ({
    admin: false,
    createdAt: 'Wed, 01 Jan 2025 00:00:00 GMT',
    customClaimNames: ['god'],
    disabled: false,
    displayName: null,
    email: null,
    emailVerified: true,
    lastSignInAt: null,
    photoUrl: null,
    providerIds: [],
    god: true,
    topg: false,
    uid: 'uid',
    ...overrides
  })

  test('counts the claim holders and sorts them by last sign-in, most recent first', () => {
    const governance = readGovernance(
      [
        god({ uid: 'quiet' }),
        god({ uid: 'recent', lastSignInAt: 'Thu, 02 Jan 2025 00:00:00 GMT' }),
        god({ uid: 'top', topg: true, emailVerified: false, disabled: true })
      ],
      120,
      true
    )

    assert.equal(governance.gods, 3)
    assert.equal(governance.topGods, 1)
    assert.equal(governance.unverified, 1)
    assert.equal(governance.disabled, 1)
    assert.equal(governance.scanned, 120)
    assert.equal(governance.truncated, true)
    assert.equal(governance.recent[0].uid, 'recent')
  })
})
