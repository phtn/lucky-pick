import { TronWeb } from 'tronweb'

/**
 * WORKER ONLY. This module reads `TRON_PRO_API_KEY`, so it must never be reached
 * from the browser entry (`src/main.ts`) — only from `src/worker.ts` and what it
 * imports, the way `src/lib/firebase-admin/` is. Browser code that needs to
 * check an address imports `./address` instead, which holds no secrets.
 *
 * The Worker's env arrives as `process.env` under `nodejs_compat`, which means
 * `.dev.vars` locally and `wrangler secret put` in deploys. A plain `.env` entry
 * does not reach the Worker.
 */
export type TronNetwork = 'mainnet' | 'testnet'

const FULL_HOST_ENV: Record<TronNetwork, string> = {
  mainnet: 'TRON_MAINNET_FULL_HOST',
  testnet: 'TRON_TESTNET_FULL_HOST'
}

const clients = new Map<TronNetwork, TronWeb>()

const readEnv = (name: string) => {
  const value = process.env[name]?.trim()
  return value && value.length > 0 ? value : undefined
}

/**
 * The read-only client for one network, or `null` when its full-host variable is
 * unset — a missing binding is the honest answer, and callers render it, rather
 * than a client that fails later against an empty host.
 *
 * No `privateKey` is passed: nothing here signs. A signing call throws at the
 * call site, which is where that decision belongs.
 */
export function getTronWeb(network: TronNetwork): TronWeb | null {
  const cached = clients.get(network)
  if (cached) return cached

  const fullHost = readEnv(FULL_HOST_ENV[network])
  if (!fullHost) return null

  const apiKey = readEnv('TRON_PRO_API_KEY')
  const client = new TronWeb({
    fullHost,
    // TronGrid rate-limits an anonymous caller hard, but it does answer, so a
    // missing key is a degraded client rather than no client.
    ...(apiKey ? { headers: { 'TRON-PRO-API-KEY': apiKey } } : {})
  })

  clients.set(network, client)
  return client
}
