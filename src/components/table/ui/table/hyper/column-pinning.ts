import type { ColumnPinningPosition, ColumnPinningState, ColumnVisibilityState } from '@octanejs/tanstack-table'
import type { CSSProperties } from 'octane'
import { isColumnVisible } from './visibility.ts'

/**
 * The offsets a pinned cell needs, as a plain object.
 *
 * Deliberately not `JSX.IntrinsicElements['td']['style']`: that is the type of
 * the *attribute*, which resolves to `BoundStyle<string | CSSProperties |
 * undefined>` and so cannot be spread — callers that merge in their own width
 * would fail with "Spread types may only be created from object types".
 */
export type PinnedColumnStyle = Pick<CSSProperties, 'insetInlineStart' | 'insetInlineEnd'>

export type DefaultColumnPinningPosition = Exclude<ColumnPinningPosition, false>

interface DeclarativePinnedColumn {
  id: string
  defaultPinned?: DefaultColumnPinningPosition
  enablePinning?: boolean
}

interface ColumnLike {
  id: string
}

interface SizedColumnLike extends ColumnLike {
  columnDef?: {
    maxSize?: number
    minSize?: number
    size?: number
  }
  getCanHide: () => boolean
  getSize?: () => number
}

export interface PinnedColumnLayout {
  isBoundary: boolean
  offset: number
  position: DefaultColumnPinningPosition
}

const DEFAULT_COLUMN_SIZE = 40
const DEFAULT_MIN_COLUMN_SIZE = 40
const DEFAULT_MAX_COLUMN_SIZE = Number.MAX_SAFE_INTEGER

export const getColumnSize = (column: SizedColumnLike) => {
  if (typeof column.getSize === 'function') return column.getSize()

  const size = column.columnDef?.size ?? DEFAULT_COLUMN_SIZE
  const minSize = column.columnDef?.minSize ?? DEFAULT_MIN_COLUMN_SIZE
  const maxSize = column.columnDef?.maxSize ?? DEFAULT_MAX_COLUMN_SIZE
  return Math.min(Math.max(minSize, size), maxSize)
}

export const getDefaultColumnPinning = (columns: readonly DeclarativePinnedColumn[]): ColumnPinningState => ({
  start: columns
    .filter((column) => column.defaultPinned === 'start' && column.enablePinning !== false)
    .map((column) => column.id),
  end: columns
    .filter((column) => column.defaultPinned === 'end' && column.enablePinning !== false)
    .map((column) => column.id)
})

const orderByColumnPinning = <T>(
  items: readonly T[],
  columnPinning: ColumnPinningState,
  getColumnId: (item: T) => string
) => {
  const itemsByColumnId = new Map(items.map((item) => [getColumnId(item), item] as const))
  const ordered: T[] = []
  const addedColumnIds = new Set<string>()
  const startColumnIds = new Set(columnPinning.start)
  const endColumnIds = new Set(columnPinning.end)

  const addColumn = (columnId: string) => {
    const item = itemsByColumnId.get(columnId)
    if (!item || addedColumnIds.has(columnId)) return

    addedColumnIds.add(columnId)
    ordered.push(item)
  }

  columnPinning.start.forEach(addColumn)
  items.forEach((item) => {
    const columnId = getColumnId(item)
    if (!startColumnIds.has(columnId) && !endColumnIds.has(columnId)) {
      addColumn(columnId)
    }
  })
  columnPinning.end.forEach(addColumn)

  return ordered
}

export const orderColumnsByPinning = <T extends ColumnLike>(columns: readonly T[], columnPinning: ColumnPinningState) =>
  orderByColumnPinning(columns, columnPinning, (column) => column.id)

export const orderCellsByColumnPinning = <T extends { column: ColumnLike }>(
  cells: readonly T[],
  columnPinning: ColumnPinningState
) => orderByColumnPinning(cells, columnPinning, (cell) => cell.column.id)

export const getPinnedColumnLayouts = (
  columns: readonly SizedColumnLike[],
  columnPinning: ColumnPinningState,
  columnVisibility: ColumnVisibilityState
): ReadonlyMap<string, PinnedColumnLayout> => {
  const columnsById = new Map(columns.map((column) => [column.id, column] as const))
  const seenColumnIds = new Set<string>()
  const startColumns = columnPinning.start.flatMap((columnId) => {
    const column = columnsById.get(columnId)
    if (!column || seenColumnIds.has(columnId)) return []

    seenColumnIds.add(columnId)
    return [column]
  })
  const endColumns = columnPinning.end.flatMap((columnId) => {
    const column = columnsById.get(columnId)
    if (!column || seenColumnIds.has(columnId)) return []

    seenColumnIds.add(columnId)
    return [column]
  })
  const isVisible = (column: SizedColumnLike) => isColumnVisible(column.id, columnVisibility, column.getCanHide())
  let startBoundaryId: string | undefined
  for (const column of startColumns) {
    if (isVisible(column)) startBoundaryId = column.id
  }
  const endBoundaryId = endColumns.find(isVisible)?.id
  const layouts = new Map<string, PinnedColumnLayout>()

  let startOffset = 0
  for (const column of startColumns) {
    layouts.set(column.id, {
      isBoundary: column.id === startBoundaryId,
      offset: startOffset,
      position: 'start'
    })
    if (isVisible(column)) startOffset += getColumnSize(column)
  }

  let endOffset = 0
  for (let index = endColumns.length - 1; index >= 0; index -= 1) {
    const column = endColumns[index]
    layouts.set(column.id, {
      isBoundary: column.id === endBoundaryId,
      offset: endOffset,
      position: 'end'
    })
    if (isVisible(column)) endOffset += getColumnSize(column)
  }

  return layouts
}

// Every rendered cell in a pinned column shares the one layout object that
// `getPinnedColumnLayouts` produced for it, so one style object per layout is
// enough. Caching keeps that object reference-stable across rows and renders,
// which lets the renderer skip re-applying the inline style entirely.
const pinnedColumnStyles = new WeakMap<PinnedColumnLayout, PinnedColumnStyle>()

export const getPinnedColumnStyle = (layout: PinnedColumnLayout | undefined): PinnedColumnStyle | undefined => {
  if (!layout) return undefined

  const cached = pinnedColumnStyles.get(layout)
  if (cached) return cached

  const style: PinnedColumnStyle =
    layout.position === 'start' ? { insetInlineStart: layout.offset } : { insetInlineEnd: layout.offset }
  pinnedColumnStyles.set(layout, style)

  return style
}
