import { parseAsStringEnum } from '@octanejs/nuqs'
import type {
  ColumnFiltersState,
  ColumnOrderState,
  ColumnSizingState,
  RowPinningState,
  RowSelectionState,
  SortingState,
  ColumnVisibilityState as VisibilityState
} from '@octanejs/tanstack-table'

export const TABLE_QUERY_LIMITS = {
  columnFilters: 64,
  filterValuesPerColumn: 256,
  loadedRows: 1_000_000,
  pageIndex: 1_000_000,
  pageSize: 500,
  persistedRowIds: 500,
  searchCharacters: 512,
  serializedStateCharacters: 16_384,
  tokenCharacters: 512,
  visibilityEntries: 256
} as const

const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

const clampInteger = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.floor(parsed)))
}

const trimStateValue = (value: string | null) => (value ?? '').slice(0, TABLE_QUERY_LIMITS.serializedStateCharacters)

const decodeToken = (value: string) => {
  const boundedValue = value.slice(0, TABLE_QUERY_LIMITS.tokenCharacters * 3)
  try {
    return decodeURIComponent(boundedValue).slice(0, TABLE_QUERY_LIMITS.tokenCharacters)
  } catch {
    return boundedValue.slice(0, TABLE_QUERY_LIMITS.tokenCharacters)
  }
}

const encodeToken = (value: unknown) => encodeURIComponent(String(value).slice(0, TABLE_QUERY_LIMITS.tokenCharacters))

const isSafeObjectKey = (value: string) => value.length > 0 && !UNSAFE_OBJECT_KEYS.has(value)

const uniqueBoundedTokens = (values: string[], limit: number, requireSafeObjectKey = false) => {
  const result: string[] = []
  const seen = new Set<string>()

  for (const value of values) {
    const token = decodeToken(value)
    if (token.length === 0 || (requireSafeObjectKey && !isSafeObjectKey(token)) || seen.has(token)) {
      continue
    }
    seen.add(token)
    result.push(token)
    if (result.length === limit) break
  }

  return result
}

// Pagination parsers are deliberately bounded. Rendering more rows should use
// server pagination or virtualization instead of a query-string override.
export const createPaginationParser = (defaultPageSize = 100) => {
  const safeDefaultPageSize = clampInteger(defaultPageSize, 100, 1, TABLE_QUERY_LIMITS.pageSize)

  return {
    pageIndex: {
      parse: (value: string | null) => clampInteger(value, 0, 0, TABLE_QUERY_LIMITS.pageIndex),
      serialize: (value: number) => String(clampInteger(value, 0, 0, TABLE_QUERY_LIMITS.pageIndex)),
      defaultValue: 0
    },
    pageSize: {
      parse: (value: string | null) => clampInteger(value, safeDefaultPageSize, 1, TABLE_QUERY_LIMITS.pageSize),
      serialize: (value: number) => String(clampInteger(value, safeDefaultPageSize, 1, TABLE_QUERY_LIMITS.pageSize)),
      defaultValue: safeDefaultPageSize
    }
  }
}

export const paginationParser = createPaginationParser(100)

export const createLoadedCountParser = (defaultLoadedCount = 100) => {
  const safeDefault = clampInteger(defaultLoadedCount, 100, 0, TABLE_QUERY_LIMITS.loadedRows)

  return {
    parse: (value: string | null): number => clampInteger(value, safeDefault, 0, TABLE_QUERY_LIMITS.loadedRows),
    serialize: (value: number): string => String(clampInteger(value, safeDefault, 0, TABLE_QUERY_LIMITS.loadedRows)),
    defaultValue: safeDefault
  }
}

export const searchParser = {
  parse: (value: string | null) => (value ?? '').slice(0, TABLE_QUERY_LIMITS.searchCharacters),
  serialize: (value: string) => value.slice(0, TABLE_QUERY_LIMITS.searchCharacters),
  defaultValue: ''
}

