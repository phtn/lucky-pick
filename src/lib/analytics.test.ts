import { expect, test } from 'bun:test'
import { summarizeSession } from './analytics'
import type { Player, Ticket } from './lotto'

const ticket = (overrides: Partial<Ticket> = {}): Ticket => ({
  id: 1, game: '6/42', numbers: [1, 2, 3, 4, 5, 6], betType: 6,
  required: 6, status: 'pending', hits: 0, time: '9:00 PM', cost: 25, ...overrides,
})

test('empty session returns zero totals and all game rows', () => {
  const summary = summarizeSession([], [], 'solo')
  expect(summary.total).toBe(0)
  expect(summary.rate).toBe(0)
  expect(summary.byGame).toHaveLength(5)
})

test('pending tickets contribute spend but not settled win rate or hits', () => {
  const summary = summarizeSession([
    ticket(), ticket({ id: 2, status: 'won', hits: 3, prizeWon: 100 }),
    ticket({ id: 3, game: '6/45', status: 'lost', hits: 2, cost: 20 }),
  ], [], 'solo')
  expect(summary.spent).toBe(70)
  expect(summary.won).toBe(100)
  expect(summary.net).toBe(30)
  expect(summary.rate).toBe(50)
  expect(summary.pending).toBe(1)
  expect(summary.hits[0].count).toBe(0)
  expect(summary.hits[3].count).toBe(1)
  expect(summary.byGame.find(row => row.game === '6/45')?.spent).toBe(20)
})

test('party aggregates each player without counting solo tickets', () => {
  const players: Player[] = [
    { id: 'p1', name: 'You', color: '--primary', avatar: 'Y', winnings: 100, winCount: 1, tickets: [ticket({ status: 'won', hits: 3, prizeWon: 100 })] },
    { id: 'p2', name: 'Friend', color: '--primary', avatar: 'F', winnings: 0, winCount: 0, tickets: [ticket({ id: 2 })] },
  ]
  const summary = summarizeSession([ticket()], players, 'party')
  expect(summary.total).toBe(2)
  expect(summary.won).toBe(100)
  expect(summary.rate).toBe(100)
})
