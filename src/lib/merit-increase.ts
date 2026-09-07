import type {
  Employee,
  Grade,
  MeritMatrix,
  ScenarioSettings,
} from '../types/domain'
import { calculateCompaRatio } from './compa-ratio'
import { assignCompaRatioBand } from './compa-ratio-bands'
import { calculateProrationFactor } from './proration'

/** Why an employee could not be costed. Null when they were costed normally. */
export type ExclusionReason =
  | 'grade-not-found'
  | 'compa-ratio-undefined'
  | 'no-band-matches'
  | 'no-matrix-cell'

/** The full outcome for one employee. Every intermediate value is kept visible. */
export interface EmployeeMeritResult {
  employeeId: string
  gradeId: string
  /** Carried through so downstream aggregates can gross salaries to full-time. */
  fte: number
  /** Carried through so results can be grouped back into matrix cells. */
  performanceRating: string
  eligible: boolean
  /** True when the employee could not be costed at all. Never silently zero. */
  excluded: boolean
  exclusionReason: ExclusionReason | null

  compaRatio: number | null
  bandId: string | null
  matrixPercent: number | null
  prorationFactor: number

  baseSalary: number
  /** What the matrix alone would have paid, before any over-maximum handling. */
  uncappedIncreaseAmount: number
  /** Added to base salary. */
  increaseAmount: number
  /** Paid once, not added to base. Always zero outside lumpSum mode. */
  lumpSumAmount: number
  /** Money the matrix called for that the over-maximum mode withheld. */
  reducedByCap: number

  newSalary: number
  newCompaRatio: number | null

  wasOverMaximumBefore: boolean
  isOverMaximumAfter: boolean
  /** Was inside the range, is now above it. The count the spec asks for. */
  crossedMaximum: boolean
  wasBelowMinimumBefore: boolean
  isBelowMinimumAfter: boolean
}

/**
 * The merit increase for a single employee.
 *
 *   increasePercent = matrix[performanceRating][compaRatioBand]
 *   increaseAmount  = baseSalary x increasePercent x prorationFactor
 *   newSalary       = baseSalary + increaseAmount
 *
 * Cost arithmetic uses ACTUAL base salary. Range placement uses the full-time
 * equivalent. The two must not be mixed: see calculateCompaRatio.
 *
 * The range maximum is a full-time figure, so for a part-time employee it is
 * scaled to their FTE before comparison. A 0.5 FTE employee in a grade with a
 * 100,000 maximum can be paid up to 50,000 actual.
 *
 * Ineligible employees return a zero increase but keep their compa-ratio, so
 * they still appear in the distribution.
 *
 * Nothing is rounded. Rounding here would produce budget variances a
 * practitioner would notice.
 */