// Sorting format: "encoded-column-id:asc" or "encoded-column-id:desc".
export const createSortingParser = () => ({
  parse: (value: string | null): SortingState => {
    const [rawId, direction] = trimStateValue(value).split(':')
    const id = decodeToken(rawId ?? '')

    if (!isSafeObjectKey(id) || (direction !== 'asc' && direction !== 'desc')) {
      return []
    }

    return [{ id, desc: direction === 'desc' }]
  },
  serialize: (value: SortingState): string => {
    const sort = value?.[0]
    if (!sort || !isSafeObjectKey(sort.id)) return ''
    return `${encodeToken(sort.id)}:${sort.desc ? 'desc' : 'asc'}`
  },
  defaultValue: [] as SortingState
})

// Column filters format:
// "encoded-id:encoded-value,encoded-value|encoded-id:".
// A missing key means `defaultColumnFilters`; clearing every filter serializes
// to an empty value, which parses back to no filters rather than the default.
export const createColumnFiltersParser = (defaultColumnFilters: ColumnFiltersState = []) => ({
  parse: (value: string | null): ColumnFiltersState => {
    const filters: ColumnFiltersState = []
    const seenColumnIds = new Set<string>()
    const groups = trimStateValue(value).split('|').slice(0, TABLE_QUERY_LIMITS.columnFilters)

    for (const group of groups) {
      const colonIndex = group.indexOf(':')
      const rawColumnId = colonIndex >= 0 ? group.slice(0, colonIndex) : group
      const columnId = decodeToken(rawColumnId)

      if (!isSafeObjectKey(columnId) || seenColumnIds.has(columnId)) continue

      const rawValues = colonIndex >= 0 ? group.slice(colonIndex + 1) : ''
      // Filter values are positional for range filters, so keep empty and
      // duplicate entries (for example `updatedAt:,2026-09-01`).
      const values = rawValues
        ? rawValues.split(',').slice(0, TABLE_QUERY_LIMITS.filterValuesPerColumn).map(decodeToken)
        : []

      seenColumnIds.add(columnId)
      filters.push({ id: columnId, value: values })
    }

    return filters
  },
  serialize: (value: ColumnFiltersState): string => {
    if (!value?.length) return ''

    return value
      .slice(0, TABLE_QUERY_LIMITS.columnFilters)
      .filter((filter) => isSafeObjectKey(filter.id))
      .map((filter) => {
        const values = Array.isArray(filter.value)
          ? filter.value.slice(0, TABLE_QUERY_LIMITS.filterValuesPerColumn).map(encodeToken)
          : []
        return `${encodeToken(filter.id)}:${values.join(',')}`
      })
      .join('|')
      .slice(0, TABLE_QUERY_LIMITS.serializedStateCharacters)
  },
  defaultValue: defaultColumnFilters,
  eq: (left: ColumnFiltersState, right: ColumnFiltersState) => JSON.stringify(left) === JSON.stringify(right)
})

// Column visibility format: "encoded-id" for hidden columns and
// "encoded-id:1" for columns explicitly shown over a hidden default.
export const createColumnVisibilityParser = (defaultColumnVisibility: VisibilityState = {}) => ({
  parse: (value: string | null): VisibilityState => {
    if (!value) return defaultColumnVisibility

    const visibility: VisibilityState = { ...defaultColumnVisibility }
    const entries = trimStateValue(value).split(',').slice(0, TABLE_QUERY_LIMITS.visibilityEntries)

    for (const entry of entries) {
      const separatorIndex = entry.lastIndexOf(':')
      const hasExplicitValue = separatorIndex >= 0
      const rawId = hasExplicitValue ? entry.slice(0, separatorIndex) : entry
      const id = decodeToken(rawId)

      if (!isSafeObjectKey(id)) continue
      const visibilityValue = hasExplicitValue ? entry.slice(separatorIndex + 1) : ''
      visibility[id] = visibilityValue === '1' || visibilityValue === 'true'
    }

    return visibility
  },
  serialize: (value: VisibilityState): string => {
    if (!value) return ''

    const columnIds = new Set([...Object.keys(defaultColumnVisibility), ...Object.keys(value)])

    return Array.from(columnIds)
      .filter(isSafeObjectKey)
      .slice(0, TABLE_QUERY_LIMITS.visibilityEntries)
      .flatMap((id) => {
        const visible = value[id] !== false
        const defaultVisible = defaultColumnVisibility[id] !== false
        if (visible === defaultVisible) return []
        return visible ? `${encodeToken(id)}:1` : encodeToken(id)
      })
      .join(',')
      .slice(0, TABLE_QUERY_LIMITS.serializedStateCharacters)
  },
  defaultValue: defaultColumnVisibility,
  eq: (left: VisibilityState, right: VisibilityState) => {
    const columnIds = new Set([...Object.keys(left), ...Object.keys(right)])
    return Array.from(columnIds).every((id) => (left[id] !== false) === (right[id] !== false))
  }
})

