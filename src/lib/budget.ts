import type { EmployeeMeritResult } from './merit-increase'

/**
 * Budget aggregates for a set of employees.
 *
 * Three cost figures rather than one, because a lump sum is real cash that does
 * not build into base:
 *
 *   baseBuildCost  increases added to base salary. Compounds into next year's
 *                  payroll and next year's merit pool.
 *   lumpSumCost    paid once, then gone. Zero outside lumpSum mode.
 *   totalSpend     baseBuildCost + lumpSumCost. Cash out the door this cycle.
 *
 * budgetSpendPercent is measured on totalSpend, because merit budgets are
 * approved as cash. baseBuildPercent is reported alongside for run-rate planning.
 *
 * uncappedCost is what the matrix alone called for, before any over-maximum
 * handling. The gap between it and totalSpend is reducedByCap, and it makes the
 * effect of the over-maximum mode a visible number rather than an assumption.
 */
export interface BudgetSummary {
  totalHeadcount: number
  /** Eligible AND costable. The population the budget percentage is measured on. */
  eligibleHeadcount: number
  ineligibleHeadcount: number
  /** Could not be costed at all. Never silently folded into the denominator. */
  excludedHeadcount: number

  eligiblePayroll: number

  uncappedCost: number
  baseBuildCost: number
  lumpSumCost: number
  totalSpend: number
  reducedByCap: number

  baseBuildPercent: number | null
  budgetSpendPercent: number | null

  targetBudgetPercent: number
  /** In decimal percentage points: 0.005 is 0.5 points over target. */
  varianceToTargetPercent: number | null
  /** In dollars: totalSpend minus what the target would have permitted. */
  varianceToTargetDollars: number | null
}

/**
 * Aggregate a set of employee results into a budget summary.
 *
 * Eligible payroll counts employees who are eligible AND were successfully
 * costed. An employee who could not be placed contributes nothing to the
 * numerator, so including them in the denominator would understate spend while
 * looking perfectly normal on screen.
 */
export function summarizeBudget(
  results: EmployeeMeritResult[],
  targetBudgetPercent: number,
): BudgetSummary {
  let eligibleHeadcount = 0
  let ineligibleHeadcount = 0
  let excludedHeadcount = 0

  let eligiblePayroll = 0
  let uncappedCost = 0
  let baseBuildCost = 0
  let lumpSumCost = 0
  let reducedByCap = 0

  for (const r of results) {
    if (r.excluded) {
      excludedHeadcount++
      continue
    }
    if (!r.eligible) {
      ineligibleHeadcount++
      continue
    }

    eligibleHeadcount++
    eligiblePayroll += r.baseSalary
    uncappedCost += r.uncappedIncreaseAmount
    baseBuildCost += r.increaseAmount
    lumpSumCost += r.lumpSumAmount
    reducedByCap += r.reducedByCap
  }

  const totalSpend = baseBuildCost + lumpSumCost
  const hasPayroll = eligiblePayroll > 0

  const budgetSpendPercent = hasPayroll ? totalSpend / eligiblePayroll : null
  const baseBuildPercent = hasPayroll ? baseBuildCost / eligiblePayroll : null

  return {
    totalHeadcount: results.length,
    eligibleHeadcount,
    ineligibleHeadcount,
    excludedHeadcount,
    eligiblePayroll,
    uncappedCost,
    baseBuildCost,
    lumpSumCost,
    totalSpend,
    reducedByCap,
    baseBuildPercent,
    budgetSpendPercent,
    targetBudgetPercent,
    varianceToTargetPercent:
      budgetSpendPercent === null ? null : budgetSpendPercent - targetBudgetPercent,
    varianceToTargetDollars: hasPayroll
      ? totalSpend - targetBudgetPercent * eligiblePayroll
      : null,
  }
}

/**
 * The same aggregates, split by any key derived from a result.
 *
 * By grade:      summarizeBudgetBy(results, (r) => r.gradeId, target)
 * By attribute:  build a lookup of employeeId to value first, then key off it.
 *
 * Insertion-ordered, so the caller controls presentation order by sorting the
 * results beforehand.
 */
export function summarizeBudgetBy(
  results: EmployeeMeritResult[],
  keyOf: (result: EmployeeMeritResult) => string,
  targetBudgetPercent: number,
): Map<string, BudgetSummary> {
  const groups = new Map<string, EmployeeMeritResult[]>()

  for (const r of results) {
    const key = keyOf(r)
    const existing = groups.get(key)
    if (existing) existing.push(r)
    else groups.set(key, [r])
  }

  const summaries = new Map<string, BudgetSummary>()
  for (const [key, group] of groups) {
    summaries.set(key, summarizeBudget(group, targetBudgetPercent))
  }
  return summaries
}