export function calculateEmployeeMerit(
  employee: Employee,
  grade: Grade | undefined,
  matrix: MeritMatrix,
  settings: ScenarioSettings,
): EmployeeMeritResult {
  const base = employee.baseSalary
  const fte = employee.fte

  const blank = {
    employeeId: employee.id,
    gradeId: employee.gradeId,
    fte,
    performanceRating: employee.performanceRating,
    eligible: employee.eligible,
    baseSalary: base,
    uncappedIncreaseAmount: 0,
    increaseAmount: 0,
    lumpSumAmount: 0,
    reducedByCap: 0,
    newSalary: base,
    prorationFactor: 1,
    matrixPercent: null,
    bandId: null,
  }

  if (!grade) {
    return {
      ...blank,
      excluded: true,
      exclusionReason: 'grade-not-found',
      compaRatio: null,
      newCompaRatio: null,
      wasOverMaximumBefore: false,
      isOverMaximumAfter: false,
      crossedMaximum: false,
      wasBelowMinimumBefore: false,
      isBelowMinimumAfter: false,
    }
  }

  // The maximum and minimum expressed in this employee's actual dollars.
  const effectiveMax = grade.max * fte
  const effectiveMin = grade.min * fte

  const compaRatio = calculateCompaRatio(base, grade.mid, fte)
  const wasOverMaximumBefore = base > effectiveMax

  if (compaRatio === null) {
    // Cannot be placed in a band, so cannot be costed. Excluded and reported,
    // never defaulted to a zero increase inside the eligible payroll.
    return {
      ...blank,
      excluded: true,
      exclusionReason: 'compa-ratio-undefined',
      compaRatio: null,
      newCompaRatio: null,
      wasOverMaximumBefore,
      isOverMaximumAfter: wasOverMaximumBefore,
      crossedMaximum: false,
      wasBelowMinimumBefore: base < effectiveMin,
      isBelowMinimumAfter: base < effectiveMin,
    }
  }

  if (!employee.eligible) {
    return {
      ...blank,
      excluded: false,
      exclusionReason: null,
      compaRatio,
      newCompaRatio: compaRatio,
      wasOverMaximumBefore,
      isOverMaximumAfter: wasOverMaximumBefore,
      crossedMaximum: false,
      wasBelowMinimumBefore: base < effectiveMin,
      isBelowMinimumAfter: base < effectiveMin,
    }
  }

  const band = assignCompaRatioBand(compaRatio, matrix.bands)
  if (!band) {
    return {
      ...blank,
      excluded: true,
      exclusionReason: 'no-band-matches',
      compaRatio,
      newCompaRatio: compaRatio,
      wasOverMaximumBefore,
      isOverMaximumAfter: wasOverMaximumBefore,
      crossedMaximum: false,
      wasBelowMinimumBefore: base < effectiveMin,
      isBelowMinimumAfter: base < effectiveMin,
    }
  }

  const matrixPercent = matrix.cells[employee.performanceRating]?.[band.id]
  if (matrixPercent === undefined || !Number.isFinite(matrixPercent)) {
    return {
      ...blank,
      bandId: band.id,
      excluded: true,
      exclusionReason: 'no-matrix-cell',
      compaRatio,
      newCompaRatio: compaRatio,
      wasOverMaximumBefore,
      isOverMaximumAfter: wasOverMaximumBefore,
      crossedMaximum: false,
      wasBelowMinimumBefore: base < effectiveMin,
      isBelowMinimumAfter: base < effectiveMin,
    }
  }

  const prorationFactor = calculateProrationFactor(
    employee.hireDate,
    settings.meritEffectiveDate,
    settings.prorationEnabled,
  )

  const uncappedIncreaseAmount = base * matrixPercent * prorationFactor

  // Room to the maximum, never negative: an employee already above the maximum
  // has no room, and a merit cycle never cuts pay.
  const headroom = Math.max(effectiveMax - base, 0)

  let increaseAmount: number
  let lumpSumAmount: number

  switch (settings.overMaxMode) {
    case 'allowOverMax':
      increaseAmount = uncappedIncreaseAmount
      lumpSumAmount = 0
      break

    case 'lumpSum':
      increaseAmount = Math.min(uncappedIncreaseAmount, headroom)
      lumpSumAmount = uncappedIncreaseAmount - increaseAmount
      break

    case 'capAtMax':
    default:
      increaseAmount = Math.min(uncappedIncreaseAmount, headroom)
      lumpSumAmount = 0
      break
  }

  // Rounding is applied last, to the new base salary, because that is the
  // figure payroll actually pays. It deliberately changes the cost, which is
  // why it is off unless a user turns it on.
  //
  // Two invariants survive it: a merit cycle never cuts pay, and a rounded
  // salary never breaches a maximum the mode was enforcing. Rounding up through
  // a cap would quietly undo the very thing the cap is for.
  increaseAmount = applyRounding(
    base,
    increaseAmount,
    effectiveMax,
    settings.overMaxMode,
    settings.roundingIncrement ?? 0,
  )

  const reducedByCap =
    uncappedIncreaseAmount - increaseAmount - lumpSumAmount
  const newSalary = base + increaseAmount
  const isOverMaximumAfter = newSalary > effectiveMax

  return {
    employeeId: employee.id,
    gradeId: employee.gradeId,
    fte,
    performanceRating: employee.performanceRating,
    eligible: true,
    excluded: false,
    exclusionReason: null,
    compaRatio,
    bandId: band.id,
    matrixPercent,
    prorationFactor,
    baseSalary: base,
    uncappedIncreaseAmount,
    increaseAmount,
    lumpSumAmount,
    reducedByCap,
    newSalary,
    newCompaRatio: calculateCompaRatio(newSalary, grade.mid, fte),
    wasOverMaximumBefore,
    isOverMaximumAfter,
    crossedMaximum: !wasOverMaximumBefore && isOverMaximumAfter,
    wasBelowMinimumBefore: base < effectiveMin,
    isBelowMinimumAfter: newSalary < effectiveMin,
  }
}


/**
 * Round a new base salary to a whole multiple, without breaking the two rules
 * that hold everywhere else in this library.
 *
 * Returns the adjusted increase rather than the salary, so every figure derived
 * from it downstream stays consistent.
 */
function applyRounding(
  base: number,
  increaseAmount: number,
  effectiveMax: number,
  overMaxMode: ScenarioSettings['overMaxMode'],
  increment: number,
): number {
  if (!Number.isFinite(increment) || increment <= 0) return increaseAmount
  if (increaseAmount <= 0) return increaseAmount

  let newSalary = Math.round((base + increaseAmount) / increment) * increment

  // Never cut pay: rounding down past the starting salary would do exactly that.
  if (newSalary < base) newSalary = base

  // Never round up through a maximum the mode was holding. Someone already above
  // it is left alone; they were not being held by the cap in the first place.
  const capped = overMaxMode !== 'allowOverMax'
  if (capped && base <= effectiveMax && newSalary > effectiveMax) {
    newSalary = Math.floor(effectiveMax / increment) * increment
    if (newSalary < base) newSalary = base
  }

  return newSalary - base
}
