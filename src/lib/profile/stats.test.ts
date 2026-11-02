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

// Three draws, eight tickets, two of them winners. Two draws are 6/45 and one
// of those is a PCSO draw checked against the player's own numbers.
const rows: PracticePlayRow[] = [
  row('a', '6/45', {
    ticketCount: 3,
    spent: 100,
    won: 1000,
    winCount: 1,
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
    assert.equal(readPracticeStats(rows).winRate, 0.25) // 2 wins of 8 tickets
  })

  test('counts official and simulated plays apart', () => {
    const stats = readPracticeStats(rows)

    assert.equal(stats.officialPlays, 1)
    assert.equal(stats.simulatedPlays, 2)
  })

  test('hit distribution sums to the tickets it describes', () => {
    assert.equal(sum(readPracticeStats(rows).hitDistribution.map((segment) => segment.value)), 8)
  })

  test('names the best draw and the most played game', () => {
    const stats = readPracticeStats(rows)

    assert.equal(stats.bestDraw?.won, 1000)
    assert.equal(stats.favouriteGame, '6/45')
  })
})
