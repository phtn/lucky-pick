import { useEffect, useState } from 'octane'
import { isAbortError } from '@/lib/asgard/errors'
import { isTrxBalance, type TrxBalance } from '@/lib/tronweb/balance'

/**
 * The TRX balance of one address, with the price its worth is figured at.
 *
 * `undefined` is no answer — no address to read, still in flight, or a read that
 * failed — and callers must not render it as a figure. The same distinction the
 * rest of the app keeps between "not read" and "read, and it is zero": an
 * unfunded account answers `0`, which is a fact, while a node that refused
 * answers nothing at all.
 */
export function useTrxBalance(address: string | null | undefined): TrxBalance | undefined {
  const [balance, setBalance] = useState<TrxBalance | undefined>(undefined)

  useEffect(() => {
    if (!address) {
      setBalance(undefined)
      return undefined
    }

    const controller = new AbortController()

    void (async () => {
      try {
        const response = await fetch(`/api/trx/balance?address=${encodeURIComponent(address)}`, {
          signal: controller.signal
        })
        if (!response.ok) throw new Error('Could not read the balance.')

        const body: unknown = await response.json()
        if (!isTrxBalance(body)) throw new Error('The balance read came back in an unknown shape.')

        // A response that landed after the address changed describes the old
        // account, so it is dropped rather than shown against the new one.
        if (body.address === address) setBalance(body)
      } catch (error) {
        if (isAbortError(error)) return
        // One menu label is not worth a thrown render; the em dash it falls back
        // to already says the figure is unknown.
        setBalance(undefined)
      }
    })()

    return () => controller.abort()
  }, [address])

  return balance
}
