import type { LotteryResult } from './results'

export interface NumberFrequency {
  key: string
  numbers: number[]
  draws: number
  share: number
  lastSeen: string
}

export interface ResultsAnalytics {
  draws: number
  missingNumbers: number
  firstDate: string | null
  lastDate: string | null
  singles: NumberFrequency[]
  pairs: NumberFrequency[]
  triples: NumberFrequency[]
}

/** Unordered groups, counted at most once per draw, including repeated digits. */
export function analyzeResults(records: readonly LotteryResult[]): ResultsAnalytics {
  const counts = [new Map<string, NumberFrequency>(), new Map<string, NumberFrequency>(), new Map<string, NumberFrequency>()]
  let draws = 0
  let missingNumbers = 0
  let firstDate: string | null = null
  let lastDate: string | null = null

  for (const record of records) {
    if (!record.numbers?.length) {
      missingNumbers++
      continue
    }
    draws++
    if (!firstDate || record.date < firstDate) firstDate = record.date
    if (!lastDate || record.date > lastDate) lastDate = record.date
    const numbers = [...record.numbers].sort((a, b) => a - b)
    const seen = new Set<string>()
    const visit = (start: number, group: number[]) => {
      const key = group.join('-')
      if (group.length && !seen.has(key)) {
        seen.add(key)
        const map = counts[group.length - 1]!
        const existing = map.get(key)
        if (existing) {
          existing.draws++
          if (record.date > existing.lastSeen) existing.lastSeen = record.date
        } else {
          map.set(key, { key, numbers: group, draws: 1, share: 0, lastSeen: record.date })
        }
      }
      if (group.length === 3) return
      for (let index = start; index < numbers.length; index++) {
        // Equivalent digit positions produce the same multiset; visit it once.
        if (index > start && numbers[index] === numbers[index - 1]) continue
        visit(index + 1, [...group, numbers[index]!])
      }
    }
    visit(0, [])
  }

  const ranked = counts.map(map => [...map.values()].map(item => ({ ...item, share: item.draws / draws }))
    .sort((a, b) => {
      if (a.draws !== b.draws) return b.draws - a.draws
      for (let index = 0; index < a.numbers.length; index++) {
        const difference = a.numbers[index]! - b.numbers[index]!
        if (difference) return difference
      }
      return 0
    }))
  return { draws, missingNumbers, firstDate, lastDate, singles: ranked[0]!, pairs: ranked[1]!, triples: ranked[2]! }
}
