import type { EmployeeMeritResult } from './merit-increase'
import type { Grade } from '../types/domain'
import { median } from './statistics'

/**
 * Below this headcount a grade median is too unstable to flag on. The pair is
 * still reported, with its headcounts visible, but it is never flagged: one
 * person moving in a three-person grade swings the median enough to cry wolf.
 */
export const MIN_HEADCOUNT_FOR_COMPRESSION_FLAG = 5

/**
 * One adjacent-grade differential, before and after the cycle.
 *
 * The differential is expressed as a percentage of the lower grade's median:
 *
 *   differential = (higherMedian - lowerMedian) / lowerMedian
 *
 * A percentage rather than dollars, because the flag threshold is stated in
 * percentage points and dollars cannot narrow by percentage points.
 *
 * Medians are taken on full-time equivalent salary. A part-time employee's
 * actual pay is not comparable to a full-time employee's, and leaving them
 * ungrossed would drag a grade median down for reasons unrelated to pay level.
 */
export interface CompressionPair {
  lowerGradeId: string
  lowerGradeName: string
  higherGradeId: string
  higherGradeName: string

  lowerHeadcount: number
  higherHeadcount: number

  lowerMedianBefore: number | null
  higherMedianBefore: number | null
  differentialBefore: number | null

  lowerMedianAfter: number | null
  higherMedianAfter: number | null
  differentialAfter: number | null

  /** After minus before. Negative means the differential narrowed. */
  differentialChange: number | null

  /** Narrowed by more than the threshold, on grades large enough to trust. */
  flagged: boolean
  /** Either grade is too small for its median to be meaningful. */
  belowHeadcountThreshold: boolean
}

/**
 * Compression INDICATOR for every adjacent grade pair.
 *
 * This is an indicator, not a compression analysis. Real compression work needs
 * manager, tenure, and hire-date context this tool does not take. It says only
 * that the median gap between two adjacent grades narrowed; it does not say why,
 * and it should not be presented as though it does.
 *
 * Pairs are adjacent by declared `order`, never by midpoint.
 */
export function calculateCompressionIndicators(
  results: EmployeeMeritResult[],
  grades: Grade[],
  threshold: number,
): CompressionPair[] {
  const ordered = [...grades].sort((a, b) => a.order - b.order)

  // Full-time equivalent salaries per grade, before and after.
  const beforeByGrade = new Map<string, number[]>()
  const afterByGrade = new Map<string, number[]>()

  for (const r of results) {
    if (r.excluded) continue
    if (r.fte <= 0) continue

    const before = beforeByGrade.get(r.gradeId) ?? []
    before.push(r.baseSalary / r.fte)
    beforeByGrade.set(r.gradeId, before)

    const after = afterByGrade.get(r.gradeId) ?? []
    after.push(r.newSalary / r.fte)
    afterByGrade.set(r.gradeId, after)
  }

  const pairs: CompressionPair[] = []

  for (let i = 1; i < ordered.length; i++) {
    const lower = ordered[i - 1]
    const higher = ordered[i]

    const lowerBefore = beforeByGrade.get(lower.id) ?? []
    const higherBefore = beforeByGrade.get(higher.id) ?? []
    const lowerAfter = afterByGrade.get(lower.id) ?? []
    const higherAfter = afterByGrade.get(higher.id) ?? []

    const lowerMedianBefore = median(lowerBefore)
    const higherMedianBefore = median(higherBefore)
    const lowerMedianAfter = median(lowerAfter)
    const higherMedianAfter = median(higherAfter)

    const differentialBefore = differential(lowerMedianBefore, higherMedianBefore)
    const differentialAfter = differential(lowerMedianAfter, higherMedianAfter)

    const differentialChange =
      differentialBefore === null || differentialAfter === null
        ? null
        : differentialAfter - differentialBefore

    const belowHeadcountThreshold =
      lowerBefore.length < MIN_HEADCOUNT_FOR_COMPRESSION_FLAG ||
      higherBefore.length < MIN_HEADCOUNT_FOR_COMPRESSION_FLAG

    pairs.push({
      lowerGradeId: lower.id,
      lowerGradeName: lower.name,
      higherGradeId: higher.id,
      higherGradeName: higher.name,
      lowerHeadcount: lowerBefore.length,
      higherHeadcount: higherBefore.length,
      lowerMedianBefore,
      higherMedianBefore,
      differentialBefore,
      lowerMedianAfter,
      higherMedianAfter,
      differentialAfter,
      differentialChange,
      flagged:
        differentialChange !== null &&
        !belowHeadcountThreshold &&
        differentialChange < -threshold,
      belowHeadcountThreshold,
    })
  }

  return pairs
}

/** (higher - lower) / lower. Null when the lower median is absent or not positive. */
function differential(
  lowerMedian: number | null,
  higherMedian: number | null,
): number | null {
  if (lowerMedian === null || higherMedian === null) return null
  if (lowerMedian <= 0) return null
  return (higherMedian - lowerMedian) / lowerMedian
}
