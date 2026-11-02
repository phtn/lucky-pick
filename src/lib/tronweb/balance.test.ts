import { expect, test } from 'bun:test'
import { formatTrx, formatUsd, isTrxBalance, SUN_PER_TRX } from './balance'

test('formats SUN as a bare TRX figure', () => {
  expect(formatTrx(0)).toBe('0')
  expect(formatTrx(SUN_PER_TRX)).toBe('1')
  expect(formatTrx(1_000 * SUN_PER_TRX)).toBe('1,000')
  expect(formatTrx(1_234_560_000)).toBe('1,234.56')
  // Dust rounds away, so a balance that is not zero can still read as one. The
  // exact SUN is what anything other than a label should work from.
  expect(formatTrx(1)).toBe('0')
})

test('narrows a balance body and rejects anything else', () => {
  expect(isTrxBalance({ address: 'T…', sun: 0, usdPerTrx: 0.31, network: 'testnet' })).toBe(true)
  // A price that could not be read is still a balance.
  expect(isTrxBalance({ address: 'T…', sun: 0, usdPerTrx: null, network: 'mainnet' })).toBe(true)
  expect(isTrxBalance({ address: 'T…', sun: Number.NaN, usdPerTrx: null, network: 'testnet' })).toBe(false)
  expect(isTrxBalance({ address: 'T…', sun: 0, usdPerTrx: Number.NaN, network: 'testnet' })).toBe(false)
  expect(isTrxBalance({ address: 'T…', sun: 0 })).toBe(false)
  // A balance with no chain named is one whose dollar value cannot be read honestly.
  expect(isTrxBalance({ address: 'T…', sun: 0, usdPerTrx: 0.31, network: 'nile' })).toBe(false)
  expect(isTrxBalance({ address: 'T…' })).toBe(false)
  expect(isTrxBalance({ sun: 1 })).toBe(false)
  expect(isTrxBalance({ error: 'Could not read the balance.' })).toBe(false)
  expect(isTrxBalance(null)).toBe(false)
  expect(isTrxBalance('1000')).toBe(false)
})

test('figures a balance in dollars', () => {
  expect(formatUsd(2_000 * SUN_PER_TRX, 0.318849)).toBe('$637.70')
  expect(formatUsd(0, 0.318849)).toBe('$0.00')
})
