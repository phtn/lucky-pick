import { isTronAddress } from '@/lib/tronweb/address'
import type { TrxBalance } from '@/lib/tronweb/balance'
import { getTronWeb } from '@/lib/tronweb/client'

// Accounts are minted as plain keypairs, which are network-agnostic, so the one
// thing that decides which chain a balance is read from is this constant. The
// bindings for both are in place; switching is this line.
const TRON_NETWORK = 'testnet' as const

const TRX_PRICE_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=tron&vs_currencies=usd'

// A price moves by the second but is the same for every caller, so it is read
// once a minute per isolate rather than once per menu. The upstream is a free
// tier with a rate limit, and a balance read must never be the thing that
// exhausts it.
const PRICE_TTL_MS = 60_000

let cachedPrice: { usd: number; readAt: number } | null = null

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
}

/**
 * USD per TRX, or `null` when it cannot be read.
 *
 * Never throws: the price is a garnish on the balance, so an upstream that is
 * down, rate-limiting, or answering in a shape we do not recognise costs the
 * dollar figure and nothing else.
 */
async function readTrxPrice(): Promise<number | null> {
  const now = Date.now()
  if (cachedPrice && now - cachedPrice.readAt < PRICE_TTL_MS) return cachedPrice.usd

  try {
    // CoinGecko answers 403 to a request with no descriptive User-Agent, and
    // workerd sends none of its own — so naming the app is what makes this work
    // at all, not politeness.
    const response = await fetch(TRX_PRICE_URL, {
      headers: { accept: 'application/json', 'user-agent': 'lucky-pick (+https://github.com/phtn/lucky-pick)' }
    })
    if (!response.ok) return cachedPrice?.usd ?? null

    const body: unknown = await response.json()
    const usd = (body as { tron?: { usd?: unknown } })?.tron?.usd

    if (typeof usd !== 'number' || !Number.isFinite(usd) || usd <= 0) return cachedPrice?.usd ?? null

    cachedPrice = { usd, readAt: now }
    return usd
  } catch {
    // A stale price is a better answer than none, and the only alternative here
    // is no dollar figure at all.
    return cachedPrice?.usd ?? null
  }
}

/**
 * `GET /api/trx/balance?address=T…` — the TRX balance of one address.
 *
 * Unauthenticated on purpose: a balance is public ledger data that anyone can
 * read straight from TronGrid, so a session would protect nothing. What this
 * route does hold is the API key, and the only thing it owes that key is to not
 * be a general-purpose proxy — hence the full base58check check before any
 * request goes out, and no path, method, or body a caller can steer.
 */
export async function handleTrxBalance(request: Request): Promise<Response> {
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405)

  const address = new URL(request.url).searchParams.get('address')?.trim() ?? ''
  if (!isTronAddress(address)) return json({ error: 'Not a TRON address.' }, 400)

  const tronWeb = getTronWeb(TRON_NETWORK)
  if (!tronWeb) return json({ error: 'TRON is not configured on this deployment.' }, 503)

  try {
    // Started together: the price does not depend on the balance, and the menu
    // waits on whichever is slower either way.
    const [balance, usdPerTrx] = await Promise.all([tronWeb.trx.getBalance(address), readTrxPrice()])
    // An address nobody has ever funded has no account on chain, and TronGrid
    // answers that with an empty object rather than a zero. Zero is the right
    // reading of it — the address is valid and holds nothing — but it has to be
    // made one here, since `getBalance` is typed as a number and would otherwise
    // hand `undefined` to the formatter.
    const sun = typeof balance === 'number' && Number.isFinite(balance) ? balance : 0
    const body: TrxBalance = { address, sun, usdPerTrx, network: TRON_NETWORK }
    return json(body)
  } catch {
    // The upstream node refused or timed out. That is not a statement about the
    // balance, so it must not be answered with one.
    return json({ error: 'Could not read the balance.' }, 502)
  }
}
