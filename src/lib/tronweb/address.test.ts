import { describe, expect, it } from 'bun:test'
import { createTronAccount } from './account'
import { isTronAddress } from './address'

// A real base58check address, and the same address with its last character
// moved — the shape survives, the checksum does not.
const VALID = 'TVNtoaanAALqt7w6UPZh55xjFFsJkJr9Zy'
const BAD_CHECKSUM = 'TVNtoaanAALqt7w6UPZh55xjFFsJkJr9Zx'

describe('isTronAddress', () => {
  it('accepts a base58check address', () => {
    expect(isTronAddress(VALID)).toBe(true)
  })

  it('rejects an address whose checksum does not close', () => {
    expect(isTronAddress(BAD_CHECKSUM)).toBe(false)
  })

  it('rejects what is the right shape but not an address', () => {
    expect(isTronAddress('T' + '1'.repeat(33))).toBe(false)
    expect(isTronAddress(VALID.slice(1))).toBe(false)
    expect(isTronAddress('')).toBe(false)
  })
})

describe('createTronAccount', () => {
  it('mints an address its own validator accepts', () => {
    const account = createTronAccount()
    expect(isTronAddress(account.address)).toBe(true)
    expect(account.privateKey).toMatch(/^[0-9a-fA-F]{64}$/)
  })

  it('mints a different account every time', () => {
    const addresses = new Set(Array.from({ length: 8 }, () => createTronAccount().address))
    expect(addresses.size).toBe(8)
  })
})