// Column order format: comma-separated, individually encoded column IDs.
export const createColumnOrderParser = () => ({
  parse: (value: string | null): ColumnOrderState =>
    uniqueBoundedTokens(trimStateValue(value).split(','), TABLE_QUERY_LIMITS.visibilityEntries, true),
  serialize: (value: ColumnOrderState): string =>
    (value ?? [])
      .filter(isSafeObjectKey)
      .slice(0, TABLE_QUERY_LIMITS.visibilityEntries)
      .map(encodeToken)
      .join(',')
      .slice(0, TABLE_QUERY_LIMITS.serializedStateCharacters),
  defaultValue: [] as ColumnOrderState,
  eq: (left: ColumnOrderState, right: ColumnOrderState) =>
    left.length === right.length && left.every((id, index) => id === right[index])
})

// Column widths format: "encoded-id:width,encoded-id:width" in pixels.
export const createColumnSizingParser = () => {
  const serialize = (value: ColumnSizingState): string => Object.entries(value)
    .filter(([id, width]) => isSafeObjectKey(id) && Number.isFinite(width) && width > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, TABLE_QUERY_LIMITS.visibilityEntries)
    .map(([id, width]) => `${encodeToken(id)}:${width}`)
    .join(',')
    .slice(0, TABLE_QUERY_LIMITS.serializedStateCharacters)

  return {
    parse: (value: string | null): ColumnSizingState => {
      const sizing: ColumnSizingState = {}
      for (const entry of trimStateValue(value).split(',').slice(0, TABLE_QUERY_LIMITS.visibilityEntries)) {
        const separatorIndex = entry.lastIndexOf(':')
        if (separatorIndex < 0) continue
        const id = decodeToken(entry.slice(0, separatorIndex))
        const width = Number(entry.slice(separatorIndex + 1))
        if (isSafeObjectKey(id) && Number.isFinite(width) && width > 0) sizing[id] = width
      }
      return sizing
    },
    serialize,
    defaultValue: {} as ColumnSizingState,
    eq: (left: ColumnSizingState, right: ColumnSizingState) => serialize(left) === serialize(right)
  }
}

// Row selection format: comma-separated, individually encoded stable row IDs.
export const createRowSelectionParser = () => ({
  parse: (value: string | null): RowSelectionState => {
    const selectedIds = uniqueBoundedTokens(trimStateValue(value).split(','), TABLE_QUERY_LIMITS.persistedRowIds, true)
    const selection: RowSelectionState = {}

    for (const id of selectedIds) {
      selection[id] = true
    }

    return selection
  },
  serialize: (value: RowSelectionState): string => {
    if (!value) return ''

    return Object.keys(value)
      .filter((id) => value[id] === true && isSafeObjectKey(id))
      .slice(0, TABLE_QUERY_LIMITS.persistedRowIds)
      .map(encodeToken)
      .join(',')
      .slice(0, TABLE_QUERY_LIMITS.serializedStateCharacters)
  },
  defaultValue: {} as RowSelectionState
})

// Row pinning format: comma-separated, individually encoded top-pinned row IDs.
export const createRowPinningParser = () => ({
  parse: (value: string | null): RowPinningState => ({
    top: uniqueBoundedTokens(trimStateValue(value).split(','), TABLE_QUERY_LIMITS.persistedRowIds, true),
    bottom: []
  }),
  serialize: (value: RowPinningState): string =>
    (value?.top ?? [])
      .filter(isSafeObjectKey)
      .slice(0, TABLE_QUERY_LIMITS.persistedRowIds)
      .map(encodeToken)
      .join(',')
      .slice(0, TABLE_QUERY_LIMITS.serializedStateCharacters),
  defaultValue: { top: [], bottom: [] } as RowPinningState
})

export const selectModeParser = parseAsStringEnum(['true', 'false']).withDefault('true')
