export const mergeColumnOrder = (currentOrder: readonly string[], reorderedColumnIds: readonly string[]): string[] => {
  const reorderedColumnIdSet = new Set(reorderedColumnIds)
  let reorderedIndex = 0

  return currentOrder.map((columnId) => {
    if (!reorderedColumnIdSet.has(columnId)) return columnId

    const reorderedColumnId = reorderedColumnIds[reorderedIndex]
    reorderedIndex += 1
    return reorderedColumnId ?? columnId
  })
}
