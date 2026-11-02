/** Trims a value and collapses an empty result to `null`, which is storable. */
export const trimOrNull = (value: string | null | undefined) => {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed.length === 0 ? null : trimmed
}

const TRON_BASE58_ADDRESS = /^T[1-9A-HJ-NP-Za-km-z]{33}$/

/**
 * A TRON base58 address is 34 base58 characters behind the `T` that the 0x41
 * network byte encodes to. The last four bytes are a double-SHA256 checksum,
 * which this runtime has no hash to verify inside a mutation — so this is the
 * shape half of the check, and `isTronAddress` in `src/lib/tronweb/address.ts`
 * (checksum included) runs before a caller submits. A value clears both or it
 * does not reach the row.
 */
export const isTronAddressShape = (value: string) => TRON_BASE58_ADDRESS.test(value)
