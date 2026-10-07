import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { RESULT_GAMES, type ResultGameId, type ResultsManifest } from '../src/lib/results'
import { parseResultCsv } from './results-csv'
import { buildCsvBaseline } from './results-import-csv'

const sourceDir = fileURLToPath(new URL('../public/results/', import.meta.url))
const outputDir = `${sourceDir}/generated`
const sources = Object.fromEntries(await Promise.all(RESULT_GAMES.map(async game => [game.id, await readFile(`${sourceDir}/${game.id}.csv`, 'utf8')])) ) as Record<ResultGameId, string>
const parsed = await Promise.all(RESULT_GAMES.map(async game =>
  parseResultCsv(sources[game.id], game)))
const issues = parsed.flatMap(result => result.issues)

for (const { dataset } of parsed) {
  console.log(`${dataset.game}.csv: ${dataset.records.length.toLocaleString()} records${dataset.excludedRows ? `; ${dataset.excludedRows} excluded` : ''}`)
}
if (issues.length) {
  console.warn(`Results validation: ${issues.length} source records excluded.`)
  for (const issue of issues) console.warn(`  ${issue.file}:${issue.line}: ${issue.message}`)
}
if (process.argv.includes('--strict') && issues.length) process.exit(1)
if (process.argv.includes('--check')) process.exit(0)

await mkdir(outputDir, { recursive: true })
const baselinePath = fileURLToPath(new URL('../convex/csvBaseline.ts', import.meta.url))
const baseline = buildCsvBaseline(sources)
if (await readFile(baselinePath, 'utf8').catch(() => '') !== baseline) await writeFile(baselinePath, baseline)
const games = {} as ResultsManifest['games']
for (const { dataset } of parsed) {
  const json = JSON.stringify(dataset)
  const hash = createHash('sha256').update(json).digest('hex').slice(0, 16)
  const file = `${dataset.game}.${hash}.json`
  await writeFile(`${outputDir}/${file}`, json)
  games[dataset.game as ResultGameId] = { file, rows: dataset.records.length, excludedRows: dataset.excludedRows }
}
const report = JSON.stringify({ version: 1, issues }, null, 2)
const reportHash = createHash('sha256').update(report).digest('hex').slice(0, 16)
const reportFile = `report.${reportHash}.json`
await writeFile(`${outputDir}/${reportFile}`, report)
const manifest: ResultsManifest = { version: 1, games, report: reportFile }
// Publish the index last so it only ever references complete files.
await writeFile(`${outputDir}/manifest.json.tmp`, JSON.stringify(manifest))
await rename(`${outputDir}/manifest.json.tmp`, `${outputDir}/manifest.json`)
const keep = new Set(['manifest.json', reportFile, ...Object.values(games).map(game => game.file)])
for (const file of await readdir(outputDir)) {
  if (/^(?:report|[a-z0-9]+)\.[a-f0-9]{16}\.json$/.test(file) && !keep.has(file)) await rm(`${outputDir}/${file}`)
}
