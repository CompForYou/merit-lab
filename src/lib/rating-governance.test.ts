import { describe, it, expect } from 'vitest'
import { ratingGovernance, topBoxRatings, topBoxPayPosition } from './rating-governance'
import type { EmployeeMeritResult } from './merit-increase'

const RATINGS = ['Exceeds', 'Strong', 'Meets', 'Developing', 'Below']

function person(
  employeeId: string,
  performanceRating: string,
  compaRatio: number | null = 1,
): EmployeeMeritResult {
  return {
    employeeId,
    gradeId: 'G1',
    fte: 1,
    performanceRating,
    eligible: true,
    excluded: false,
    exclusionReason: null,
    compaRatio,
    bandId: 'band',
    matrixPercent: 0.03,
    prorationFactor: 1,
    baseSalary: 100_000,
    uncappedIncreaseAmount: 3_000,
    increaseAmount: 3_000,
    lumpSumAmount: 0,
    reducedByCap: 0,
    newSalary: 103_000,
    newCompaRatio: 1.03,
    wasOverMaximumBefore: false,
    isOverMaximumAfter: false,
    crossedMaximum: false,
    wasBelowMinimumBefore: false,
    isBelowMinimumAfter: false,
  }
}

/**
 * Sales rates ten people: four Exceeds, one Strong, five Meets.
 * Operations rates ten: one Exceeds, one Strong, eight Meets.
 *
 * Top box is the best two ratings on a five-point scale, so Sales is 5 of 10
 * (50%), Operations is 2 of 10 (20%), and the company is 7 of 20 (35%).
 */
const SALES = [
  ...['S1', 'S2', 'S3', 'S4'].map((id) => person(id, 'Exceeds')),
  person('S5', 'Strong'),
  ...['S6', 'S7', 'S8', 'S9', 'S10'].map((id) => person(id, 'Meets')),
]
const OPS = [
  person('O1', 'Exceeds'),
  person('O2', 'Strong'),
  ...['O3', 'O4', 'O5', 'O6', 'O7', 'O8', 'O9', 'O10'].map((id) => person(id, 'Meets')),
]

const DEPARTMENT = new Map<string, string>([
  ...SALES.map((p) => [p.employeeId, 'Sales'] as [string, string]),
  ...OPS.map((p) => [p.employeeId, 'Operations'] as [string, string]),
])

const keyOf = (r: EmployeeMeritResult) => DEPARTMENT.get(r.employeeId) ?? 'Unknown'
const labelOf = (k: string) => k

describe('topBoxRatings', () => {
  it('takes the best two on a scale of four or more', () => {
    // A five-point scale usually reserves its highest rating for a handful of
    // people, and a share that small is too unstable to compare a team of nine
    // against a team of ninety.
    expect(topBoxRatings(RATINGS)).toEqual(['Exceeds', 'Strong'])
    expect(topBoxRatings(['A', 'B', 'C', 'D'])).toEqual(['A', 'B'])
  })

  it('takes only the best on a shorter scale', () => {
    // Two of three ratings is most of the scale and measures nothing.
    expect(topBoxRatings(['A', 'B', 'C'])).toEqual(['A'])
    expect(topBoxRatings(['A'])).toEqual(['A'])
  })

  it('handles an empty scale', () => {
    expect(topBoxRatings([])).toEqual([])
  })
})

describe('ratingGovernance', () => {
  const report = ratingGovernance([...SALES, ...OPS], keyOf, labelOf, RATINGS)

  it('reports the whole population as the comparison', () => {
    expect(report.overallTopBoxShare).toBeCloseTo(7 / 20, 10)
    expect(report.overall.find((s) => s.rating === 'Exceeds')).toMatchObject({
      count: 5,
      share: 5 / 20,
    })
  })

  it('gives every group a share of every rating', () => {
    const sales = report.rows.find((r) => r.key === 'Sales')!
    expect(sales.shares.map((s) => s.rating)).toEqual(RATINGS)
    expect(sales.shares.find((s) => s.rating === 'Exceeds')).toMatchObject({
      count: 4,
      share: 0.4,
    })
    expect(sales.shares.find((s) => s.rating === 'Below')).toMatchObject({
      count: 0,
      share: 0,
    })
  })

  it('measures generosity against the company, in points', () => {
    const sales = report.rows.find((r) => r.key === 'Sales')!
    const ops = report.rows.find((r) => r.key === 'Operations')!

    // Sales 50% against a company 35% is fifteen points above.
    expect(sales.topBoxShare).toBeCloseTo(0.5, 10)
    expect(sales.topBoxGap).toBeCloseTo(0.15, 10)

    // Operations 20% is fifteen points below.
    expect(ops.topBoxShare).toBeCloseTo(0.2, 10)
    expect(ops.topBoxGap).toBeCloseTo(-0.15, 10)
  })

  it('puts the most generous group first', () => {
    // The outlier is the row a director is looking for.
    expect(report.rows.map((r) => r.key)).toEqual(['Sales', 'Operations'])
  })

  it('counts only employees the matrix has a row for', () => {
    // Someone carrying a rating with no matrix row is already reported by name
    // as uncosted. Folding them into a denominator would understate every share.
    const withStray = ratingGovernance(
      [...SALES, ...OPS, person('X1', 'Outstanding')],
      keyOf,
      labelOf,
      RATINGS,
    )
    expect(withStray.overall.reduce((n, s) => n + s.count, 0)).toBe(20)
    expect(withStray.rows.some((r) => r.key === 'Unknown')).toBe(false)
  })
})

