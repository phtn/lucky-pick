import { expect, mock, test } from 'bun:test'
import { createResultsLoader, RESULT_GAMES, type ResultDataset, type ResultGameId, type ResultsManifest } from './results'

const hash = '0123456789abcdef'
const manifest: ResultsManifest = {
  version: 1,
  games: Object.fromEntries(RESULT_GAMES.map(game => [game.id, { file: `${game.id}.${hash}.json`, rows: 0, excludedRows: 0 }])) as ResultsManifest['games'],
  report: `report.${hash}.json`,
}
const dataset = (game: ResultGameId): ResultDataset => ({ version: 1, game, sourceRows: 0, excludedRows: 0, records: [] })
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })

test('shares the index and per-game requests while loading only selected games', async () => {
  const fetchFile = mock(async (url: string) => url.endsWith('manifest.json') ? json(manifest)
    : json(dataset(url.includes('/lotto.') ? 'lotto' : '6d')))
  const loader = createResultsLoader(fetchFile)
  const first = loader.loadResults('lotto')
  expect(loader.loadResults('lotto')).toBe(first)
  await Promise.all([first, loader.loadResults('6d'), loader.loadResultReportUrl()])
  expect(fetchFile).toHaveBeenCalledTimes(3)
  await loader.loadResults('lotto')
  expect(fetchFile).toHaveBeenCalledTimes(3)
  expect(await loader.loadResultReportUrl()).toBe(`/results/generated/report.${hash}.json`)
})

test('retries a failed index request without retaining a rejected cache entry', async () => {
  let indexCalls = 0
  const fetchFile = mock(async (url: string) => {
    if (url.endsWith('manifest.json')) return ++indexCalls === 1 ? new Response('', { status: 503 }) : json(manifest)
    return json(dataset('lotto'))
  })
  const loader = createResultsLoader(fetchFile)
  await expect(loader.loadResults('lotto')).rejects.toThrow('results index')
  await expect(loader.loadResults('lotto')).resolves.toEqual(dataset('lotto'))
  expect(indexCalls).toBe(2)
})

test('retries failed game requests while retaining the successful index', async () => {
  let dataCalls = 0
  const fetchFile = mock(async (url: string) => {
    if (url.endsWith('manifest.json')) return json(manifest)
    return ++dataCalls === 1 ? new Response('', { status: 503 }) : json(dataset('lotto'))
  })
  const loader = createResultsLoader(fetchFile)
  await expect(loader.loadResults('lotto')).rejects.toThrow('Could not load these results')
  await expect(loader.loadResults('lotto')).resolves.toEqual(dataset('lotto'))
  expect(fetchFile).toHaveBeenCalledTimes(3)
})

test('rejects mismatched data instead of caching or displaying another game', async () => {
  const fetchFile = mock(async (url: string) => url.endsWith('manifest.json') ? json(manifest) : json(dataset('6d')))
  const loader = createResultsLoader(fetchFile)
  await expect(loader.loadResults('lotto')).rejects.toThrow('does not match its index')
  await expect(loader.loadResults('lotto')).rejects.toThrow('does not match its index')
  expect(fetchFile).toHaveBeenCalledTimes(3)
})

test('refreshes the index when a deployment removes an old dataset file', async () => {
  let indexCalls = 0
  const updated = { ...manifest, games: { ...manifest.games, lotto: { ...manifest.games.lotto, file: 'lotto.fedcba9876543210.json' } } }
  const fetchFile = mock(async (url: string) => {
    if (url.endsWith('manifest.json')) return json(++indexCalls === 1 ? manifest : updated)
    if (url.includes(hash)) return new Response('', { status: 404 })
    return json(dataset('lotto'))
  })
  const loader = createResultsLoader(fetchFile)
  await expect(loader.loadResults('lotto')).rejects.toThrow('Could not load these results')
  await expect(loader.loadResults('lotto')).resolves.toEqual(dataset('lotto'))
  expect(indexCalls).toBe(2)
})
