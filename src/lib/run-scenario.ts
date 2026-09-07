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
 * Approximate rather than exact. Over-maximum handling is not linear in the
 * matrix percentage: an employee capped at the range maximum absorbs less of an
 * increase than the percentage implies, so scaling by this factor and re-running
 * lands near the target rather than exactly on it. The caller re-runs and can
 * apply it again.
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
