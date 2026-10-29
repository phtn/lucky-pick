import { describe, expect, test } from 'bun:test'
import { CREDIT_CURRENCY, MAX_TOPUP_CREDITS, isTopupAmount } from './credits'

describe('isTopupAmount', () => {
  test('accepts whole credits from 1 to the cap', () => {
    expect(CREDIT_CURRENCY).toBe('PHP')
    expect(MAX_TOPUP_CREDITS).toBe(10_000_000)
    for (const n of [1, 5_000, MAX_TOPUP_CREDITS]) expect(isTopupAmount(n)).toBe(true)
  })

  test('rejects zero, negatives, fractions, non-finite values and oversize amounts', () => {
    for (const n of [0, -5, 1.5, NaN, Infinity, -Infinity, MAX_TOPUP_CREDITS + 1, Number.MAX_SAFE_INTEGER + 1]) {
      expect(isTopupAmount(n)).toBe(false)
    }
  })
})
