import type {
  BuiltInFilterFn,
  Column,
  ColumnFilter,
  ColumnFiltersState,
  PaginationState,
  RowData,
  SortingState,
  TableFeatures
} from '@octanejs/tanstack-table'
import type { features } from './hyper/features.ts'

export type TableFilterFeatures<TFeatures extends TableFeatures> = Pick<
  TFeatures,
  'columnFilteringFeature' | 'columnFacetingFeature'
>

export type FilterOperator =
  | BuiltInFilterFn
  | 'notIncludesString'
  | 'notEqualsString'
  | 'notEquals'
  | 'greaterThan'
  | 'notGreaterThan'
  | 'greaterThanOrEqualTo'
  | 'notGreaterThanOrEqualTo'
  | 'lessThan'
  | 'notLessThan'
  | 'lessThanOrEqualTo'
  | 'notLessThanOrEqualTo'
  | 'isRelativeToToday'
  | 'inRange'
  | 'startsWith'
  | 'endsWith'
  | 'isEmpty'
  | 'isNotEmpty'

export type JoinOperator = 'and' | 'or'

export interface ExtendedColumnFilter extends ColumnFilter {
  filterId?: string
  operator?: FilterOperator
  joinOperator?: JoinOperator
}

export interface TableToolbarContext<T> {
  getFilteredData: () => T[]
}

export interface BulkUpdateSelectionArgs<T extends RowData> {
  ids: string[]
  rows: T[]
  updates: Partial<T>
}

export interface RowReorderArgs<T extends RowData> {
  fromIndex: number
  movedRow: T
  rows: T[]
  toIndex: number
}

export interface DataTableQueryState {
  columnFilters: ColumnFiltersState
  globalFilter: string
  pagination: PaginationState
  sorting: SortingState
}

// Generic over the feature set: the shared `features` above is one table's
// configuration, but a filter list is rendered against whichever features its
// own table was built with (e.g. `snapsFeatures`).
export interface DataTableFilterListProps<T extends RowData, TFeatures extends TableFeatures = typeof features> {
  columns: Column<TFeatures, T, unknown>[]
  columnFilters: ColumnFiltersState
  onReset: () => void
  /** Whether the filters differ from the table's defaults; falls back to "any filter is active". */
  canReset?: boolean
}

export type RowIdAccessor<T extends RowData> = keyof T | ((row: T, index: number) => string | number | null | undefined)
