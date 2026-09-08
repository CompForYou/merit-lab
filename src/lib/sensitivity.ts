import type { Employee, Grade, MeritMatrix, ScenarioSettings } from '../types/domain'
import { runScenario, fitToBudgetFactor } from './run-scenario'
import { scaleMatrix } from './matrix-edit'

/**
 * What the plan looks like at other budgets.
 *
 * "What does 3.0% look like? Answer now, we are deciding today." That question
 * is asked in a room, with people waiting, and a spreadsheet answers it in three
 * days by rebuilding the model five times. It is the single most repeated manual
 * exercise in a merit cycle, and the tool can do the whole table in one pass.
 *
 * Each row scales the *existing* matrix rather than inventing a new one, so the
 * shape of the plan design survives and only its magnitude moves. That is the
 * honest comparison: it answers "what if we had less money", not "what if we
 * designed a different plan", which is a separate question.
 */

/**
 * How close to a target counts as having reached it.
 *
 * A tenth of a basis point. Tighter than any budget conversation cares about,
 * loose enough that floating-point residue does not get reported as a shortfall.
 */
const TARGET_TOLERANCE = 0.000001

/** Scaling passes before a target is called unreachable. */
const MAX_FIT_PASSES = 8

export interface SensitivityRow {
  /** The budget asked for, as a decimal: 0.0325 is 3.25%. */
  targetPercent: number
  /** What the scaled matrix actually spends. Below target when the cap binds. */
  achievedPercent: number | null
  /**
   * False when no scaling of this matrix reaches the target.
   *
   * Under capping, a population that is already against its range maximums
   * cannot absorb more money however large the percentages get. Saying so is
   * the point: a plan that silently misses its target looks like arithmetic
   * that does not work.
   */
  reachable: boolean
  /** The multiple applied to every cell to get here. */
  scaleFactor: number | null

  totalSpend: number
  baseBuildCost: number
  reducedByCap: number
  cappedHeadcount: number

  /** Median compa-ratio movement, in decimal points. 0.035 is 3.5 points. */
  medianShift: number | null
  belowMinimumAfter: number
  aboveMaximumAfter: number
  zeroIncreaseCount: number
}

/**
 * The targets a sensitivity table covers by default, as offsets in decimal
 * percentage points from whatever the plan is currently aiming at.
 *
 * Asymmetric on purpose. A budget conversation is far more often about finding
 * less money than more, so the table reaches further down than up.
 */
export const DEFAULT_SENSITIVITY_OFFSETS = [-0.01, -0.005, -0.0025, 0, 0.0025, 0.005]

/**
 * Scale a matrix onto a target budget, converging where one pass is not enough.
 *
 * `fitToBudgetFactor` is exact whenever cost is linear in the matrix percentage,
 * which is the ordinary case. It falls short once the range maximum starts
 * binding, because a capped employee absorbs less than their percentage implies.
 * Iterating recovers most of that gap; when successive passes stop improving,
 * the target is genuinely out of reach and this says so rather than returning a
 * number that quietly missed.
 */
export function fitMatrixToTarget(
  employees: Employee[],
  grades: Grade[],
  matrix: MeritMatrix,
  settings: ScenarioSettings,
  targetPercent: number,
): { matrix: MeritMatrix; achievedPercent: number | null; scaleFactor: number | null; reachable: boolean } {
  if (targetPercent === 0) {
    const zeroed = scaleMatrix(matrix, 0)
    const run = runScenario(employees, grades, zeroed, settings)
    return {
      matrix: zeroed,
      achievedPercent: run.budget.budgetSpendPercent,
      scaleFactor: 0,
      reachable: true,
    }
  }

  let current = matrix
  let cumulative = 1
  let achieved = runScenario(employees, grades, current, settings).budget.budgetSpendPercent

  for (let pass = 0; pass < MAX_FIT_PASSES; pass++) {
    if (achieved === null) return { matrix: current, achievedPercent: null, scaleFactor: null, reachable: false }
    if (Math.abs(achieved - targetPercent) <= TARGET_TOLERANCE) {
      return { matrix: current, achievedPercent: achieved, scaleFactor: cumulative, reachable: true }
    }

    const factor = fitToBudgetFactor(achieved, targetPercent)
    if (factor === null) break

    const next = scaleMatrix(current, factor)
    const nextAchieved = runScenario(employees, grades, next, settings).budget.budgetSpendPercent
    if (nextAchieved === null) break

    // No longer moving toward the target: the cap is absorbing everything the
    // extra percentage would have paid. Another pass buys nothing.
    const improved =
      Math.abs(nextAchieved - targetPercent) < Math.abs(achieved - targetPercent) - TARGET_TOLERANCE
    current = next
    cumulative *= factor
    achieved = nextAchieved
    if (!improved) break
  }

  return {
    matrix: current,
    achievedPercent: achieved,
    scaleFactor: cumulative,
    reachable:
      achieved !== null && Math.abs(achieved - targetPercent) <= TARGET_TOLERANCE,
  }
}

/** One row per candidate budget, each a fully costed run of the whole population. */
export function budgetSensitivity(
  employees: Employee[],
  grades: Grade[],
  matrix: MeritMatrix,
  settings: ScenarioSettings,
  targets: number[],
): SensitivityRow[] {
  return targets.map((targetPercent) => {
    const fitted = fitMatrixToTarget(
      employees,
      grades,
      matrix,
      settings,
      targetPercent,
    )
    const run = runScenario(employees, grades, fitted.matrix, {
      ...settings,
      targetBudgetPercent: targetPercent,
    })

    return {
      targetPercent,
      achievedPercent: fitted.achievedPercent,
      reachable: fitted.reachable,
      scaleFactor: fitted.scaleFactor,

      totalSpend: run.budget.totalSpend,
      baseBuildCost: run.budget.baseBuildCost,
      reducedByCap: run.budget.reducedByCap,
      cappedHeadcount: run.results.filter((r) => r.reducedByCap > 0).length,

      medianShift: run.distribution.medianShift,
      belowMinimumAfter: run.results.filter((r) => r.isBelowMinimumAfter).length,
      aboveMaximumAfter: run.results.filter((r) => r.isOverMaximumAfter).length,
      zeroIncreaseCount: run.results.filter(
        (r) => r.eligible && r.exclusionReason === null && r.increaseAmount === 0,
      ).length,
    }
  })
}

/**
 * The candidate budgets to show, given what the plan currently targets.
 *
 * Negative targets are dropped rather than clamped to zero: a 0% row already
 * appears whenever an offset lands there, and two rows both reading 0% would
 * look like a bug.
 */
export function defaultSensitivityTargets(
  targetBudgetPercent: number,
  offsets: number[] = DEFAULT_SENSITIVITY_OFFSETS,
): number[] {
  const targets = offsets
    .map((offset) => targetBudgetPercent + offset)
    .filter((t) => t >= 0)
  return [...new Set(targets)].sort((a, b) => a - b)
}
