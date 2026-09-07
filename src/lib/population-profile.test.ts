import { describe, it, expect } from 'vitest'
import { profilePopulation } from './population-profile'
import { SAMPLE_POPULATION } from '../data/sample-population'
import { SAMPLE_GRADES } from '../data/sample-structure'
import type { Employee, Grade } from '../types/domain'

const GRADES: Grade[] = [
  { id: 'G1', name: 'Analyst', order: 1, min: 70_000, mid: 90_000, max: 100_000 },
  { id: 'G2', name: 'Senior', order: 2, min: 90_000, mid: 110_000, max: 130_000 },
]

const emp = (o: Partial<Employee> & { id: string }): Employee => ({
  gradeId: 'G1',
  baseSalary: 90_000,
  performanceRating: 'Meets',
  fte: 1,
  eligible: true,
  ...o,
})

describe('profilePopulation - headcount and payroll', () => {
  const people = [
    emp({ id: 'A', baseSalary: 90_000 }),
    emp({ id: 'B', baseSalary: 81_000 }),
    emp({ id: 'C', baseSalary: 100_000, eligible: false }),
  ]
  const p = profilePopulation(people, GRADES)

  it('counts everyone', () => {
    expect(p.headcount).toBe(3)
    expect(p.eligibleCount).toBe(2)
    expect(p.ineligibleCount).toBe(1)
  })

  it('separates total payroll from eligible payroll', () => {
    // total:    90,000 + 81,000 + 100,000 = 271,000
    // eligible: 90,000 + 81,000           = 171,000
    expect(p.totalPayroll).toBe(271_000)
    expect(p.eligiblePayroll).toBe(171_000)
  })
})

describe('profilePopulation - compa-ratio', () => {
  it('averages across the whole placed population', () => {
    // 90,000/90,000 = 1.00, 81,000/90,000 = 0.90, 99,000/90,000 = 1.10
    // mean   = (1.00 + 0.90 + 1.10) / 3 = 1.00
    // median = 1.00
    const p = profilePopulation(
      [
        emp({ id: 'A', baseSalary: 90_000 }),
        emp({ id: 'B', baseSalary: 81_000 }),
        emp({ id: 'C', baseSalary: 99_000 }),
      ],
      GRADES,
    )
    expect(p.meanCompaRatio).toBeCloseTo(1, 10)
    expect(p.medianCompaRatio).toBeCloseTo(1, 10)
  })

  it('grosses part-timers to full-time before placing them', () => {
    // 0.5 FTE on 45,000 actual is 90,000 full-time, so compa-ratio 1.00.
    const p = profilePopulation(
      [emp({ id: 'A', baseSalary: 45_000, fte: 0.5 })],
      GRADES,
    )
    expect(p.medianCompaRatio).toBeCloseTo(1, 10)
    expect(p.partTimeCount).toBe(1)
    // But payroll counts what is actually paid.
    expect(p.totalPayroll).toBe(45_000)
  })
})

describe('profilePopulation - out of range', () => {
  it('counts green-circled and red-circled employees', () => {
    const p = profilePopulation(
      [
        emp({ id: 'A', baseSalary: 65_000 }), // below the 70,000 minimum
        emp({ id: 'B', baseSalary: 90_000 }), // inside
        emp({ id: 'C', baseSalary: 105_000 }), // above the 100,000 maximum
      ],
      GRADES,
    )
    expect(p.belowMinimum).toBe(1)
    expect(p.aboveMaximum).toBe(1)
  })

  it('does not count someone exactly on a boundary as outside it', () => {
    const p = profilePopulation(
      [
        emp({ id: 'A', baseSalary: 70_000 }),
        emp({ id: 'B', baseSalary: 100_000 }),
      ],
      GRADES,
    )
    expect(p.belowMinimum).toBe(0)
    expect(p.aboveMaximum).toBe(0)
  })

  it('scales the boundaries to a part-timer FTE', () => {
    // 0.5 FTE paid 34,000 is 68,000 full-time, under the 70,000 minimum.
    const p = profilePopulation(
      [emp({ id: 'A', baseSalary: 34_000, fte: 0.5 })],
      GRADES,
    )
    expect(p.belowMinimum).toBe(1)
  })
})

