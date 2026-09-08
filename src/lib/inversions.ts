import type { EmployeeMeritResult } from './merit-increase'

/**
 * Where a better-rated employee receives fewer dollars than a worse-rated one.
 *
 * A merit matrix pays a percentage, and a percentage of a larger salary is more
 * money. So a matrix that looks obviously fair as a grid can hand an Exceeds
 * employee at $62,000 less cash than a Meets employee at $88,000 in the same
 * grade — 5% of the first is $3,100, 3% of the second is $2,640, and at a wider
 * salary gap the order reverses.
 *
 * Nobody builds this pivot, because nobody suspects it is there. Everybody
 * *notices* it: it arrives as a manager asking why their top performer got less
 * than the person beside them, and the analyst has no answer ready.
 *
 * Comparisons are within a grade only. Across grades the finding is trivially
 * true and means nothing — a Grade 1 Exceeds will always receive fewer dollars
 * than a Grade 8 Meets, and that is the structure working, not a defect.
 */

export interface Inversion {
  gradeId: string
  /** The employee with the better rating and the smaller increase. */
  better: InversionSide
  /** The employee with the worse rating and the larger increase. */
  worse: InversionSide
  /** How many dollars more the worse-rated employee receives. */
  dollarGap: number
}

export interface InversionSide {
  employeeId: string
  performanceRating: string
  baseSalary: number
  matrixPercent: number | null
  increaseAmount: number
}

export interface InversionSummary {
  /**
   * Distinct employees who are out-earned in increase dollars by at least one
   * worse-rated colleague in their grade.
   *
   * Counted as people rather than pairs. Pairs grow quadratically and one
   * unusual salary can generate a dozen of them, which overstates a single
   * problem into a crisis.
   */
  affectedCount: number
  /** The widest gaps, worst first. */
  examples: Inversion[]
  /** Every pair found, for a caller that wants to count them. */
  pairCount: number
  /** Part-time employees left out of the comparison, reported rather than hidden. */
  excludedPartTime: number
}

/** How many worked examples to carry. Enough to show the pattern, few enough to read. */
const DEFAULT_EXAMPLE_LIMIT = 5

/**
 * Find every within-grade pair where the better rating receives less money.
 *
 * `ratings` is the matrix's rating list, best first, which is the only place the
 * ordering is stated. A rating absent from that list cannot be ranked and its
 * employees are skipped rather than guessed at.
 */
export function findInversions(
  results: EmployeeMeritResult[],
  ratings: string[],
  exampleLimit = DEFAULT_EXAMPLE_LIMIT,
): InversionSummary {
  const rank = new Map(ratings.map((rating, index) => [rating, index]))

  // Only employees who were actually costed. An excluded employee has no
  // increase to compare, and a zero from exclusion is not a small increase.
  const costed = results.filter(
    (r) => r.eligible && !r.excluded && r.exclusionReason === null && rank.has(r.performanceRating),
  )

  /**
   * Full-time employees only.
   *
   * A 0.5 FTE employee receives roughly half the dollars of an identical
   * full-timer, so almost every part-timer is "out-earned" by somebody. That is
   * hours working as intended, not the matrix reversing anybody's rating, and
   * including it buries the real findings under noise a reader dismisses the
   * whole panel for.
   *
   * The alternative was to normalise every increase to its full-time
   * equivalent. That works arithmetically and was rejected: it means the
   * figures shown are no longer what anybody is actually paid, and a panel whose
   * numbers cannot be checked against a payslip is a panel nobody trusts. The
   * count of who was left out is reported instead.
   */
  const fullTime = costed.filter((r) => r.fte >= 1)
  const excludedPartTime = costed.length - fullTime.length

  const byGrade = new Map<string, EmployeeMeritResult[]>()
  for (const result of fullTime) {
    const bucket = byGrade.get(result.gradeId)
    if (bucket) bucket.push(result)
    else byGrade.set(result.gradeId, [result])
  }

  const inversions: Inversion[] = []
  const affected = new Set<string>()

  for (const [gradeId, people] of byGrade) {
    for (let i = 0; i < people.length; i++) {
      for (let j = 0; j < people.length; j++) {
        if (i === j) continue
        const a = people[i]
        const b = people[j]

        // a must be strictly better rated and strictly worse paid.
        if (rank.get(a.performanceRating)! >= rank.get(b.performanceRating)!) continue

        const aTotal = a.increaseAmount + a.lumpSumAmount
        const bTotal = b.increaseAmount + b.lumpSumAmount
        if (aTotal >= bTotal) continue

        affected.add(a.employeeId)
        inversions.push({
          gradeId,
          better: side(a),
          worse: side(b),
          dollarGap: bTotal - aTotal,
        })
      }
    }
  }

  inversions.sort((x, y) => y.dollarGap - x.dollarGap)

  return {
    affectedCount: affected.size,
    pairCount: inversions.length,
    excludedPartTime,
    examples: dedupeByBetter(inversions).slice(0, exampleLimit),
  }
}

/**
 * One example per out-earned employee, keeping their worst case.
 *
 * Without this the list is five rows about the same person, because whoever is
 * most underpaid relative to their rating is out-earned by everybody.
 */
function dedupeByBetter(inversions: Inversion[]): Inversion[] {
  const seen = new Set<string>()
  const out: Inversion[] = []
  for (const inversion of inversions) {
    if (seen.has(inversion.better.employeeId)) continue
    seen.add(inversion.better.employeeId)
    out.push(inversion)
  }
  return out
}

function side(result: EmployeeMeritResult): InversionSide {
  return {
    employeeId: result.employeeId,
    performanceRating: result.performanceRating,
    baseSalary: result.baseSalary,
    matrixPercent: result.matrixPercent,
    increaseAmount: result.increaseAmount + result.lumpSumAmount,
  }
}
