import { startOfDay, startOfMonth, subDays, subHours } from 'date-fns'
import { getFilterValueLabel, getFilterValueToken } from './filter-utils.ts'
import type { FilterListColumn } from './table-contract.ts'
import { getRangeBounds, getRangeDate, getRangeInputValue, isOpenRangeBound } from './filter-ranges.ts'


interface FilterDefinitionBase {
  /** Must name a real column, otherwise the filter silently disappears. */
  id: string
  label: string
}

export interface FacetedFilterDefinition extends FilterDefinitionBase {
  variant: 'faceted'
  /** Declared option order. Omitted, the options come from the faceted values. */
  values?: readonly unknown[]
  getValueLabel?: (value: unknown) => string
}

export interface NumberRangeFilterDefinition extends FilterDefinitionBase {
  variant: 'number-range'
  min?: number
  max?: number
  step?: number
  /** Suffix shown after the two bounds, e.g. `meters`. */
  unit?: string
}

export interface DateRangeFilterDefinition extends FilterDefinitionBase {
  variant: 'date-range'
  /** Defaults to `DATE_PRESETS`. */
  presets?: readonly DatePreset[]
}

export type FilterDefinition = FacetedFilterDefinition | NumberRangeFilterDefinition | DateRangeFilterDefinition

export interface FilterOption {
  count: number
  label: string
  value: string
}

export interface DatePreset {
  id: string
  label: string
  getStart: () => Date
}

export const titleCase = (value: unknown) =>
  String(value)
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())

/**
 * Every preset is open-ended at the top, so only the lower bound has to be
 * recognised when the panel is reopened.
 */
export const DATE_PRESETS: readonly DatePreset[] = [
  { id: 'last-hour', label: 'Last Hour', getStart: () => subHours(new Date(), 1) },
  { id: 'last-24-hours', label: 'Last 24 Hours', getStart: () => subHours(new Date(), 24) },
  { id: 'last-7-days', label: 'Last 7 Days', getStart: () => startOfDay(subDays(new Date(), 6)) },
  { id: 'last-30-days', label: 'Last 30 Days', getStart: () => startOfDay(subDays(new Date(), 29)) },
  { id: 'this-month', label: 'This Month', getStart: () => startOfMonth(new Date()) }
]

// The day-aligned presets round-trip exactly; the two relative ones drift by
// however long the popover has been sitting open, so matching is fuzzy.
const DATE_PRESET_TOLERANCE_MS = 5 * 60 * 1000

export const matchDatePreset = (value: unknown, presets: readonly DatePreset[] = DATE_PRESETS) => {
  const [rawFrom, rawTo] = getRangeBounds(value)
  if (!isOpenRangeBound(rawTo)) return undefined

  const from = getRangeDate(rawFrom)
  if (!from) return undefined

  return presets.find((preset) => Math.abs(preset.getStart().getTime() - from.getTime()) <= DATE_PRESET_TOLERANCE_MS)
}

export const getSelectedValues = (rawFilterValue: unknown): readonly unknown[] =>
  Array.isArray(rawFilterValue) ? rawFilterValue : rawFilterValue === undefined ? [] : [rawFilterValue]

export const getFilterOptions = (
  column: FilterListColumn,
  definition: FacetedFilterDefinition,
  selectedValues: readonly unknown[]
): FilterOption[] => {
  const countByValue = new Map<string, number>()
  const rawValueByToken = new Map<string, unknown>()

  for (const [rawValue, count] of column.getFacetedUniqueValues()) {
    const token = getFilterValueToken(rawValue)
    if (!token) continue

    countByValue.set(token, (countByValue.get(token) ?? 0) + count)
    if (!rawValueByToken.has(token)) rawValueByToken.set(token, rawValue)
  }

  for (const selectedValue of selectedValues) {
    const token = getFilterValueToken(selectedValue)
    if (token && !rawValueByToken.has(token)) rawValueByToken.set(token, selectedValue)
  }

  const options = new Map<string, FilterOption>()
  const addOption = (rawValue: unknown) => {
    const value = getFilterValueToken(rawValue)
    if (!value || options.has(value)) return

    options.set(value, {
      count: countByValue.get(value) ?? 0,
      label: definition.getValueLabel?.(rawValue) ?? getFilterValueLabel(rawValue),
      value
    })
  }

  for (const rawValue of definition.values ?? rawValueByToken.values()) addOption(rawValue)

  // A declared list can fall behind the data, but a value someone already
  // selected still has to render or it can never be unselected.
  if (definition.values) {
    for (const selectedValue of selectedValues) addOption(selectedValue)
  }

  const resolvedOptions = Array.from(options.values())
  // A declared value list is already in a meaningful order; a derived one is not.
  return definition.values ? resolvedOptions : resolvedOptions.sort((left, right) => left.label.localeCompare(right.label))
}

export const getActiveFilterCount = (definition: FilterDefinition, value: unknown) => {
  if (definition.variant === 'faceted') {
    return Array.isArray(value) ? (value.length > 0 ? 1 : 0) : value === undefined ? 0 : 1
  }

  const [min, max] = getRangeBounds(value)
  return isOpenRangeBound(min) && isOpenRangeBound(max) ? 0 : 1
}

/**
 * The short line the root list shows on the right of a row, so an active
 * filter stays readable without drilling into it.
 */
export const getFilterSummary = (definition: FilterDefinition, value: unknown) => {
  if (definition.variant === 'faceted') {
    const selected = getSelectedValues(value)
    if (selected.length === 0) return ''
    if (selected.length > 1) return `${selected.length} selected`
    return definition.getValueLabel?.(selected[0]) ?? getFilterValueLabel(selected[0])
  }

  const [min, max] = getRangeBounds(value)
  if (isOpenRangeBound(min) && isOpenRangeBound(max)) return ''

  if (definition.variant === 'date-range') return matchDatePreset(value, definition.presets)?.label ?? 'Custom'

  const minLabel = getRangeInputValue(min) || 'Any'
  const maxLabel = getRangeInputValue(max) || 'Any'
  return `${minLabel} – ${maxLabel}`
}
