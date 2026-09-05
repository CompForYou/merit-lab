/**
 * Small statistical helpers. Separated so the compensation functions read as
 * compensation logic rather than array arithmetic.
 *
 * Both ignore nothing and assume the caller has already filtered out nulls —
 * silently skipping values would hide missing data.
 */

/** Arithmetic mean. Returns null for an empty set. */
export function mean(values: number[]): number | null {
  if (values.length === 0) return null
  const total = values.reduce((sum, v) => sum + v, 0)
  return total / values.length
}

/**
 * Median. Returns null for an empty set.
 * Even-sized sets return the mean of the two middle values.
 * Does not modify the caller's array.
 */
export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)

  if (sorted.length % 2 === 1) return sorted[middle]
  return (sorted[middle - 1] + sorted[middle]) / 2
}