describe('profilePopulation - employees that cannot be placed', () => {
  it('counts an employee whose grade is missing', () => {
    const p = profilePopulation([emp({ id: 'A', gradeId: 'GX' })], GRADES)
    expect(p.unplaceable).toBe(1)
    expect(p.medianCompaRatio).toBeNull()
  })

  it('keeps them in headcount and payroll but out of the averages', () => {
    const p = profilePopulation(
      [emp({ id: 'A', baseSalary: 90_000 }), emp({ id: 'B', gradeId: 'GX', baseSalary: 50_000 })],
      GRADES,
    )
    expect(p.headcount).toBe(2)
    expect(p.totalPayroll).toBe(140_000)
    expect(p.unplaceable).toBe(1)
    // The unplaceable employee does not drag the compa-ratio.
    expect(p.medianCompaRatio).toBeCloseTo(1, 10)
  })
})

describe('profilePopulation - by grade', () => {
  const p = profilePopulation(
    [
      emp({ id: 'A', gradeId: 'G1', baseSalary: 81_000 }),
      emp({ id: 'B', gradeId: 'G1', baseSalary: 90_000 }),
      emp({ id: 'C', gradeId: 'G2', baseSalary: 110_000 }),
    ],
    GRADES,
  )

  it('returns a row per grade, in order', () => {
    expect(p.byGrade.map((g) => g.gradeName)).toEqual(['Analyst', 'Senior'])
  })

  it('counts and sums per grade', () => {
    expect(p.byGrade[0].headcount).toBe(2)
    expect(p.byGrade[0].payroll).toBe(171_000)
    expect(p.byGrade[1].headcount).toBe(1)
    expect(p.byGrade[1].payroll).toBe(110_000)
  })

  it('takes a median compa-ratio per grade', () => {
    // G1: 0.90 and 1.00 -> median 0.95
    expect(p.byGrade[0].medianCompaRatio).toBeCloseTo(0.95, 10)
    // G2: 110,000 / 110,000 = 1.00
    expect(p.byGrade[1].medianCompaRatio).toBeCloseTo(1, 10)
  })

  it('returns an empty grade with a null median rather than a zero', () => {
    const empty = profilePopulation([emp({ id: 'A', gradeId: 'G1' })], GRADES)
    expect(empty.byGrade[1].headcount).toBe(0)
    expect(empty.byGrade[1].medianCompaRatio).toBeNull()
  })

  it('reconciles grade payroll to total payroll', () => {
    const summed = p.byGrade.reduce((t, g) => t + g.payroll, 0)
    expect(summed).toBe(p.totalPayroll)
  })
})

describe('profilePopulation - rating counts', () => {
  it('tallies ratings, most common first', () => {
    const p = profilePopulation(
      [
        emp({ id: 'A', performanceRating: 'Meets' }),
        emp({ id: 'B', performanceRating: 'Meets' }),
        emp({ id: 'C', performanceRating: 'Exceeds' }),
      ],
      GRADES,
    )
    expect(p.ratingCounts).toEqual([
      { rating: 'Meets', count: 2 },
      { rating: 'Exceeds', count: 1 },
    ])
  })
})

describe('profilePopulation - the sample population', () => {
  const p = profilePopulation(SAMPLE_POPULATION, SAMPLE_GRADES)

  it('places every sample employee', () => {
    expect(p.headcount).toBe(204)
    expect(p.unplaceable).toBe(0)
  })

  it('reports the sample payroll', () => {
    expect(p.totalPayroll).toBe(17_057_300)
  })

  it('sits a little below midpoint', () => {
    expect(p.medianCompaRatio!).toBeGreaterThan(0.94)
    expect(p.medianCompaRatio!).toBeLessThan(1.01)
  })

  it('has employees outside the range in both directions', () => {
    expect(p.belowMinimum).toBeGreaterThan(0)
    expect(p.aboveMaximum).toBeGreaterThan(0)
  })

  it('covers all eight grades', () => {
    expect(p.byGrade).toHaveLength(8)
    for (const g of p.byGrade) expect(g.headcount).toBeGreaterThan(0)
  })
})

describe('profilePopulation - an empty population', () => {
  it('returns zeros and nulls rather than throwing', () => {
    const p = profilePopulation([], GRADES)
    expect(p.headcount).toBe(0)
    expect(p.totalPayroll).toBe(0)
    expect(p.medianCompaRatio).toBeNull()
    expect(p.byGrade).toHaveLength(2)
    expect(p.ratingCounts).toEqual([])
  })
})
