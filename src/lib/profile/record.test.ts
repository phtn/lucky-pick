import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { TICKET_DETAIL_LIMIT } from '../../../convex/plays/d'
import type { GameId } from '../games'
import type { BetType, Draw, Ticket } from '../lotto'
import { buildPracticePlay } from './record'

const draw: Draw = {
  id: 1,
  game: '6/42',
  numbers: [3, 9, 14, 21, 30, 41],
  sorted: [3, 9, 14, 21, 30, 41],
  time: '9:00 PM',
  dateLabel: 'Nov 2',
  isOfficial: false,
  seed: { clientSeed: 'c', serverSeed: 's', nonce: 7, rolls: 6 }
}

// A ticket as `evaluateTickets` hands it back: already flipped to won or lost.
const ticket = (id: number, over: Partial<Ticket> = {}): Ticket => ({
  id,
  numbers: [1, 2, 3, 4, 5, 6],
  game: '6/42',
  betType: 6 as BetType,
  required: 6,
  status: 'lost',
  hits: 0,
  time: '9:00 PM',
  cost: 25,
  ...over
})

const won = (id: number, prize: number, hits: number, over: Partial<Ticket> = {}) =>
  ticket(id, { status: 'won', hits, prizeWon: prize, ...over })

const settle = (tickets: Ticket[], playerName?: string) => tickets.map((t) => ({ ticket: t, playerName }))

describe('buildPracticePlay', () => {
  test('aggregates every settled ticket and caps the detail list at 50', () => {
    const tickets = Array.from({ length: 500 }, (_, i) => (i % 10 === 0 ? won(i, 1000, 5) : ticket(i, { hits: 1 })))
    const play = buildPracticePlay({ draw, mode: 'solo', settled: settle(tickets) })!

    assert.equal(play.ticketCount, 500)
    assert.equal(play.spent, 12_500)
    assert.equal(play.won, 50_000)
    assert.equal(play.winCount, 50)
    assert.equal(play.bestHits, 5)
    assert.equal(play.tickets.length, TICKET_DETAIL_LIMIT)
  })

  test('ranks detail by prize, then by hits', () => {
    const tickets = [ticket(1, { hits: 2 }), won(2, 1000, 5), ticket(3, { hits: 4 }), won(4, 5000, 6), ticket(5, { hits: 3 })]
    const input = settle(tickets)
    const play = buildPracticePlay({ draw, mode: 'solo', settled: input })!

    assert.deepEqual(play.tickets.map((t) => t.prize).slice(0, 3), [5000, 1000, 0])
    assert.equal(play.tickets[2].hits, 4) // the best of the prizeless
    assert.deepEqual(input.map((s) => s.ticket.id), [1, 2, 3, 4, 5]) // the caller's array is left in order
  })

  test('ranks past the detail cap, and keeps ties in input order', () => {
    // 63 tickets for 50 places: the 13 that must be dropped are the last of the
    // prizeless, since among equals the earlier ticket keeps its place. A
    // sort-then-slice and a bounded selection agree only if both are stable.
    const tickets = [
      ...Array.from({ length: 40 }, (_, i) => ticket(i + 100, { hits: 2 })),
      won(1, 500, 4),
      ...Array.from({ length: 20 }, (_, i) => ticket(i + 200, { hits: 2 })),
      won(2, 500, 4),
      won(3, 9000, 6)
    ]
    const play = buildPracticePlay({ draw, mode: 'solo', settled: settle(tickets) })!

    assert.equal(play.ticketCount, 63)
    assert.equal(play.tickets.length, TICKET_DETAIL_LIMIT)
    // Prize descending; the two 500s in the order they were played; then the
    // prizeless, of which the earliest 47 survive.
    assert.deepEqual(play.tickets.slice(0, 3).map((t) => t.prize), [9000, 500, 500])
    assert.deepEqual(play.tickets.slice(3).map((t) => t.prize), Array.from({ length: 47 }, () => 0))
    assert.deepEqual(play.tickets.slice(3).map((t) => t.hits), Array.from({ length: 47 }, () => 2))
  })

  test('a won ticket carrying no prize adds nothing to the money figures', () => {
    // `calcPrize` always writes `prizeWon`, so `status` and `prize` agree today.
    // The row's money comes from the prize, never from the status, and this
    // pins that: an edit that left `prizeWon` unset must not invent winnings.
    const play = buildPracticePlay({
      draw,
      mode: 'solo',
      settled: settle([ticket(1, { status: 'won', hits: 4, prizeWon: undefined }), won(2, 300, 3)])
    })!

    assert.equal(play.won, 300)
    assert.equal(play.winCount, 1)
    assert.equal(play.ticketCount, 2)
    assert.equal(play.bestHits, 4) // the hits still count: only the prize is absent
    assert.equal(play.tickets.find((t) => t.hits === 4)?.prize, 0)
  })

  test('returns null for a draw with no settled tickets', () => {
    assert.equal(buildPracticePlay({ draw, mode: 'solo', settled: [] }), null)
  })

  test('counts only tickets this draw evaluated for its own game', () => {
    const other: GameId = '6/45'
    const play = buildPracticePlay({
      draw,
      mode: 'solo',
      settled: settle([
        ticket(1, { status: 'lost' }), // evaluated by this draw: counted
        ticket(2, { game: other, status: 'lost' }), // wrong game: excluded
        ticket(3, { status: 'pending' }) // never evaluated: excluded
      ])
    })!

    assert.equal(play.ticketCount, 1)
    assert.equal(play.spent, 25)
  })

  test('carries the seed, mode and official flag through', () => {
    const official: Draw = { ...draw, isOfficial: true, seed: undefined }
    const play = buildPracticePlay({
      draw: official,
      mode: 'party',
      settled: [{ ticket: won(1, 1000, 5), playerName: 'Kim' }]
    })!

    assert.equal(play.isOfficial, true)
    assert.equal(play.seed, null) // an official draw has no generator seed
    assert.equal(play.mode, 'party')
    assert.equal(play.tickets[0].playerName, 'Kim')
    assert.deepEqual(play.drawnBalls, official.numbers)

    const simulated = buildPracticePlay({ draw, mode: 'solo', settled: settle([ticket(1)]) })!
    assert.equal(simulated.isOfficial, false)
    assert.deepEqual(simulated.seed, draw.seed)
  })
})
