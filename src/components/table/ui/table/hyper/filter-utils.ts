import type { LabelledColumn } from './table-contract.ts'
import { TABLE_QUERY_LIMITS } from './parsers.ts'

const FILTER_OBJECT_LABEL_KEYS = ['label', 'name', 'title', 'slug', 'id', '_id', 'value'] as const

const MAX_FILTER_COLLECTION_ITEMS = 32
const MAX_FILTER_OBJECT_DEPTH = 4

const boundToken = (value: string) => value.slice(0, TABLE_QUERY_LIMITS.tokenCharacters)

const getObjectCandidate = (value: Record<string, unknown>): string | null => {
  try {
    for (const key of FILTER_OBJECT_LABEL_KEYS) {
      const candidate = value[key]
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return boundToken(candidate.trim())
      }
      if (typeof candidate === 'number' || typeof candidate === 'boolean') {
        return String(candidate)
      }
    }
  } catch {
    return null
  }

  return null
}

const stableStringify = (value: unknown, seen = new WeakSet<object>(), depth = 0): string => {
  if (value === null || value === undefined) return ''
  if (typeof value !== 'object') return boundToken(String(value))
  if (seen.has(value)) return '[Circular]'
  if (depth >= MAX_FILTER_OBJECT_DEPTH) {
    return Array.isArray(value) ? '[Array]' : '[Object]'
  }

  seen.add(value)
  try {
    if (Array.isArray(value)) {
      return boundToken(
        JSON.stringify(
          value.slice(0, MAX_FILTER_COLLECTION_ITEMS).map((item) => stableStringify(item, seen, depth + 1))
        )
      )
    }

    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(0, MAX_FILTER_COLLECTION_ITEMS)

    return boundToken(
      JSON.stringify(
        Object.fromEntries(entries.map(([key, entryValue]) => [key, stableStringify(entryValue, seen, depth + 1)]))
      )
    )
  } catch {
    return '[Unserializable]'
  } finally {
    seen.delete(value)
  }
}

const getValueToken = (value: unknown, seen: WeakSet<object>, depth: number): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return boundToken(value.trim())
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (typeof value !== 'object') return boundToken(String(value))
  if (seen.has(value)) return '[Circular]'
  if (depth >= MAX_FILTER_OBJECT_DEPTH) {
    return Array.isArray(value) ? '[Array]' : '[Object]'
  }

  if (Array.isArray(value)) {
    seen.add(value)
    try {
      return boundToken(
        value
          .slice(0, MAX_FILTER_COLLECTION_ITEMS)
          .map((item) => getValueToken(item, seen, depth + 1))
          .join(' | ')
      )
    } finally {
      seen.delete(value)
    }
  }

  return getObjectCandidate(value as Record<string, unknown>) ?? stableStringify(value)
}

export const getFilterValueToken = (value: unknown): string => getValueToken(value, new WeakSet<object>(), 0)

export const toggleFilterValueToken = (
  currentValue: unknown,
  optionToken: string,
  checked: boolean
): unknown[] | undefined => {
  const nextValue = Array.isArray(currentValue) ? [...currentValue] : []
  const currentIndex = nextValue.findIndex((value) => getFilterValueToken(value) === optionToken)

  if (checked && currentIndex === -1) {
    nextValue.push(optionToken)
  } else if (!checked && currentIndex > -1) {
    nextValue.splice(currentIndex, 1)
  }

  return nextValue.length > 0 ? nextValue : undefined
}

export const getFilterValueLabel = (value: unknown): string => {
  if (typeof value === 'boolean') {
    return value ? 'Active' : 'Inactive'
  }
  if (value === null || value === undefined) {
    return 'Empty'
  }
  if (typeof value === 'string') {
    return value.trim().length > 0 ? boundToken(value) : 'Empty'
  }
  if (typeof value === 'number') {
    return String(value)
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return 'Empty'
    return (
      boundToken(
        value
          .slice(0, MAX_FILTER_COLLECTION_ITEMS)
          .map((item) =>
            typeof item === 'boolean' ? (item ? 'Active' : 'Inactive') : getFilterValueToken(item) || 'Empty'
          )
          .join(', ')
      ) || 'Empty'
    )
  }
  if (typeof value === 'object') {
    return getObjectCandidate(value as Record<string, unknown>) ?? stableStringify(value) ?? 'Empty'
  }
  return boundToken(String(value))
}

export const getFilterMatchTokens = (value: unknown): string[] => {
  if (value === null || value === undefined) return ['']
  if (Array.isArray(value)) {
    const itemTokens = value.slice(0, MAX_FILTER_COLLECTION_ITEMS).map((item) => getFilterValueToken(item))
    const joinedToken = getFilterValueToken(value)
    return [...new Set([...itemTokens, joinedToken].filter(Boolean))]
  }

  return [getFilterValueToken(value)]
}

export const formatColumnId = (id: string): string => {
  return id
    .replace(/([A-Z])/g, ' $1')
    .replace(/[-_]/g, ' ')
    .trim()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

export const getColumnHeaderText = (column: LabelledColumn): string => {
  const header = column.columnDef.header

  if (typeof header === 'string') {
    return header
  }

  if (typeof header === 'function' && 'headerText' in header && typeof header.headerText === 'string') {
    return header.headerText
  }

  return formatColumnId(column.id)
}
