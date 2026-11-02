import type { TronAccount } from './account'

/**
 * Holds a just-generated keypair until its owner has saved the key, so the UI
 * can show it once.
 *
 * In memory only, deliberately: this is the one copy of a private key, and
 * `localStorage` would leave it readable on a shared machine long after the
 * account was created. The cost is that a reload loses the key for good, which
 * is why the panel showing it says so.
 */
let pendingAccount: TronAccount | null = null
const listeners = new Set<() => void>()

const publish = (next: TronAccount | null) => {
  if (pendingAccount === next) return
  pendingAccount = next
  for (const listener of listeners) listener()
}

/** Identity-stable, so `useSyncExternalStore` sees no change where there is none. */
export const getPendingTronAccount = (): TronAccount | null => pendingAccount

export const subscribeToPendingTronAccount = (onStoreChange: () => void) => {
  listeners.add(onStoreChange)
  return () => {
    listeners.delete(onStoreChange)
  }
}

export const setPendingTronAccount = (account: TronAccount) => publish(account)

/** Called once the owner says they have the key; the copy here is then gone. */
export const clearPendingTronAccount = () => publish(null)
