import type { Employee, Grade, MeritMatrix, OverMaxMode, ScenarioSettings } from '../types/domain'
import type { EmployeeMeritResult } from './merit-increase'
import { calculateRangeSpread } from './range-spread'
import { calculateStructureProgressions } from './midpoint-progression'

/**
 * The calculations behind the advisor's recommendations.
 *
 * Every one of these exists so a recommendation can carry a price. Advice that
 * says "consider a green-circle adjustment" is a platitude; advice that says it
 * would cost $47,300, a further 0.29% of eligible payroll, is something a
 * practitioner can take into a budget meeting.
 */

export interface GreenCircleRemediation {
  count: number
  /** Dollars to bring everyone still below minimum up to their minimum. */
  cost: number
  /** That cost as a proportion of eligible payroll. */
  percentOfEligiblePayroll: number | null
  /** The single largest individual shortfall, for scale. */
  largestShortfall: number
}

/**
 * What it would cost to clear green-circling outright.
 *
 * Measured on ACTUAL pay, scaled to each employee's FTE, because that is what
 * payroll would actually have to spend. A part-time employee needs their own
 * proportion of the minimum, not the full-time figure.
 */
export function costToClearGreenCircles(
  results: EmployeeMeritResult[],
  grades: Grade[],
  eligiblePayroll: number,
): GreenCircleRemediation {
  const gradeById = new Map(grades.map((g) => [g.id, g]))
  let cost = 0
  let count = 0
  let largestShortfall = 0

  for (const result of results) {
    if (result.excluded || !result.isBelowMinimumAfter) continue
    const grade = gradeById.get(result.gradeId)
    if (!grade) continue

    const shortfall = grade.min * result.fte - result.newSalary
    if (shortfall <= 0) continue

    count++
    cost += shortfall
    if (shortfall > largestShortfall) largestShortfall = shortfall
  }

  return {
    count,
    cost,
    percentOfEligiblePayroll: eligiblePayroll > 0 ? cost / eligiblePayroll : null,
    largestShortfall,
  }
}

export interface ModeOutcome {
  mode: OverMaxMode
  totalSpend: number
  baseBuildCost: number
  reducedByCap: number
  crossings: number
}

/**
 * The same matrix costed under all three over-maximum modes at once.
 *
 * Lets a recommendation say what switching would actually cost, rather than
 * telling the user to go and find out.
 *
 * Takes the runner as an argument to avoid importing run-scenario here, which
 * would make these two modules circular.
 */
export function compareOverMaxModes(
  employees: Employee[],
  grades: Grade[],
  matrix: MeritMatrix,
  settings: ScenarioSettings,
  run: (
    employees: Employee[],
    grades: Grade[],
    matrix: MeritMatrix,
    settings: ScenarioSettings,
  ) => {
    budget: { totalSpend: number; baseBuildCost: number; reducedByCap: number }
    distribution: { countCrossedMaximum: number }
  },
): ModeOutcome[] {
  const modes: OverMaxMode[] = ['capAtMax', 'allowOverMax', 'lumpSum']
  return modes.map((mode) => {
    const outcome = run(employees, grades, matrix, { ...settings, overMaxMode: mode })
    return {
      mode,
      totalSpend: outcome.budget.totalSpend,
      baseBuildCost: outcome.budget.baseBuildCost,
      reducedByCap: outcome.budget.reducedByCap,
      crossings: outcome.distribution.countCrossedMaximum,
    }
  })
}

/**
 * How many cycles at this rate before the median compa-ratio reaches midpoint.
 *
 * A straight-line projection on this cycle's movement, and nothing more. It
 * assumes the same matrix, the same population and no range movement, none of
 * which will hold. It is useful for the order of magnitude — two cycles or
 * eleven — and should not be read more precisely than that.
 *
 * Returns null when the population is already at or above midpoint, or when
 * this matrix does not move it upward at all.
 */
export function projectCyclesToMidpoint(
  medianBefore: number | null,
  medianAfter: number | null,
): number | null {
  if (medianBefore === null || medianAfter === null) return null
  if (medianAfter >= 1) return null

  const perCycle = medianAfter - medianBefore
  if (perCycle <= 0) return null

  return (1 - medianAfter) / perCycle
}

/** Eligible employees this matrix pays nothing at all. */
export function zeroIncreaseEmployees(
  results: EmployeeMeritResult[],
): EmployeeMeritResult[] {
  return results.filter(
    (r) =>
      !r.excluded &&
      r.eligible &&
      r.increaseAmount + r.lumpSumAmount === 0,
  )
}

export interface StructureIssue {
  kind: 'negative-progression' | 'narrow-spread' | 'wide-spread' | 'gap-between-grades'
  gradeName: string
  detail: string
  value: number
}

/** Spreads below this look like a structure that cannot accommodate tenure. */
const NARROW_SPREAD = 0.2
/** Above this, a single grade is doing the work of two. */
const WIDE_SPREAD = 1.0

/**
 * Structural problems visible from the ranges alone, before any population is
 * costed against them.
 */
export function structureHealth(grades: Grade[]): StructureIssue[] {
  const issues: StructureIssue[] = []

  for (const grade of grades) {
    const spread = calculateRangeSpread(grade.min, grade.max)
    if (spread === null) continue
    if (spread < NARROW_SPREAD) {
      issues.push({
        kind: 'narrow-spread',
        gradeName: grade.name,
        value: spread,
        detail: `${grade.name} has a range spread of ${(spread * 100).toFixed(0)}%, which leaves little room between a new hire and a long-tenured incumbent.`,
      })
    } else if (spread > WIDE_SPREAD) {
      issues.push({
        kind: 'wide-spread',
        gradeName: grade.name,
        value: spread,
        detail: `${grade.name} has a range spread of ${(spread * 100).toFixed(0)}%, wide enough that one grade may be covering work that belongs in two.`,
      })
    }
  }

  const ordered = [...grades].sort((a, b) => a.order - b.order)
  for (const step of calculateStructureProgressions(grades)) {
    if (step.progression !== null && step.progression < 0) {
      issues.push({
        kind: 'negative-progression',
        gradeName: step.higherGradeName,
        value: step.progression,
        detail: `${step.higherGradeName} has a lower midpoint than ${step.lowerGradeName}, the grade beneath it. Promotion into it would be a pay cut at midpoint.`,
      })
    }
  }

  // A gap means salaries exist that no grade covers.
  for (let i = 1; i < ordered.length; i++) {
    const below = ordered[i - 1]
    const above = ordered[i]
    if (above.min > below.max) {
      issues.push({
        kind: 'gap-between-grades',
        gradeName: above.name,
        value: above.min - below.max,
        detail: `There is a gap between ${below.name} and ${above.name}: salaries from ${below.max.toLocaleString()} to ${above.min.toLocaleString()} fall in no grade at all.`,
      })
    }
  }

  return issues
}
