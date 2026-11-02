import { generateAccount } from 'tronweb/utils'

export interface TronAccount {
  /** The base58check address, the only half of this pair that is stored. */
  address: string
  /** The 64-character hex key. Shown to its owner once and never persisted. */
  privateKey: string
}

/**
 * Generates a TRON keypair locally. This is what the documented
 * `tronWeb.createAccount()` does — that method is `utils.accounts.generateAccount()`
 * behind an `async` declaration, with no node host and no API key involved, so
 * nothing about the keypair leaves this process and the synchronous call is the
 * honest shape for it.
 *
 * The key is returned, never stored: only the address is sent to Convex, so this
 * return value is the single copy in existence. A caller that drops it has
 * destroyed the account.
 */
export const createTronAccount = (): TronAccount => {
  const { address, privateKey } = generateAccount()
  return { address: address.base58, privateKey }
}
