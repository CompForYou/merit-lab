import type { Grade, MeritMatrix } from '../types/domain'
import type { EmployeeMeritResult } from './merit-increase'
import { formatCurrency, formatCompaRatio } from './format'

export type DotStatus =
  | 'above-maximum'
  | 'below-minimum'
  | 'ineligible'
  | 'not-costed'
  | 'in-range'

/** Everything worth knowing about one employee, ready to render. */
export interface DotExplanation {
  employeeId: string
  gradeName: string
  performanceRating: string
  bandLabel: string | null
  status: DotStatus

  /**
   * One sentence saying why this dot is the colour it is, in the same terms a
   * practitioner would use to explain it to a manager. A dot that is red without
   * saying why is a chart; a dot that says why is an answer.
   */
  reason: string

  fte: number
  isPartTime: boolean
  baseSalary: number
  newSalary: number
  /** Grossed to full time, which is how the range bounds are expressed. */
  fullTimeBefore: number
  fullTimeAfter: number

  compaRatioBefore: number | null
  compaRatioAfter: number | null

  matrixPercent: number | null
  prorationFactor: number
  increaseAmount: number
  lumpSumAmount: number
  reducedByCap: number
}

/**
 * Explain one dot.
 *
 * Range bounds are full-time figures, so a part-time employee is compared on a
 * full-time equivalent basis and the sentence says so. Comparing their actual
 * pay against a full-time maximum would report almost every part-timer as
 * comfortably inside a range they may in fact be at the top of.
 */
export function explainDot(
  result: EmployeeMeritResult,
  grade: Grade | undefined,
  matrix?: MeritMatrix,
): DotExplanation {
  const fte = result.fte > 0 ? result.fte : 1
  const fullTimeBefore = result.baseSalary / fte
  const fullTimeAfter = result.newSalary / fte
  const isPartTime = fte < 1
  const gradeName = grade?.name ?? result.gradeId

  const bandLabel =
    matrix && result.bandId
      ? (matrix.bands.find((b) => b.id === result.bandId)?.label ?? null)
      : null

  const status = statusOf(result)
  const suffix = isPartTime
    ? ` Actual pay ${formatCurrency(result.newSalary)} at ${fte} FTE.`
    : ''

  return {
    employeeId: result.employeeId,
    gradeName,
    performanceRating: result.performanceRating,
    bandLabel,
    status,
    reason: reasonFor(status, result, grade, fullTimeAfter, isPartTime) + suffix,
    fte,
    isPartTime,
    baseSalary: result.baseSalary,
    newSalary: result.newSalary,
    fullTimeBefore,
    fullTimeAfter,
    compaRatioBefore: result.compaRatio,
    compaRatioAfter: result.newCompaRatio,
    matrixPercent: result.matrixPercent,
    prorationFactor: result.prorationFactor,
    increaseAmount: result.increaseAmount,
    lumpSumAmount: result.lumpSumAmount,
    reducedByCap: result.reducedByCap,
  }
}

function statusOf(result: EmployeeMeritResult): DotStatus {
  if (result.excluded) return 'not-costed'
  if (result.isOverMaximumAfter) return 'above-maximum'
  if (result.isBelowMinimumAfter) return 'below-minimum'
  if (!result.eligible) return 'ineligible'
  return 'in-range'
}

function reasonFor(
  status: DotStatus,
  result: EmployeeMeritResult,
  grade: Grade | undefined,
  fullTimeAfter: number,
  isPartTime: boolean,
): string {
  const basis = isPartTime ? ' full-time equivalent' : ''
  const gradeName = grade?.name ?? result.gradeId

  switch (status) {
    case 'not-costed':
      return `Could not be costed: ${describeExclusion(result)}. This employee has no dot position and is left out of every average.`

    case 'above-maximum': {
      if (!grade) return 'Above the range maximum.'
      const over = fullTimeAfter - grade.max
      const carried = result.crossedMaximum
        ? 'This cycle carried them over it.'
        : 'They were already above it before this cycle.'
      return `Above maximum — ${formatCurrency(fullTimeAfter)}${basis} exceeds the ${gradeName} maximum of ${formatCurrency(grade.max)} by ${formatCurrency(over)}. ${carried}`
    }

    case 'below-minimum': {
      if (!grade) return 'Below the range minimum.'
      const under = grade.min - fullTimeAfter
      return `Below minimum — ${formatCurrency(fullTimeAfter)}${basis} is ${formatCurrency(under)} under the ${gradeName} minimum of ${formatCurrency(grade.min)}. A merit increase does not clear green-circling; that needs a separate adjustment.`
    }

    case 'ineligible':
      return `Not eligible for an increase, so this dot has not moved. Their compa-ratio stays at ${formatCompaRatio(result.compaRatio)} and they are excluded from eligible payroll.`

    case 'in-range':
    default: {
      if (!grade) return 'Inside the range.'
      return `Inside the ${gradeName} range, ${formatCurrency(grade.min)} to ${formatCurrency(grade.max)}.`
    }
  }
}

function describeExclusion(result: EmployeeMeritResult): string {
  switch (result.exclusionReason) {
    case 'grade-not-found':
      return `grade "${result.gradeId}" is not in the loaded structure`
    case 'compa-ratio-undefined':
      return 'their grade has no usable midpoint'
    case 'no-band-matches':
      return 'no compa-ratio band covers them'
    case 'no-matrix-cell':
      return `the rating "${result.performanceRating}" has no row in this matrix`
    default:
      return 'a required value was missing'
  }
}
