import { useSyncExternalStore } from 'octane'
import type { TronAccount } from '@/lib/tronweb/account'
import { getPendingTronAccount, subscribeToPendingTronAccount } from '@/lib/tronweb/pending-account'

/**
 * The keypair minted for this user on this load, until they confirm they have
 * saved it. `null` on every load but the one that created an account.
 */
export function usePendingTronAccount(): TronAccount | null {
  return useSyncExternalStore(subscribeToPendingTronAccount, getPendingTronAccount, getPendingTronAccount)
}
