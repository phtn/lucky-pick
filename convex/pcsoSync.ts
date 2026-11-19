import { ConvexError, v, type Infer } from 'convex/values'
import { PCSO_BROWSER_HEADERS, pcsoImportText, pcsoRequestUrl } from '../src/lib/results-pcso'
import { internal } from './_generated/api'
import { action, internalAction, type ActionCtx } from './_generated/server'
import { isPlatformStaff } from './lib/auth'
import { resultGame } from './resultValidators'
import { scheduleSettlements } from './tickets/settle'

const byGame = v.array(v.object({ game: resultGame, added: v.number() }))
const syncResult = v.object({
  rows: v.number(), added: v.number(), skipped: v.number(), rejected: v.number(), byGame,
})
type SyncResult = Infer<typeof syncResult>

/**
 * Scrape PCSO and import what's new. The search page lists the last few days
 * of every game by default, so a missed or early run is backfilled on the next
 * one; draws that are already stored (or in the CSV baseline) are skipped.
 */
async function syncFromPcso(ctx: ActionCtx, source: string): Promise<SyncResult> {
  // The proxy URL carries an API key: it is never logged or put in an error.
  const { url, proxied } = pcsoRequestUrl(process.env.PCSO_PROXY_URL)
  const response = await fetch(url, { headers: PCSO_BROWSER_HEADERS })
  if (!response.ok) {
    const via = proxied ? 'PCSO (via the scraping proxy)' : 'PCSO'
    const hint = !proxied && response.status === 403
      ? ' PCSO blocks server networks; set PCSO_PROXY_URL on the Convex deployment to fetch through a scraping API.'
      : ''
    throw new Error(`${via} responded ${[response.status, response.statusText].filter(Boolean).join(" ")}.${hint}`)
  }
  const { text, rows, rejected, draws } = pcsoImportText(await response.text())
  for (const { row, message } of rejected) console.warn(`Skipped PCSO row "${row}": ${message}`)
  if (!rows) throw new Error('PCSO results table was empty.')
  const result: { added: number; skipped: number; byGame: Infer<typeof byGame> } = text
    ? await ctx.runMutation(internal.resultsImport.importSystem, { text, source })
    : { added: 0, skipped: 0, byGame: [] }
  // New draws were scheduled by the import; the ones already stored are
  // scheduled again so a draw imported before settlement existed, or with a
  // ticket skipped last time, still settles. Settling is idempotent per ticket.
  await scheduleSettlements(ctx, draws)
  console.log(`PCSO sync (${source}): ${rows} rows, ${result.added} added, ${result.skipped} skipped, ${rejected.length} rejected`)
  return { rows, rejected: rejected.length, ...result }
}

/** The nightly cron's entry point. */
export const fetchLatest = internalAction({
  args: {},
  returns: syncResult,
  handler: (ctx): Promise<SyncResult> => syncFromPcso(ctx, 'pcso'),
})

/** The same sync on demand, from the console's Results page. Staff only. */
export const syncNow = action({
  args: {},
  returns: syncResult,
  handler: async (ctx): Promise<SyncResult> => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity || !isPlatformStaff(identity)) throw new ConvexError('Unauthorized.')
    try {
      return await syncFromPcso(ctx, 'pcso-manual')
    } catch (error) {
      // Surfaced to the operator as-is, rather than as a generic server error.
      throw new ConvexError(error instanceof Error ? error.message : 'The PCSO sync failed.')
    }
  },
})
