import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { GameId } from '../games'
import { sum } from '../overview/metrics'
import type { PracticePlayRow, PracticeTicketDetail } from './record'
import { readPracticeStats } from './stats'

const detail = (hits: number, prize = 0): PracticeTicketDetail => ({
  numbers: [1, 2, 3, 4, 5, 6],
  betType: 6,
  cost: 25,
  hits,
  prize,
  playerName: ''
})

// One stored draw. The aggregates are passed in explicitly so a test can make
// them disagree with the (capped) detail list, as they do in real data.
const row = (id: string, game: GameId, over: Partial<PracticePlayRow> = {}): PracticePlayRow => ({
  _id: id,
  _creationTime: 1,
  game,
  mode: 'solo',
  isOfficial: false,
  drawnBalls: [3, 9, 14, 21, 30, 41],
  seed: null,
  ticketCount: 0,
  spent: 0,
  won: 0,
  winCount: 0,
  bestHits: 0,
  tickets: [],
  drawnAt: 1,
  ...over
})

// Three draws. Two are 6/45 and one of those is a PCSO draw checked against the
// player's own numbers. Draw 'a' played 60 tickets but its detail keeps only 3
// (the stored detail is capped), so the aggregates cover 65 tickets with 4
// winners while the detail lists 8 tickets with 2 winners. The two views give
// different rates (4/65 against 2/8), which is what lets a test tell them apart.
const rows: PracticePlayRow[] = [
  row('a', '6/45', {
    ticketCount: 60,
    spent: 100,
    won: 1000,
    winCount: 3,
    bestHits: 5,
    tickets: [detail(5, 1000), detail(1), detail(0)]
  }),
  row('b', '6/45', {
    isOfficial: true,
    ticketCount: 3,
    spent: 100,
    won: 200,
    winCount: 1,
    bestHits: 3,
    tickets: [detail(3, 200), detail(2), detail(2)]
  }),
  row('c', '6/42', {
    ticketCount: 2,
    spent: 100,
    bestHits: 1,
    tickets: [detail(1), detail(0)]
  })
]

describe('readPracticeStats', () => {
  test('reads zeroes, not NaN, from no rows', () => {
    const stats = readPracticeStats([])

    assert.deepEqual(stats.plays === 0 && stats.winRate === 0 && stats.net === 0, true)
    assert.equal(stats.bestDraw, null)
    assert.equal(stats.favouriteGame, null)
  })

  test('totals spend, winnings and net across rows', () => {
    const stats = readPracticeStats(rows)

    assert.equal(stats.plays, 3)
    assert.equal(stats.spent, 300)
    assert.equal(stats.won, 1200)
    assert.equal(stats.net, 900)
  })

  test('win rate is winning tickets over tickets played', () => {
    // 4 wins of 65 tickets from the aggregates; the capped detail alone would say 2 of 8.
    assert.equal(readPracticeStats(rows).winRate, 4 / 65)
  })

  test('counts official and simulated plays apart', () => {
    const stats = readPracticeStats(rows)

    assert.equal(stats.officialPlays, 1)
    assert.equal(stats.simulatedPlays, 2)
  })

  test('keeps the official rows\' own spend, winnings and winners', () => {
    // Row 'b' is the only PCSO check: ₱100 staked, ₱200 paid, 1 winning ticket.
    // The pooled totals (300 / 1200) are dominated by the simulated draws, so
    // the official figures have to be readable apart from them.
    const stats = readPracticeStats(rows)

    assert.equal(stats.officialSpent, 100)
    assert.equal(stats.officialWon, 200)
    assert.equal(stats.officialWinCount, 1)
  })

  test('reads the official figures as zero when no draw was checked', () => {
    const simulated = readPracticeStats(rows.filter((play) => !play.isOfficial))

    assert.equal(simulated.officialPlays, 0)
    assert.deepEqual(
      [simulated.officialSpent, simulated.officialWon, simulated.officialWinCount],
      [0, 0, 0]
    )
    assert.deepEqual(readPracticeStats([]).officialSpent, 0)
  })

  test('hit distribution sums to the tickets it describes', () => {
    // The 8 tickets kept in the detail, not the 65 the aggregates count.
    assert.equal(sum(readPracticeStats(rows).hitDistribution.map((segment) => segment.value)), 8)
  })

  test('names the best draw and the most played game', () => {
    const stats = readPracticeStats(rows)

    assert.equal(stats.bestDraw?.won, 1000)
    assert.equal(stats.favouriteGame, '6/45')
  })

  test('has no best draw when nothing was won', () => {
    const losers = rows.map((play) => ({ ...play, won: 0, winCount: 0 }))

    assert.equal(readPracticeStats(losers).bestDraw, null)
  })
})
