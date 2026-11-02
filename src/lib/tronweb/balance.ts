import { isTronNetwork, type TronNetwork } from './network'

/** The chain stores balances in SUN; one TRX is a million of them. */
export const SUN_PER_TRX = 1_000_000

export interface TrxBalance {
  address: string
  /** Whole SUN, the unit the chain itself keeps, so no precision is lost here. */
  sun: number
  /**
   * USD per TRX, or `null` when the price could not be read. The balance is a
   * fact about the chain and the price is a fact about a market: one failing
   * must not empty the other, so the figure stands with no dollar value beside
   * it rather than disappearing.
   */
  usdPerTrx: number | null
  /**
   * The chain the balance was read from. Carried rather than assumed: a figure
   * from a testnet is worth nothing, and a page that shows a dollar value beside
   * it has to be able to say which one it is.
   */
  network: TronNetwork
}

const trxFormatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

/**
 * `1234560000` SUN reads as `1,234.56`. At most two decimals, not the six the
 * chain carries, and a whole number stays whole — this is a figure to read, and
 * the exact SUN is in `sun` for anything that has to be arithmetic.
 *
 * Bare: the unit is not in the string, so a caller that needs one says `TRX`
 * itself, in a label or beside an icon that already carries it.
 */
export const formatTrx = (sun: number) => `${trxFormatter.format(sun / SUN_PER_TRX)}`

/** What that balance is worth at a given price, as `$637.70`. */
export const formatUsd = (sun: number, usdPerTrx: number) => usdFormatter.format((sun / SUN_PER_TRX) * usdPerTrx)

/** Narrows a parsed `/api/trx/balance` body, which is `unknown` until checked. */
export const isTrxBalance = (value: unknown): value is TrxBalance => {
  if (typeof value !== 'object' || value === null) return false

  const body = value as TrxBalance
  const hasPrice = body.usdPerTrx === null || (typeof body.usdPerTrx === 'number' && Number.isFinite(body.usdPerTrx))

  return (
    typeof body.address === 'string' &&
    typeof body.sun === 'number' &&
    Number.isFinite(body.sun) &&
    hasPrice &&
    isTronNetwork(body.network)
  )
}
