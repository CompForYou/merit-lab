import type { Grade } from '../types/domain'

/**
 * Midpoint progression — the percentage step between adjacent grade midpoints.
 *
 *   midpointProgression = (midpointOfGrade - midpointOfGradeBelow) / midpointOfGradeBelow
 *
 * Returned as a decimal: 0.15 is a 15% step. A property of the structure only.
 *
 * NOT clamped. If a higher-ordered grade has a lower midpoint than the grade
 * beneath it, the result is negative. That is a real structural anomaly and the
 * tool surfaces it rather than hiding it.
 *
 * Returns null when the lower midpoint is zero or negative.
 */
export function calculateMidpointProgression(
  midpointOfGradeBelow: number,
  midpointOfGrade: number,
): number | null {
  if (!Number.isFinite(midpointOfGradeBelow)) return null
  if (!Number.isFinite(midpointOfGrade)) return null
  if (midpointOfGradeBelow <= 0) return null

  return (midpointOfGrade - midpointOfGradeBelow) / midpointOfGradeBelow
}

/** One adjacent-grade step in a salary structure. */
export interface GradeProgression {
  lowerGradeId: string
  higherGradeId: string
  lowerGradeName: string
  higherGradeName: string
  progression: number | null
}

/**
 * Midpoint progression for every adjacent pair in a structure, walked in
 * `order` sequence (1 = lowest). A structure of N grades yields N-1 steps.
 *
 * Ordering comes from the explicit `order` field, never from midpoint. The input
 * array may be in any sequence; it is sorted here and the caller's array is not
 * modified.
 */
export function calculateStructureProgressions(grades: Grade[]): GradeProgression[] {
  const ordered = [...grades].sort((a, b) => a.order - b.order)

  const progressions: GradeProgression[] = []
  for (let i = 1; i < ordered.length; i++) {
    const below = ordered[i - 1]
    const current = ordered[i]
    progressions.push({
      lowerGradeId: below.id,
      higherGradeId: current.id,
      lowerGradeName: below.name,
      higherGradeName: current.name,
      progression: calculateMidpointProgression(below.mid, current.mid),
    })
  }
  return progressions
}
