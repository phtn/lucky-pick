import type { ColumnVisibilityState } from '@octanejs/tanstack-table'

export const RETAINED_COLUMN_MODEL_VISIBILITY: ColumnVisibilityState = Object.freeze({})

interface VisibilityAwareColumn {
  getIsVisible: () => boolean
  getSize: () => number
}

export const isColumnVisible = (columnId: string, columnVisibility: ColumnVisibilityState, canHide = true) =>
  !canHide || columnVisibility[columnId] !== false
export const getVisibleColumnsSize = (columns: readonly VisibilityAwareColumn[]) =>
  columns.reduce((total, column) => total + column.getSize(), 0)

export const areVisibilityStatesEqual = (left: ColumnVisibilityState, right: ColumnVisibilityState) => {
  const leftHidden = Object.keys(left).filter((key) => left[key] === false)
  const rightHidden = Object.keys(right).filter((key) => right[key] === false)

  return leftHidden.length === rightHidden.length && leftHidden.every((key) => right[key] === false)
}

export const resolveColumnVisibilityUpdate = (
  current: ColumnVisibilityState,
  updater: ColumnVisibilityState | ((current: ColumnVisibilityState) => ColumnVisibilityState)
) => (typeof updater === 'function' ? updater(current) : updater)

export const reconcileColumnVisibility = (
  current: ColumnVisibilityState,
  incoming: ColumnVisibilityState,
  pending: ColumnVisibilityState | null
) => {
  if (pending && !areVisibilityStatesEqual(incoming, pending)) {
    return current
  }

  return areVisibilityStatesEqual(current, incoming) ? current : incoming
}
