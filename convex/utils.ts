/** Trims a value and collapses an empty result to `null`, which is storable. */
export const trimOrNull = (value: string | null | undefined) => {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed.length === 0 ? null : trimmed
}
