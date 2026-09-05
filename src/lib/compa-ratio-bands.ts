import type { CompaRatioBand } from '../types/domain'

/**
 * Default compa-ratio bands, from docs/SPEC.md section 6:
 * below 0.80, 0.80-0.90, 0.90-1.00, 1.00-1.10, above 1.10.
 *
 * These are compa-ratio bands, NOT quartiles of the range. Quartiles would be
 * four divisions of range penetration, which is a different measure entirely.
 * The boundaries below are exactly as the spec states them; only the label is
 * corrected.
 *
 * Boundaries are INCLUSIVE at the lower bound and EXCLUSIVE at the upper.
 */
export const DEFAULT_COMPA_RATIO_BANDS: CompaRatioBand[] = [
  { id: 'band-below-080', label: 'Below 0.80', lowerBound: null, upperBound: 0.8 },
  { id: 'band-080-090', label: '0.80 - 0.90', lowerBound: 0.8, upperBound: 0.9 },
  { id: 'band-090-100', label: '0.90 - 1.00', lowerBound: 0.9, upperBound: 1.0 },
  { id: 'band-100-110', label: '1.00 - 1.10', lowerBound: 1.0, upperBound: 1.1 },
  { id: 'band-above-110', label: 'Above 1.10', lowerBound: 1.1, upperBound: null },
]

/**
 * Assign a compa-ratio to its band.
 *
 * Lower bound inclusive, upper bound exclusive: a compa-ratio of exactly 0.90
 * belongs to the 0.90-1.00 band. A null lowerBound is unbounded below; a null
 * upperBound is unbounded above.
 *
 * Returns null when the compa-ratio could not be calculated (a missing or zero
 * midpoint), or when the supplied bands leave the value uncovered. The caller
 * must handle a null explicitly rather than defaulting the employee into a cell.
 */
export function assignCompaRatioBand(
  compaRatio: number | null,
  bands: CompaRatioBand[] = DEFAULT_COMPA_RATIO_BANDS,
): CompaRatioBand | null {
  if (compaRatio === null || !Number.isFinite(compaRatio)) return null

  for (const band of bands) {
    const aboveLower = band.lowerBound === null || compaRatio >= band.lowerBound
    const belowUpper = band.upperBound === null || compaRatio < band.upperBound
    if (aboveLower && belowUpper) return band
  }
  return null
}
