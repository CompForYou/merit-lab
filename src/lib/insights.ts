import type { CompaRatioBand, Grade } from '../types/domain'
import type { EmployeeMeritResult } from './merit-increase'
import type { MatrixCellTotals, MatrixCellSummary } from './matrix-cells'
import type { BudgetSummary } from './budget'
import type { DistributionSummary } from './distribution'
import { assignCompaRatioBand } from './compa-ratio-bands'
import { calculateRangePenetration } from './range-penetration'
import { calculateRangeSpread } from './range-spread'
import { calculateStructureProgressions } from './midpoint-progression'
import { median } from './statistics'

/**
 * The questions a compensation director asks once the cost is known.
 *
 * The cost panel answers "what does this spend". These answer "what is it
 * buying", "where is it going", and "who actually gets what" — which is the
 * conversation that follows in every budget meeting.
 */

export interface IncreaseBucket {
  /** Lower bound of the bucket, as a decimal: 0.03 is 3%. */
  from: number
  /** Upper bound, exclusive. Null on the open-ended top bucket. */
  to: number | null
  label: string
  count: number
  /** Total cost of everyone in this bucket. */
  cost: number
}

/**
 * What individuals actually receive, as opposed to what the plan costs.
 *
 * Spend is a weighted average and hides its own shape: a 3.25% budget can mean
 * everybody receiving 3.25%, or half the population receiving nothing while the
 * other half receives 6.5%. Those are very different plans to defend, and the
 * headline figure cannot tell them apart.
 */
export function increaseDistribution(
  results: EmployeeMeritResult[],
  bucketSize = 0.01,
): IncreaseBucket[] {
  const costed = results.filter((r) => !r.excluded && r.eligible && r.baseSalary > 0)

  const zero: IncreaseBucket = {
    from: 0,
    to: 0,
    label: 'Nothing',
    count: 0,
    cost: 0,
  }
  const buckets = new Map<number, IncreaseBucket>()

  for (const r of costed) {
    const percent = (r.increaseAmount + r.lumpSumAmount) / r.baseSalary

    if (percent <= 0) {
      zero.count++
      continue
    }

    // Bucket by the floor, so 3.0% opens the "3 to 4%" band rather than closing
    // the one below it.
    const index = Math.floor(percent / bucketSize)
    const from = index * bucketSize
    const existing = buckets.get(index)
    const cost = r.increaseAmount + r.lumpSumAmount

    if (existing) {
      existing.count++
      existing.cost += cost
    } else {
      buckets.set(index, {
        from,
        to: from + bucketSize,
        label: `${(from * 100).toFixed(0)} to ${((from + bucketSize) * 100).toFixed(0)}%`,
        count: 1,
        cost,
      })
    }
  }

  const ordered = [...buckets.values()].sort((a, b) => a.from - b.from)
  return zero.count > 0 ? [zero, ...ordered] : ordered
}

/**
 * The cells carrying the most money, largest first.
 *
 * Almost never what a practitioner expects. The generous percentage paid to a
 * handful of top performers routinely costs less than the modest one paid to
 * the large middle, and this is the ranking that makes that impossible to miss.
 */
export function topCostDrivers(
  totals: MatrixCellTotals,
  limit = 5,
): (MatrixCellSummary & { shareOfTotal: number | null })[] {
  return [...totals.cells]
    .filter((c) => c.cost > 0)
    .sort((a, b) => b.cost - a.cost)
    .slice(0, limit)
    .map((cell) => ({
      ...cell,
      shareOfTotal: totals.totalCost > 0 ? cell.cost / totals.totalCost : null,
    }))
}

export interface BandMovement {
  movedUp: number
  stayed: number
  /** Nobody should ever move down: a merit cycle does not cut pay. */
  movedDown: number
}

