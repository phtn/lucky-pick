export const RESULT_GAMES = [
  { id: 'lotto', label: 'Lotto 6/42', count: 6, min: 1, max: 42, unique: true, timed: false },
  { id: 'mega', label: 'Megalotto 6/45', count: 6, min: 1, max: 45, unique: true, timed: false },
  { id: 'super', label: 'Superlotto 6/49', count: 6, min: 1, max: 49, unique: true, timed: false },
  { id: 'grand', label: 'Grand Lotto 6/55', count: 6, min: 1, max: 55, unique: true, timed: false },
  { id: 'ultra', label: 'Ultra Lotto 6/58', count: 6, min: 1, max: 58, unique: true, timed: false },
  { id: '2d', label: '2D Lotto', count: 2, min: 1, max: 31, unique: false, timed: true },
  { id: '3d', label: '3D Lotto', count: 3, min: 0, max: 9, unique: false, timed: true },
  { id: '4d', label: '4D Lotto', count: 4, min: 0, max: 9, unique: false, timed: false },
  { id: '6d', label: '6D Lotto', count: 6, min: 0, max: 9, unique: false, timed: false },
] as const

export type ResultGame = typeof RESULT_GAMES[number]
export type ResultGameId = ResultGame['id']

export interface LotteryResult {
  id: string
  date: string
  time: '2PM' | '5PM' | '9PM' | null
  numbers: number[] | null
  rawNumbers: string | null
  jackpotCents: number
  winners: number | null
}

export interface ResultDataset {
  version: 1
  game: ResultGameId
  sourceRows: number
  excludedRows: number
  records: LotteryResult[]
}

export interface ResultIssue {
  file: string
  line: number
  message: string
}

export interface ResultsManifest {
  version: 1
  games: Record<ResultGameId, { file: string; rows: number; excludedRows: number }>
  report: string
}

type FetchResults = (url: string, init?: RequestInit) => Promise<Response>

export function createResultsLoader(fetchFile: FetchResults) {
  let manifestPromise: Promise<ResultsManifest> | undefined
  const datasets = new Map<ResultGameId, Promise<ResultDataset>>()

  async function getManifest(): Promise<ResultsManifest> {
    manifestPromise ??= fetchFile('/results/generated/manifest.json', { cache: 'no-cache' })
      .then(async response => {
        if (!response.ok) throw new Error('Could not load the results index.')
        const manifest = await response.json() as ResultsManifest
        if (manifest.version !== 1) throw new Error('The results index is out of date. Reload this page.')
        return manifest
      })
      .catch(error => {
        manifestPromise = undefined
        throw error
      })
    return manifestPromise
  }

  async function loadResultReportUrl(): Promise<string> {
    const manifest = await getManifest()
    if (!/^report\.[a-f0-9]{16}\.json$/.test(manifest.report)) throw new Error('The data report is unavailable.')
    return `/results/generated/${manifest.report}`
  }

  /** Cache each game independently; a failed request can be retried. */
  function loadResults(game: ResultGameId): Promise<ResultDataset> {
    const cached = datasets.get(game)
    if (cached) return cached
    const request = getManifest()
      .then(async manifest => {
        const entry = manifest.games[game]
        if (!entry || !/^[a-z0-9]+\.[a-f0-9]{16}\.json$/.test(entry.file)) {
          throw new Error('This game is missing from the results index.')
        }
        const response = await fetchFile(`/results/generated/${entry.file}`)
        if (!response.ok) {
          // A deployment may have replaced the index and removed an older file.
          if (response.status === 404) manifestPromise = undefined
          throw new Error('Could not load these results. Please try again.')
        }
        const dataset = await response.json() as ResultDataset
        if (dataset.version !== 1 || dataset.game !== game || !Array.isArray(dataset.records)
          || dataset.records.length !== entry.rows || dataset.excludedRows !== entry.excludedRows
          || dataset.sourceRows !== dataset.records.length + dataset.excludedRows) {
          throw new Error('The results file does not match its index. Reload this page.')
        }
        return dataset
      })
      .catch(error => {
        datasets.delete(game)
        throw error
      })
    datasets.set(game, request)
    return request
  }
  return { loadResults, loadResultReportUrl }
}

export const { loadResults, loadResultReportUrl } = createResultsLoader((url, init) => fetch(url, init))
