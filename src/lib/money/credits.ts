/** Credits are closed-loop and 1 credit = ₱1, so a top-up is recorded in pesos. */
export const CREDIT_CURRENCY = 'PHP' as const

/**
 * The most credits one top-up may mint. Policy, not arithmetic: it is 10x the
 * largest opening-grant rung, so a typo of a few zeros is refused instead of
 * being one approval away from minting.
 */
export const MAX_TOPUP_CREDITS = 10_000_000

/** Whole credits only; `Number.isSafeInteger` also rules out NaN and Infinity. */
export const isTopupAmount = (value: number) =>
  Number.isSafeInteger(value) && value >= 1 && value <= MAX_TOPUP_CREDITS
