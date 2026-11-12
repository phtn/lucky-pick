import { describe, expect, test } from 'bun:test'
import { GAME_IDS } from './games'
import {
  DEFAULT_STAKES,
  DEFAULT_TICKET_COST,
  MAX_STAKE,
  MAX_STAKE_OPTIONS,
  MAX_TICKET_COST,
  betTypeSettings,
  defaultGameSettings,
  enabledBetTypes,
  enabledGameIds,
  isTicketCost,
  normalizeStakes,
  stakesForCost,
  resolveGameSettings,
  stakesFor,
  ticketCostFor
} from './game-settings'

describe('isTicketCost', () => {
  test('admits whole pesos inside the bounds', () => {
    expect(isTicketCost(1)).toBe(true)
    expect(isTicketCost(25)).toBe(true)
    expect(isTicketCost(MAX_TICKET_COST)).toBe(true)
  })

  test('refuses fractions, zero, negatives and anything past the cap', () => {
    expect(isTicketCost(20.5)).toBe(false)
    expect(isTicketCost(0)).toBe(false)
    expect(isTicketCost(-25)).toBe(false)
    expect(isTicketCost(MAX_TICKET_COST + 1)).toBe(false)
    expect(isTicketCost('25')).toBe(false)
    expect(isTicketCost(Number.NaN)).toBe(false)
  })
})

describe('normalizeStakes', () => {
  test('sorts, de-duplicates and keeps the cost it is charged against', () => {
    expect(normalizeStakes([100, 20, 20], 50)).toEqual([20, 50, 100])
  })

  test('drops anything that is not a price', () => {
    expect(normalizeStakes([25, 0, 20.5, MAX_STAKE + 1], 25)).toEqual([25])
  })

  test('caps the list', () => {
    const many = Array.from({ length: MAX_STAKE_OPTIONS + 4 }, (_, index) => index + 1)
    expect(normalizeStakes(many, 1)).toHaveLength(MAX_STAKE_OPTIONS)
  })
})

describe('stakesForCost', () => {
  test('offers the price and its next three multiples', () => {
    expect(stakesForCost(30)).toEqual([30, 60, 90, 120])
  })

  test('the dearest ticket still yields stakes that are all valid', () => {
    const stakes = stakesForCost(MAX_TICKET_COST)
    expect(normalizeStakes(stakes, MAX_TICKET_COST)).toEqual(stakes)
  })
})

describe('resolveGameSettings', () => {
  test('an unconfigured deployment plays at the code’s own prices', () => {
    const resolved = resolveGameSettings(undefined)

    expect(Object.keys(resolved).sort()).toEqual([...GAME_IDS].sort())
    expect(enabledGameIds(resolved)).toEqual(GAME_IDS)
    expect(ticketCostFor(resolved, '6/42', 6)).toBe(DEFAULT_TICKET_COST)
    expect(stakesFor(resolved, '6/42', 6)).toEqual(DEFAULT_STAKES)
    expect(enabledBetTypes(resolved['6/42'])).toEqual([1, 2, 3, 4, 5, 6])
  })

  test('a stored row wins, and the games it leaves out keep their defaults', () => {
    const [stored] = defaultGameSettings()
    const resolved = resolveGameSettings([
      {
        ...stored,
        enabled: false,
        betTypes: [{ betType: 3, enabled: false, ticketCost: 40, stakes: [40, 60] }]
      }
    ])

    expect(resolved['6/42'].enabled).toBe(false)
    expect(betTypeSettings(resolved['6/42'], 3)).toEqual({ betType: 3, enabled: false, ticketCost: 40, stakes: [40, 60] })
    // The five bet types the row did not mention are filled from the defaults.
    expect(resolved['6/42'].betTypes).toHaveLength(6)
    expect(ticketCostFor(resolved, '6/42', 6)).toBe(DEFAULT_TICKET_COST)
    expect(resolved['6/45'].enabled).toBe(true)
  })

  test('games come back in the configured order', () => {
    const rows = defaultGameSettings().map((row) => ({ ...row, order: GAME_IDS.length - row.order }))
    expect(enabledGameIds(resolveGameSettings(rows))).toEqual([...GAME_IDS].reverse())
  })
})

describe('falling back rather than closing the board', () => {
  test('every game switched off still leaves one buyable', () => {
    const rows = defaultGameSettings().map((row) => ({ ...row, enabled: false }))
    expect(enabledGameIds(resolveGameSettings(rows))).toEqual([GAME_IDS[0]])
  })

  test('every bet type switched off still leaves the jackpot ticket', () => {
    const rows = defaultGameSettings().map((row) => ({
      ...row,
      betTypes: row.betTypes.map((bet) => ({ ...bet, enabled: false }))
    }))
    expect(enabledBetTypes(resolveGameSettings(rows)['6/42'])).toEqual([6])
  })
})

describe('stakesFor', () => {
  test('always offers the price a ticket actually costs', () => {
    const [stored] = defaultGameSettings()
    const resolved = resolveGameSettings([
      { ...stored, betTypes: [{ betType: 6, enabled: true, ticketCost: 30, stakes: [20] }] }
    ])

    expect(stakesFor(resolved, '6/42', 6)).toEqual([20, 30])
  })
})
