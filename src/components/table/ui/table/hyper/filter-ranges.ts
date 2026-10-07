import { constructFilterFn, filterFn_inNumberRange } from '@octanejs/tanstack-table'
import { endOfDay, startOfDay } from 'date-fns'

export const OPEN_RANGE_BOUND = '*'

export const accuracyScoreRangeFilterFn = constructFilterFn({
  ...filterFn_inNumberRange,
  resolveDataValue: (value) => (typeof value === 'number' && Number.isFinite(value) ? 20 - value : Number.NaN)
})

export const isOpenRangeBound = (value: unknown) =>
  value === undefined ||
  value === null ||
  value === '' ||
  value === OPEN_RANGE_BOUND ||
  value === 'undefined' ||
  value === 'null'

export const getRangeBounds = (value: unknown): [unknown, unknown] =>
  Array.isArray(value) ? [value[0], value[1]] : [undefined, undefined]

export const getRangeInputValue = (value: unknown) => (isOpenRangeBound(value) ? '' : String(value))

export const createRangeFilterValue = (min: string, max: string): [string, string] | undefined => {
  if (!min && !max) return undefined
  return [min || OPEN_RANGE_BOUND, max || OPEN_RANGE_BOUND]
}

export const createInclusiveDateRangeFilterValue = (from: Date | undefined, to: Date | undefined) =>
  createRangeFilterValue(from ? startOfDay(from).toISOString() : '', to ? endOfDay(to).toISOString() : '')

export const getRangeDate = (value: unknown) => {
  if (isOpenRangeBound(value)) return undefined

  const numericTimestamp = typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value) ? Number(value) : value
  const date = new Date(numericTimestamp as string | number | Date)
  return Number.isNaN(date.getTime()) ? undefined : date
}
