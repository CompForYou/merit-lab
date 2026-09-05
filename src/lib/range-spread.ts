/**
 * Range spread — the width of a grade's range as a proportion of its minimum.
 *
 *   rangeSpread = (gradeMax - gradeMin) / gradeMin
 *
 * Returned as a decimal: 0.50 is a 50% spread. A property of the structure only;
 * no employee data is involved.
 *
 * Returns null when the minimum is zero or negative (the denominator is undefined)
 * or when the range is inverted.
 */
export function calculateRangeSpread(
  gradeMin: number,
  gradeMax: number,
): number | null {
  if (!Number.isFinite(gradeMin) || !Number.isFinite(gradeMax)) return null
  if (gradeMin <= 0) return null
  if (gradeMax < gradeMin) return null

  return (gradeMax - gradeMin) / gradeMin
}