/**
 * How many employees this plan lifts into a higher compa-ratio band.
 *
 * A band change is the visible consequence of a merit cycle: it is the moment
 * an employee stops being priced by one row of the matrix and starts being
 * priced by the next. A plan that moves nobody is holding the distribution
 * exactly where it is, whatever it costs.
 */
export function bandMovement(
  results: EmployeeMeritResult[],
  bands: CompaRatioBand[],
): BandMovement {
  const indexOf = new Map(bands.map((b, i) => [b.id, i]))
  let movedUp = 0
  let stayed = 0
  let movedDown = 0

  for (const r of results) {
    if (r.excluded || r.compaRatio === null || r.newCompaRatio === null) continue

    const before = assignCompaRatioBand(r.compaRatio, bands)
    const after = assignCompaRatioBand(r.newCompaRatio, bands)
    if (!before || !after) continue

    const from = indexOf.get(before.id) ?? 0
    const to = indexOf.get(after.id) ?? 0

    if (to > from) movedUp++
    else if (to < from) movedDown++
    else stayed++
  }

  return { movedUp, stayed, movedDown }
}

/**
 * What a point of range movement costs.
 *
 * The efficiency question, and the one that separates a plan that spends money
 * from a plan that achieves something. Two plans costing the same can move the
 * median compa-ratio by very different amounts, depending on whether the money
 * went to people low in their ranges or to people already near the top.
 *
 * Expressed per 0.01 of compa-ratio because that is the granularity a
 * practitioner reads: "it cost us $180,000 to move the median a point".
 */
export function costPerCompaRatioPoint(
  budget: BudgetSummary,
  distribution: DistributionSummary,
): number | null {
  const shift = distribution.medianShift
  if (shift === null || shift <= 0) return null
  if (budget.totalSpend <= 0) return null
  return budget.totalSpend / (shift * 100)
}

export interface GradeStructureRow {
  gradeId: string
  gradeName: string
  order: number
  min: number
  mid: number
  max: number
  spread: number | null
  /** Progression from the grade below. Null for the lowest grade. */
  progressionFromBelow: number | null
  /** Median range penetration of this grade's population, after the cycle. */
  medianPenetrationAfter: number | null
  headcount: number
  /** Overlap with the grade below, as a proportion of this grade's width. */
  overlapWithBelow: number | null
}

/**
 * The structure itself, reported rather than assumed.
 *
 * Range penetration finally appears here. It has been calculated and tested
 * since the maths library was written and shown nowhere: compa-ratio measures
 * against a single point, penetration measures position across the whole span,
 * and a grade whose people sit at 0.95 compa-ratio can be anywhere from the
 * floor to two thirds up depending on how wide the range is.
 */
export function structureRows(
  grades: Grade[],
  results: EmployeeMeritResult[],
): GradeStructureRow[] {
  const ordered = [...grades].sort((a, b) => a.order - b.order)
  const progressions = calculateStructureProgressions(grades)
  const progressionInto = new Map(
    progressions.map((p) => [p.higherGradeId, p.progression]),
  )

  return ordered.map((grade, index) => {
    const mine = results.filter(
      (r) => r.gradeId === grade.id && !r.excluded && r.fte > 0,
    )
    const penetrations = mine
      .map((r) =>
        calculateRangePenetration(r.newSalary, grade.min, grade.max, r.fte),
      )
      .filter((p): p is number => p !== null)

    const below = index > 0 ? ordered[index - 1] : null
    const width = grade.max - grade.min

    return {
      gradeId: grade.id,
      gradeName: grade.name,
      order: grade.order,
      min: grade.min,
      mid: grade.mid,
      max: grade.max,
      spread: calculateRangeSpread(grade.min, grade.max),
      progressionFromBelow: progressionInto.get(grade.id) ?? null,
      medianPenetrationAfter: median(penetrations),
      headcount: mine.length,
      overlapWithBelow:
        below && width > 0
          ? Math.max(0, below.max - grade.min) / width
          : null,
    }
  })
}
