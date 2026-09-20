/** Peso display helpers. Amounts are authored as plain numbers everywhere else;
 *  these decide how many decimals the UI actually shows. */

export function formatPeso(n: number) {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: n >= 1000 ? 0 : 0, maximumFractionDigits: n % 1 === 0 ? 0 : 2 })
}

/** The jackpot always shows centavos, the way PCSO publishes it. */
export function formatJackpot(n: number) {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Short form for the game chips and multiplier buttons. */
export function formatCompactPeso(n: number) {
  if (n >= 1_000_000) return '₱' + (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1) + 'M'
  if (n >= 1_000) return '₱' + (n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1) + 'K'
  return '₱' + n
}
