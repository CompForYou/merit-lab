import type { Employee } from '../types/domain'
import type { EmployeeMeritResult } from './merit-increase'
import { summarizeBudget } from './budget'
import { mean, median } from './statistics'

/**
 * Below this many costed employees, a group's averages are withheld.
 *
 * Counts are still shown: knowing a group has three people in it is useful and
 * not disclosive. An average increase across three people is neither: it is
 * unstable enough to mislead, and small enough that a reader who knows the team
 * can back out an individual's pay from it. Same principle as the compression
 * indicator's headcount floor.
 */
export const MIN_GROUP_SIZE = 5

/** The identifier for grouping by grade rather than by a pasted column. */
export const GROUP_BY_GRADE = '__grade__'

export interface GroupRow {
  key: string
  label: string
  headcount: number
  eligibleCount: number
  eligiblePayroll: number
  totalSpend: number
  spendPercent: number | null

  /**
   * Mean increase as a proportion of each employee's own base salary.
   *
   * Deliberately not the same as spend percentage. Spend is total cost over
   * total payroll, so it is weighted by salary and answers "what did this group
   * cost". This is the unweighted average of what an individual received, and
   * answers "what did a person in this group typically get" — the question a
   * pay-equity review is actually asking.
   */
  averageIncreasePercent: number | null

  medianCompaRatioBefore: number | null
  medianCompaRatioAfter: number | null
  belowMinimum: number
  aboveMaximum: number

  /** True when the group is too small for its averages to be reported. */
  suppressed: boolean
}

/**
 * Every column the results can be broken down by.
 *
 * Grade always; then any column that came in with the pasted file. A department
 * or location column becomes a grouping with no configuration, and so does a
 * demographic one — which is the point, and also why the suppression rule above
 * exists.
 */
export function availableGroupings(employees: Employee[]): string[] {
  const keys = new Set<string>()
  for (const employee of employees) {
    for (const name of Object.keys(employee.attributes ?? {})) keys.add(name)
  }
  return [GROUP_BY_GRADE, ...[...keys].sort()]
}

/**
 * Break the results into groups and cost each one.
 *
 * The caller supplies the key function, so this works identically for a grade,
 * a department or anything else without knowing what it is grouping by.
 *
 * Employees who could not be costed still appear in a group's headcount. They
 * contribute nothing to the money, exactly as they contribute nothing to the
 * whole-population figures.
 */
export function groupResults(
  results: EmployeeMeritResult[],
  keyOf: (result: EmployeeMeritResult) => string,
  labelOf: (key: string) => string,
  targetBudgetPercent: number,
): GroupRow[] {
  const buckets = new Map<string, EmployeeMeritResult[]>()
  for (const result of results) {
    const key = keyOf(result)
    const existing = buckets.get(key)
    if (existing) existing.push(result)
    else buckets.set(key, [result])
  }

  const rows: GroupRow[] = []

  for (const [key, bucket] of buckets) {
    const budget = summarizeBudget(bucket, targetBudgetPercent)

    const costed = bucket.filter((r) => !r.excluded && r.eligible)
    const increasePercents = costed
      .filter((r) => r.baseSalary > 0)
      .map((r) => (r.increaseAmount + r.lumpSumAmount) / r.baseSalary)

    const before = bucket
      .filter((r) => r.compaRatio !== null)
      .map((r) => r.compaRatio as number)
    const after = bucket
      .filter((r) => r.newCompaRatio !== null)
      .map((r) => r.newCompaRatio as number)

    const suppressed = costed.length < MIN_GROUP_SIZE

    rows.push({
      key,
      label: labelOf(key),
      headcount: bucket.length,
      eligibleCount: budget.eligibleHeadcount,
      eligiblePayroll: budget.eligiblePayroll,
      totalSpend: budget.totalSpend,
      spendPercent: suppressed ? null : budget.budgetSpendPercent,
      averageIncreasePercent: suppressed ? null : mean(increasePercents),
      medianCompaRatioBefore: suppressed ? null : median(before),
      medianCompaRatioAfter: suppressed ? null : median(after),
      belowMinimum: bucket.filter((r) => r.isBelowMinimumAfter).length,
      aboveMaximum: bucket.filter((r) => r.isOverMaximumAfter).length,
      suppressed,
    })
  }

  return rows
}

/**
 * The widest gap between any two reportable groups, in percentage points of
 * average increase.
 *
 * A description of the data and nothing more. It does not control for grade,
 * tenure, role or performance, so it cannot support a conclusion about whether
 * anyone is being treated unfairly — only about whether the question is worth
 * asking properly.
 */
export function widestAverageGap(rows: GroupRow[]): {
  points: number
  highest: GroupRow
  lowest: GroupRow
} | null {
  const reportable = rows.filter(
    (r) => !r.suppressed && r.averageIncreasePercent !== null,
  )
  if (reportable.length < 2) return null

  const sorted = [...reportable].sort(
    (a, b) => (a.averageIncreasePercent ?? 0) - (b.averageIncreasePercent ?? 0),
  )
  const lowest = sorted[0]
  const highest = sorted[sorted.length - 1]

  return {
    points: (highest.averageIncreasePercent ?? 0) - (lowest.averageIncreasePercent ?? 0),
    highest,
    lowest,
  }
}