describe('ratingGovernance - small groups', () => {
  const TINY = [person('T1', 'Exceeds'), person('T2', 'Exceeds'), person('T3', 'Meets')]
  const withTiny = [...SALES, ...OPS, ...TINY]
  const key = (r: EmployeeMeritResult) =>
    r.employeeId.startsWith('T') ? 'Legal' : keyOf(r)

  const report = ratingGovernance(withTiny, key, labelOf, RATINGS)
  const legal = report.rows.find((r) => r.key === 'Legal')!

  it('marks a group below the threshold as suppressed', () => {
    expect(legal.suppressed).toBe(true)
  })

  it('still reports its headcount and counts', () => {
    // Knowing a team has three people is useful and not disclosive.
    expect(legal.ratedHeadcount).toBe(3)
    expect(legal.shares.find((s) => s.rating === 'Exceeds')?.count).toBe(2)
  })

  it('withholds its shares', () => {
    // A percentage across three people is unstable enough to mislead and small
    // enough that a reader who knows the team can back out an individual.
    expect(legal.shares.every((s) => s.share === null)).toBe(true)
    expect(legal.topBoxShare).toBeNull()
    expect(legal.topBoxGap).toBeNull()
  })

  it('sorts suppressed groups last, whatever their counts', () => {
    // Two of three is 67%, the most generous figure in the file, and it must
    // not lead the table on the strength of three people.
    expect(report.rows[report.rows.length - 1].key).toBe('Legal')
  })

  it('still counts a small group in the company figures', () => {
    // Suppression is about what is displayed for that group, not about removing
    // people from the population they belong to.
    expect(report.overall.reduce((n, s) => n + s.count, 0)).toBe(23)
  })
})

describe('topBoxPayPosition', () => {
  it('shows when the best ratings sit on the best-paid people', () => {
    // Top-box employees at 1.10, everybody else at 0.95: the good ratings are
    // landing where the money already is, and the plan is widening a gap.
    const results = [
      person('A', 'Exceeds', 1.1),
      person('B', 'Strong', 1.1),
      person('C', 'Meets', 0.95),
      person('D', 'Developing', 0.95),
    ]
    const position = topBoxPayPosition(results, RATINGS)
    expect(position.topBoxMedian).toBeCloseTo(1.1, 10)
    expect(position.othersMedian).toBeCloseTo(0.95, 10)
    expect(position.gap).toBeCloseTo(0.15, 10)
  })

  it('reports a negative gap when the top ratings are the lower paid', () => {
    const results = [
      person('A', 'Exceeds', 0.9),
      person('B', 'Meets', 1.05),
      person('C', 'Meets', 1.05),
    ]
    expect(topBoxPayPosition(results, RATINGS).gap).toBeCloseTo(-0.15, 10)
  })

  it('returns nulls rather than zero when a side is empty', () => {
    // No top-box employees at all is an absence, not a gap of zero.
    const results = [person('A', 'Meets', 1), person('B', 'Meets', 1)]
    const position = topBoxPayPosition(results, RATINGS)
    expect(position.topBoxMedian).toBeNull()
    expect(position.gap).toBeNull()
  })

  it('ignores anyone without a compa-ratio', () => {
    const results = [
      person('A', 'Exceeds', null),
      person('B', 'Exceeds', 1.2),
      person('C', 'Meets', 1),
    ]
    expect(topBoxPayPosition(results, RATINGS).topBoxMedian).toBeCloseTo(1.2, 10)
  })
})
