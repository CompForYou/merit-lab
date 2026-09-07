import type { Employee, Grade } from '../types/domain'
import { calculateCompaRatio } from './compa-ratio'
import { mean, median } from './statistics'

/** One grade's slice of the population, before any merit cycle is applied. */
export interface GradeProfile {
  gradeId: string
  gradeName: string
  order: number
  headcount: number
  eligibleCount: number
  /** Actual pay, summed. Not grossed to full-time: this is what payroll spends. */
  payroll: number
  medianCompaRatio: number | null
  belowMinimum: number
  aboveMaximum: number
}

/**
 * What a population looks like sitting in a structure, before any matrix exists.
 *
 * Useful on its own: it answers "where is my population relative to my ranges"
 * and it is the check a practitioner runs before trusting anything downstream.
 * If these numbers look wrong, the data is wrong, and no merit modelling built
 * on top of it is worth reading.
 */
export interface PopulationProfile {
  headcount: number
  eligibleCount: number
  ineligibleCount: number
  partTimeCount: number

  totalPayroll: number
  eligiblePayroll: number

  meanCompaRatio: number | null
  medianCompaRatio: number | null

  belowMinimum: number
  aboveMaximum: number
  /** Employees whose grade is missing or has no midpoint. Reported, never hidden. */
  unplaceable: number

  byGrade: GradeProfile[]
  ratingCounts: { rating: string; count: number }[]
}

/**
 * Profile a population against a structure.
 *
 * Range placement uses full-time equivalent salary; payroll uses actual pay.
 * The same split as everywhere else in this library, for the same reason.
 */
export function profilePopulation(
  employees: Employee[],
  grades: Grade[],
): PopulationProfile {
  const gradeById = new Map(grades.map((g) => [g.id, g]))

  let eligibleCount = 0
  let partTimeCount = 0
  let totalPayroll = 0
  let eligiblePayroll = 0
  let belowMinimum = 0
  let aboveMaximum = 0
  let unplaceable = 0

  const compaRatios: number[] = []
  const ratingTally = new Map<string, number>()
  const perGrade = new Map<string, number[]>()
  const gradeTally = new Map<
    string,
    { headcount: number; eligibleCount: number; payroll: number; below: number; above: number }
  >()

  for (const g of grades) {
    perGrade.set(g.id, [])
    gradeTally.set(g.id, {
      headcount: 0,
      eligibleCount: 0,
      payroll: 0,
      below: 0,
      above: 0,
    })
  }

  for (const e of employees) {
    totalPayroll += e.baseSalary
    if (e.eligible) {
      eligibleCount++
      eligiblePayroll += e.baseSalary
    }
    if (e.fte < 1) partTimeCount++
    ratingTally.set(e.performanceRating, (ratingTally.get(e.performanceRating) ?? 0) + 1)

    const grade = gradeById.get(e.gradeId)
    const compaRatio = grade
      ? calculateCompaRatio(e.baseSalary, grade.mid, e.fte)
      : null

    if (!grade || compaRatio === null) {
      unplaceable++
      continue
    }

    compaRatios.push(compaRatio)
    perGrade.get(grade.id)!.push(compaRatio)

    const fullTimeSalary = e.baseSalary / e.fte
    const isBelow = fullTimeSalary < grade.min
    const isAbove = fullTimeSalary > grade.max
    if (isBelow) belowMinimum++
    if (isAbove) aboveMaximum++

    const tally = gradeTally.get(grade.id)!
    tally.headcount++
    if (e.eligible) tally.eligibleCount++
    tally.payroll += e.baseSalary
    if (isBelow) tally.below++
    if (isAbove) tally.above++
  }

  const byGrade: GradeProfile[] = [...grades]
    .sort((a, b) => a.order - b.order)
    .map((g) => {
      const tally = gradeTally.get(g.id)!
      return {
        gradeId: g.id,
        gradeName: g.name,
        order: g.order,
        headcount: tally.headcount,
        eligibleCount: tally.eligibleCount,
        payroll: tally.payroll,
        medianCompaRatio: median(perGrade.get(g.id)!),
        belowMinimum: tally.below,
        aboveMaximum: tally.above,
      }
    })

  const ratingCounts = [...ratingTally.entries()]
    .map(([rating, count]) => ({ rating, count }))
    .sort((a, b) => b.count - a.count)

  return {
    headcount: employees.length,
    eligibleCount,
    ineligibleCount: employees.length - eligibleCount,
    partTimeCount,
    totalPayroll,
    eligiblePayroll,
    meanCompaRatio: mean(compaRatios),
    medianCompaRatio: median(compaRatios),
    belowMinimum,
    aboveMaximum,
    unplaceable,
    byGrade,
    ratingCounts,
  }
}
