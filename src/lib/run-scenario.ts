import type { Employee, Grade, MeritMatrix, ScenarioSettings } from '../types/domain'
import { calculateEmployeeMerit, type EmployeeMeritResult } from './merit-increase'
import { summarizeBudget, summarizeBudgetBy, type BudgetSummary } from './budget'
import { summarizeDistribution, type DistributionSummary } from './distribution'
import { summarizeMatrixCells, type MatrixCellTotals } from './matrix-cells'
import {
  calculateCompressionIndicators,
  type CompressionPair,
} from './compression'

/** Everything a single run of a merit cycle produces. */
export interface ScenarioResults {
  results: EmployeeMeritResult[]
  budget: BudgetSummary
  byGrade: Map<string, BudgetSummary>
  distribution: DistributionSummary
  matrixCells: MatrixCellTotals
  compression: CompressionPair[]
}

/**
 * Cost a whole population against a matrix.
 *
 * One pure function from inputs to every reported number, so the interface never
 * holds a partially computed state and two scenarios can be run side by side
 * without interfering. On a two-hundred-employee population this is a few
 * thousand multiplications: fast enough to rerun on every keystroke, which is
 * the entire reason the tool has no Calculate button.
 */
export function runScenario(
  employees: Employee[],
  grades: Grade[],
  matrix: MeritMatrix,
  settings: ScenarioSettings,
): ScenarioResults {
  const gradeById = new Map(grades.map((g) => [g.id, g]))

  const results = employees.map((employee) =>
    calculateEmployeeMerit(employee, gradeById.get(employee.gradeId), matrix, settings),
  )

  return {
    results,
    budget: summarizeBudget(results, settings.targetBudgetPercent),
    byGrade: summarizeBudgetBy(
      results,
      (r) => r.gradeId,
      settings.targetBudgetPercent,
    ),
    distribution: summarizeDistribution(results),
    matrixCells: summarizeMatrixCells(results, matrix),
    compression: calculateCompressionIndicators(
      results,
      grades,
      settings.compressionThreshold,
    ),
  }
}

/**
 * The factor that would scale the whole matrix onto the target budget.
 *
 * Returns null when the current matrix spends nothing, because there is no
 * multiple of zero that reaches a non-zero target: a matrix of zeros has no
 * shape to preserve and the user has to put a number in it first.
 *
 * Exact whenever cost is linear in the matrix percentage, which is the ordinary
 * case: doubling every cell doubles every increase, so one application lands on
 * the target to the basis point.
 *
 * It falls short only when the range maximum starts binding. A capped employee
 * absorbs less than their percentage implies, so above a certain target the
 * population simply cannot absorb the money: scaling the matrix higher stops
 * raising spend. That is a real limit of the plan design under capAtMax, not an
 * error in this arithmetic, and re-applying the factor will not clear it. The
 * caller should say so rather than let the user click a button that no longer
 * moves the number.
 */
export function fitToBudgetFactor(
  currentSpendPercent: number | null,
  targetBudgetPercent: number,
): number | null {
  if (currentSpendPercent === null) return null
  if (!Number.isFinite(currentSpendPercent) || currentSpendPercent <= 0) return null
  if (!Number.isFinite(targetBudgetPercent) || targetBudgetPercent < 0) return null
  return targetBudgetPercent / currentSpendPercent
}
