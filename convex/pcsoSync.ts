import { v, type Infer } from 'convex/values'
import { PCSO_BROWSER_HEADERS, PCSO_RESULTS_URL, pcsoImportText } from '../src/lib/results-pcso'
import { internal } from './_generated/api'
import { internalAction } from './_generated/server'
import { resultGame } from './resultValidators'

const byGame = v.array(v.object({ game: resultGame, added: v.number() }))
const syncResult = v.object({
  rows: v.number(), added: v.number(), skipped: v.number(), rejected: v.number(), byGame,
})

/**
 * Nightly PCSO sync. The search page lists the last few days of every game by
 * default, so a missed or early run is backfilled on the next one; draws that
 * are already stored (or in the CSV baseline) are skipped.
 */
export const fetchLatest = internalAction({
  args: {},
  returns: syncResult,
  handler: async (ctx): Promise<Infer<typeof syncResult>> => {
    const response = await fetch(PCSO_RESULTS_URL, { headers: PCSO_BROWSER_HEADERS })
    if (!response.ok) throw new Error(`PCSO responded ${response.status} ${response.statusText}`)
    const { text, rows, rejected } = pcsoImportText(await response.text())
    for (const { row, message } of rejected) console.warn(`Skipped PCSO row "${row}": ${message}`)
    if (!rows) throw new Error('PCSO results table was empty.')
    const result: { added: number; skipped: number; byGame: Infer<typeof byGame> } = text
      ? await ctx.runMutation(internal.resultsImport.importSystem, { text, source: 'pcso' })
      : { added: 0, skipped: 0, byGame: [] }
    console.log(`PCSO sync: ${rows} rows, ${result.added} added, ${result.skipped} skipped, ${rejected.length} rejected`)
    return { rows, rejected: rejected.length, ...result }
  },
})
