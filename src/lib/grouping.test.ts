import { describe, it, expect } from 'vitest'
import {
  groupResults,
  availableGroupings,
  widestAverageGap,
  MIN_GROUP_SIZE,
  GROUP_BY_GRADE,
} from './grouping'
import { runScenario } from './run-scenario'
import { SAMPLE_POPULATION } from '../data/sample-population'
import { SAMPLE_GRADES } from '../data/sample-structure'
import { DEFAULT_MERIT_MATRIX, DEFAULT_SETTINGS } from '../data/default-matrix'
import { DEFAULT_COMPA_RATIO_BANDS } from './compa-ratio-bands'
import type { Employee, Grade, MeritMatrix, ScenarioSettings } from '../types/domain'

const GRADE: Grade = {
  id: 'G1', name: 'Analyst', order: 1, min: 70_000, mid: 90_000, max: 100_000,
}

const MATRIX: MeritMatrix = {
  ratings: ['Meets'],
  bands: DEFAULT_COMPA_RATIO_BANDS,
  cells: {
    Meets: {
      'band-below-080': 0.04,
      'band-080-090': 0.035,
      'band-090-100': 0.03,
      'band-100-110': 0.025,
      'band-above-110': 0.01,
    },
  },
}

const SETTINGS: ScenarioSettings = {
  targetBudgetPercent: 0.0325,
  overMaxMode: 'capAtMax',
  prorationEnabled: false,
  compressionThreshold: 0.02,
}

const staff = (department: string, count: number, salary = 81_000): Employee[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `${department}-${i}`,
    gradeId: 'G1',
    baseSalary: salary,
    performanceRating: 'Meets',
    fte: 1,
    eligible: true,
    attributes: { department },
  }))

const byDepartment = (employees: Employee[]) => {
  const lookup = new Map(
    employees.map((e) => [e.id, e.attributes?.department ?? 'Unspecified']),
  )
  const results = runScenario(employees, [GRADE], MATRIX, SETTINGS).results
  return groupResults(
    results,
    (r) => lookup.get(r.employeeId) ?? 'Unspecified',
    (k) => k,
    SETTINGS.targetBudgetPercent,
  )
}

describe('availableGroupings', () => {
  it('always offers grade', () => {
    expect(availableGroupings([])).toEqual([GROUP_BY_GRADE])
  })

  it('offers every column that came in with the file, sorted', () => {
    const employees: Employee[] = [
      { ...staff('Finance', 1)[0], attributes: { department: 'Finance', location: 'Remote' } },
      { ...staff('Ops', 1)[0], attributes: { department: 'Ops', team: 'A' } },
    ]
    expect(availableGroupings(employees)).toEqual([
      GROUP_BY_GRADE,
      'department',
      'location',
      'team',
    ])
  })
})

describe('groupResults - the money', () => {
  const rows = byDepartment([...staff('Finance', 6), ...staff('Operations', 5)])

  it('returns one row per group', () => {
    expect(rows.map((r) => r.key).sort()).toEqual(['Finance', 'Operations'])
  })

  it('counts and costs each group', () => {
    // 81,000 at 0.90 compa-ratio -> 0.90-1.00 band -> Meets 3% -> 2,430 each.
    const finance = rows.find((r) => r.key === 'Finance')!
    expect(finance.headcount).toBe(6)
    expect(finance.eligiblePayroll).toBe(486_000)
    expect(finance.totalSpend).toBeCloseTo(6 * 2_430, 6)
  })

  it('reconciles group spend to the whole population', () => {
    const employees = [...staff('Finance', 6), ...staff('Operations', 5)]
    const whole = runScenario(employees, [GRADE], MATRIX, SETTINGS).budget
    const summed = byDepartment(employees).reduce((t, r) => t + r.totalSpend, 0)
    expect(summed).toBeCloseTo(whole.totalSpend, 6)
  })
})

describe('groupResults - average increase is not spend percentage', () => {
  it('weights people equally, where spend weights salaries', () => {
    // One person on 60,000 gets 4% (below 0.80 band); five on 95,000 get 2.5%
    // (1.00-1.10 band). Spend is dominated by the larger salaries; the average
    // increase is not.
    //
    // 95,000 rather than 99,000 on purpose: 99,000 is compa-ratio 1.10 exactly,
    // and the lower bound is inclusive, so it falls in the TOP band at 1% and
    // would be testing band assignment rather than the point at hand.
    const employees: Employee[] = [
      ...staff('Mixed', 1, 60_000).map((e) => ({ ...e, id: 'low' })),
      ...staff('Mixed', 5, 95_000),
    ]
    const [row] = byDepartment(employees)

    // average of one 4% and five 2.5% = (0.04 + 5 x 0.025) / 6 = 0.0275
    expect(row.averageIncreasePercent).toBeCloseTo(0.0275, 6)
    // spend = (2,400 + 5 x 2,375) / (60,000 + 5 x 95,000) = 14,275 / 535,000
    expect(row.spendPercent).toBeCloseTo(0.0266822, 6)
    expect(row.averageIncreasePercent).not.toBeCloseTo(row.spendPercent!, 4)
  })
})

