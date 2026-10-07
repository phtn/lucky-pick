import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { RESULT_GAMES, type ResultGameId } from '../src/lib/results'
import { planCsvImport } from './results-import-csv'

const sourceDir = fileURLToPath(new URL('../public/results/', import.meta.url))
const file = process.argv.slice(2).find(argument => !argument.startsWith('--')) ?? `${sourceDir}/raw.txt`
const sources = Object.fromEntries(await Promise.all(RESULT_GAMES.map(async game => [game.id, await readFile(`${sourceDir}/${game.id}.csv`, 'utf8')])) ) as Record<ResultGameId, string>
const plan = planCsvImport(await readFile(file, 'utf8'), sources)
console.log(`${plan.added} new draws; ${plan.skipped} existing or repeated draws skipped.`)
for (const change of plan.changes) console.log(`${change.game}.csv: +${change.added}`)
if (process.argv.includes('--check') || !plan.added) process.exit(0)

const changed = plan.changes.filter(change => change.added)
const suffix = `.import-${process.pid}-${Date.now()}.tmp`
const committed: typeof changed = []
try {
  for (const change of changed) await writeFile(`${sourceDir}/${change.game}.csv${suffix}`, change.after, { flag: 'wx' })
  for (const change of changed) {
    if (await readFile(`${sourceDir}/${change.game}.csv`, 'utf8') !== change.before) throw new Error(`${change.game}.csv changed during import. Run again.`)
  }
  for (const change of changed) {
    await rename(`${sourceDir}/${change.game}.csv${suffix}`, `${sourceDir}/${change.game}.csv`)
    committed.push(change)
  }
} catch (error) {
  for (const change of committed) await writeFile(`${sourceDir}/${change.game}.csv`, change.before)
  throw error
} finally {
  await Promise.all(changed.map(change => rm(`${sourceDir}/${change.game}.csv${suffix}`, { force: true })))
}
await import('./build-results')
