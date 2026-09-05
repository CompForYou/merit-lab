import type { EmployeeMeritResult } from './merit-increase'
import { mean, median } from './statistics'

/**
 * How the pay distribution moved across the cycle.
 *
 * Everyone who could be placed is included, eligible or not. An ineligible
 * employee still occupies a position in the distribution; leaving them out would
 * make the population look different from the one the user pasted in.
 * Employees who could not be placed at all are counted and otherwise omitted.
 */
export interface DistributionSummary {
  /** Employees with a compa-ratio, before and after. */
  populationCount: number
  /** Employees with no compa-ratio, reported rather than hidden. */
  excludedCount: number

  meanCompaRatioBefore: number | null
  meanCompaRatioAfter: number | null
  /** After minus before. Positive means the population moved up the range. */
  meanShift: number | null

  medianCompaRatioBefore: number | null
  medianCompaRatioAfter: number | null
  medianShift: number | null

  countAboveMaximumBefore: number
  countAboveMaximumAfter: number
  /** Was inside the range, is now above it. The number the spec asks for. */
  countCrossedMaximum: number

  countBelowMinimumBefore: number
  /** Still green-circled after the increases landed. */
  countStillBelowMinimum: number
}

/**
 * Recompute the distribution on post-cycle salaries and report the shift.
 *
 * Mean and median are both reported because they answer different questions: the
 * mean moves with a handful of large increases, the median describes where the
 * body of the population sits.
 */
export function summarizeDistribution(
  results: EmployeeMeritResult[],
): DistributionSummary {
  const placed = results.filter((r) => !r.excluded)

  const before: number[] = []
  const after: number[] = []
  let countAboveMaximumBefore = 0
  let countAboveMaximumAfter = 0
  let countCrossedMaximum = 0
  let countBelowMinimumBefore = 0
  let countStillBelowMinimum = 0

  for (const r of placed) {
    if (r.compaRatio !== null) before.push(r.compaRatio)
    if (r.newCompaRatio !== null) after.push(r.newCompaRatio)

    if (r.wasOverMaximumBefore) countAboveMaximumBefore++
    if (r.isOverMaximumAfter) countAboveMaximumAfter++
    if (r.crossedMaximum) countCrossedMaximum++
    if (r.wasBelowMinimumBefore) countBelowMinimumBefore++
    if (r.isBelowMinimumAfter) countStillBelowMinimum++
  }

  const meanBefore = mean(before)
  const meanAfter = mean(after)
  const medianBefore = median(before)
  const medianAfter = median(after)

  return {
    populationCount: placed.length,
    excludedCount: results.length - placed.length,

    meanCompaRatioBefore: meanBefore,
    meanCompaRatioAfter: meanAfter,
    meanShift:
      meanBefore === null || meanAfter === null ? null : meanAfter - meanBefore,

    medianCompaRatioBefore: medianBefore,
    medianCompaRatioAfter: medianAfter,
    medianShift:
      medianBefore === null || medianAfter === null
        ? null
        : medianAfter - medianBefore,

    countAboveMaximumBefore,
    countAboveMaximumAfter,
    countCrossedMaximum,
    countBelowMinimumBefore,
    countStillBelowMinimum,
  }
}
