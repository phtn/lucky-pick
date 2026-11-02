/**
 * Which chain a figure came from. Its own module so both the secret-free side
 * and the Worker-only client can name it without either importing the other.
 */
export type TronNetwork = 'mainnet' | 'testnet'

/** How a network is said on screen, where a balance has to carry its chain. */
export const TRON_NETWORK_LABELS: Record<TronNetwork, string> = {
  mainnet: 'TRON mainnet',
  testnet: 'Nile testnet'
}

export const isTronNetwork = (value: unknown): value is TronNetwork => value === 'mainnet' || value === 'testnet'