describe('groupResults - small groups are suppressed', () => {
  const rows = byDepartment([
    ...staff('Big', MIN_GROUP_SIZE),
    ...staff('Small', MIN_GROUP_SIZE - 1),
  ])
  const big = rows.find((r) => r.key === 'Big')!
  const small = rows.find((r) => r.key === 'Small')!

  it('marks a group under the threshold as suppressed', () => {
    expect(small.suppressed).toBe(true)
    expect(big.suppressed).toBe(false)
  })

  it('still reports counts, which are not disclosive', () => {
    expect(small.headcount).toBe(MIN_GROUP_SIZE - 1)
    expect(small.eligibleCount).toBe(MIN_GROUP_SIZE - 1)
  })

  it('withholds every average for a suppressed group', () => {
    // An average across four people is unstable enough to mislead and small
    // enough that a reader who knows the team can back out an individual.
    expect(small.averageIncreasePercent).toBeNull()
    expect(small.spendPercent).toBeNull()
    expect(small.medianCompaRatioBefore).toBeNull()
    expect(small.medianCompaRatioAfter).toBeNull()
  })

  it('reports them for a group at the threshold', () => {
    expect(big.averageIncreasePercent).toBeCloseTo(0.03, 6)
    expect(big.spendPercent).toBeCloseTo(0.03, 6)
    expect(big.medianCompaRatioBefore).toBeCloseTo(0.9, 10)
  })

  it('leaves total spend visible even when suppressed', () => {
    // The money still has to reconcile to the whole population, so a suppressed
    // group cannot simply be dropped from the total.
    expect(small.totalSpend).toBeGreaterThan(0)
  })
})

describe('widestAverageGap', () => {
  it('finds the largest difference between reportable groups', () => {
    // Everyone at 81,000 gets 3%, except Ops who sit at 60,000 and get 4%.
    const rows = byDepartment([
      ...staff('Finance', 5),
      ...staff('Ops', 5, 60_000),
    ])
    const gap = widestAverageGap(rows)!
    expect(gap.highest.key).toBe('Ops')
    expect(gap.lowest.key).toBe('Finance')
    expect(gap.points).toBeCloseTo(0.01, 6)
  })

  it('ignores suppressed groups entirely', () => {
    // A four-person group must not set the headline gap.
    const rows = byDepartment([
      ...staff('Finance', 5),
      ...staff('Ops', 5, 60_000),
      ...staff('Tiny', 4, 40_000),
    ])
    const gap = widestAverageGap(rows)!
    expect([gap.highest.key, gap.lowest.key]).not.toContain('Tiny')
  })

  it('returns null when fewer than two groups can be reported', () => {
    expect(widestAverageGap(byDepartment(staff('Only', 5)))).toBeNull()
    expect(widestAverageGap(byDepartment(staff('Tiny', 3)))).toBeNull()
  })
})

describe('groupResults - the sample population', () => {
  const scenario = runScenario(
    SAMPLE_POPULATION, SAMPLE_GRADES, DEFAULT_MERIT_MATRIX, DEFAULT_SETTINGS,
  )
  const lookup = new Map(
    SAMPLE_POPULATION.map((e) => [e.id, e.attributes?.department ?? 'Unspecified']),
  )
  const rows = groupResults(
    scenario.results,
    (r) => lookup.get(r.employeeId) ?? 'Unspecified',
    (k) => k,
    DEFAULT_SETTINGS.targetBudgetPercent,
  )

  it('splits the sample into its five departments', () => {
    expect(rows).toHaveLength(5)
  })

  it('accounts for every employee exactly once', () => {
    expect(rows.reduce((n, r) => n + r.headcount, 0)).toBe(204)
  })

  it('reconciles to the whole-population spend', () => {
    const summed = rows.reduce((t, r) => t + r.totalSpend, 0)
    expect(summed).toBeCloseTo(scenario.budget.totalSpend, 6)
  })

  it('reports every department, since all are above the threshold', () => {
    for (const row of rows) {
      expect(row.suppressed, `${row.key} has ${row.eligibleCount}`).toBe(false)
      expect(row.averageIncreasePercent).not.toBeNull()
    }
  })

  it('groups by grade using the same function', () => {
    const gradeName = new Map(SAMPLE_GRADES.map((g) => [g.id, g.name]))
    const byGrade = groupResults(
      scenario.results,
      (r) => r.gradeId,
      (k) => gradeName.get(k) ?? k,
      DEFAULT_SETTINGS.targetBudgetPercent,
    )
    expect(byGrade).toHaveLength(8)
    expect(byGrade.reduce((n, r) => n + r.headcount, 0)).toBe(204)
    expect(byGrade.find((r) => r.key === 'G1')!.label).toBe('Grade 1')
  })
})
