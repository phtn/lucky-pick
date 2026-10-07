export type RowDropPosition = 'after' | 'before'

export interface ReorderRowsResult<T> {
  fromIndex: number
  movedRow: T
  rows: T[]
  toIndex: number
}

interface RowDragOffsetArgs {
  activeIndex: number
  rowIndex: number
  targetIndex: number
}

export const getRowDragOffset = ({ activeIndex, rowIndex, targetIndex }: RowDragOffsetArgs): number => {
  if (activeIndex < 0 || targetIndex < 0 || rowIndex < 0 || activeIndex === targetIndex || rowIndex === activeIndex) {
    return 0
  }

  const isMovingDown = targetIndex > activeIndex
  const direction = isMovingDown ? -1 : 1
  const isInPath = isMovingDown
    ? rowIndex > activeIndex && rowIndex <= targetIndex
    : rowIndex >= targetIndex && rowIndex < activeIndex

  if (rowIndex === targetIndex) {
    return direction * 7
  }

  if (isInPath) {
    return direction * 4
  }

  if (Math.abs(rowIndex - targetIndex) === 1) {
    return direction * 2
  }

  return 0
}

export const reorderRows = <T>(
  rows: T[],
  getRowId: (row: T, index: number) => string,
  draggedRowId: string,
  targetRowId: string,
  position: RowDropPosition
): ReorderRowsResult<T> | null => {
  const fromIndex = rows.findIndex((row, index) => getRowId(row, index) === draggedRowId)
  const targetIndex = rows.findIndex((row, index) => getRowId(row, index) === targetRowId)

  if (fromIndex < 0 || targetIndex < 0 || fromIndex === targetIndex) {
    return null
  }

  const nextRows = [...rows]
  const [movedRow] = nextRows.splice(fromIndex, 1)
  const targetIndexAfterRemoval = targetIndex - (fromIndex < targetIndex ? 1 : 0)
  const toIndex = targetIndexAfterRemoval + (position === 'after' ? 1 : 0)

  if (toIndex === fromIndex) {
    return null
  }

  nextRows.splice(toIndex, 0, movedRow)

  return {
    fromIndex,
    movedRow,
    rows: nextRows,
    toIndex
  }
}
