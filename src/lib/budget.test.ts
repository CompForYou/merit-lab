import { describe, it, expect } from 'vitest'
import { summarizeBudget, summarizeBudgetBy } from './budget'
import { calculateEmployeeMerit } from './merit-increase'
import { DEFAULT_COMPA_RATIO_BANDS } from './compa-ratio-bands'
import type {
  Employee,
  Grade,
  MeritMatrix,
  OverMaxMode,
  ScenarioSettings,
} from '../types/domain'

const GRADE: Grade = {
  id: 'G1',
  name: 'Analyst',
  order: 1,
  min: 70_000,
  mid: 90_000,
  max: 100_000,
}

const MATRIX: MeritMatrix = {
  ratings: ['Exceeds', 'Meets'],
  bands: DEFAULT_COMPA_RATIO_BANDS,
  cells: {
    Exceeds: {
      'band-below-080': 0.06,
      'band-080-090': 0.05,
      'band-090-100': 0.045,
      'band-100-110': 0.04,
      'band-above-110': 0.02,
    },
    Meets: {
      'band-below-080': 0.04,
      'band-080-090': 0.035,
      'band-090-100': 0.03,
      'band-100-110': 0.025,
      'band-above-110': 0.01,
    },
  },
}

const TARGET = 0.0325

const settings = (overMaxMode: OverMaxMode = 'capAtMax'): ScenarioSettings => ({
  targetBudgetPercent: TARGET,
  overMaxMode,
  prorationEnabled: false,
  compressionThreshold: 0.02,
})

// A six-person population, hand-costed below.
//
//  id  salary   rating   eligible  compa-ratio  band       pct     uncapped
//  E1   81,000  Meets    yes       0.9000       0.90-1.00  3.0%     2,430
//  E2   98,000  Exceeds  yes       1.0889       1.00-1.10  4.0%     3,920  (capped)
//  E3   60,000  Meets    yes       0.6667       below 0.80 4.0%     2,400
//  E4   90,000  Meets    yes       1.0000       1.00-1.10  2.5%     2,250
//  E5  100,000  Meets    NO        ineligible                           0
//  E6   85,000  Meets    yes       grade missing -> excluded            0
//
//  eligible payroll = 81,000 + 98,000 + 60,000 + 90,000 = 329,000
//  uncapped cost    =  2,430 +  3,920 +  2,400 +  2,250 =  11,000
const POPULATION: Employee[] = [
  { id: 'E1', gradeId: 'G1', baseSalary: 81_000, performanceRating: 'Meets', fte: 1, eligible: true },
  { id: 'E2', gradeId: 'G1', baseSalary: 98_000, performanceRating: 'Exceeds', fte: 1, eligible: true },
  { id: 'E3', gradeId: 'G1', baseSalary: 60_000, performanceRating: 'Meets', fte: 1, eligible: true },
  { id: 'E4', gradeId: 'G1', baseSalary: 90_000, performanceRating: 'Meets', fte: 1, eligible: true },
  { id: 'E5', gradeId: 'G1', baseSalary: 100_000, performanceRating: 'Meets', fte: 1, eligible: false },
  { id: 'E6', gradeId: 'GX', baseSalary: 85_000, performanceRating: 'Meets', fte: 1, eligible: true },
]

const run = (mode: OverMaxMode = 'capAtMax') =>
  POPULATION.map((e) =>
    calculateEmployeeMerit(
      e,
      e.gradeId === 'G1' ? GRADE : undefined,
      MATRIX,
      settings(mode),
    ),
  )

describe('summarizeBudget - headcount', () => {
  const s = summarizeBudget(run(), TARGET)

  it('counts everyone', () => {
    expect(s.totalHeadcount).toBe(6)
  })

  it('counts the four employees that were actually costed', () => {
    expect(s.eligibleHeadcount).toBe(4)
  })

  it('counts the ineligible employee separately', () => {
    expect(s.ineligibleHeadcount).toBe(1)
  })

  it('counts the uncostable employee separately again', () => {
    expect(s.excludedHeadcount).toBe(1)
  })

  it('accounts for every employee exactly once', () => {
    expect(
      s.eligibleHeadcount + s.ineligibleHeadcount + s.excludedHeadcount,
    ).toBe(s.totalHeadcount)
  })
})

describe('summarizeBudget - eligible payroll', () => {
  const s = summarizeBudget(run(), TARGET)

  it('sums only the eligible, costable employees', () => {
    // 81,000 + 98,000 + 60,000 + 90,000 = 329,000
    expect(s.eligiblePayroll).toBe(329_000)
  })

  it('excludes the ineligible employee from the denominator', () => {
    // E5 on 100,000 is not in the 329,000.
    expect(s.eligiblePayroll).not.toBe(429_000)
  })

  it('excludes the uncostable employee from the denominator', () => {
    // E6 on 85,000 contributes nothing to the numerator, so it must contribute
    // nothing to the denominator. Including it would understate spend.
    expect(s.eligiblePayroll).not.toBe(414_000)
  })
})

describe('summarizeBudget - capAtMax mode', () => {
  const s = summarizeBudget(run('capAtMax'), TARGET)

  it('reports what the matrix alone called for', () => {
    // 2,430 + 3,920 + 2,400 + 2,250 = 11,000
    expect(s.uncappedCost).toBeCloseTo(11_000, 6)
  })

  it('builds 9,080 into base after the cap', () => {
    // E2 capped from 3,920 to 2,000: 2,430 + 2,000 + 2,400 + 2,250 = 9,080
    expect(s.baseBuildCost).toBeCloseTo(9_080, 6)
  })

  it('pays no lump sums', () => {
    expect(s.lumpSumCost).toBe(0)
  })

  it('reports total spend equal to base build', () => {
    expect(s.totalSpend).toBeCloseTo(9_080, 6)
  })

  it('makes the money withheld by the cap visible', () => {
    // 11,000 - 9,080 = 1,920
    expect(s.reducedByCap).toBeCloseTo(1_920, 6)
    expect(s.uncappedCost - s.totalSpend).toBeCloseTo(s.reducedByCap, 6)
  })

  it('spends 2.76% of eligible payroll', () => {
    // 9,080 / 329,000 = 0.0275988...
    expect(s.budgetSpendPercent).toBeCloseTo(0.0275988, 7)
  })

  it('is 0.49 percentage points under a 3.25% target', () => {
    // 0.0275988 - 0.0325 = -0.0049012
    expect(s.varianceToTargetPercent).toBeCloseTo(-0.0049012, 7)
  })

  it('is 1,612.50 under target in dollars', () => {
    // target dollars = 0.0325 x 329,000 = 10,692.50
    // variance       = 9,080 - 10,692.50 = -1,612.50
    expect(s.varianceToTargetDollars).toBeCloseTo(-1_612.5, 6)
  })
})

describe('summarizeBudget - lumpSum mode', () => {
  const s = summarizeBudget(run('lumpSum'), TARGET)

  it('builds the same 9,080 into base as capAtMax', () => {
    expect(s.baseBuildCost).toBeCloseTo(9_080, 6)
  })

  it('pays the withheld 1,920 as a lump sum instead', () => {
    expect(s.lumpSumCost).toBeCloseTo(1_920, 6)
  })

  it('spends 11,000 in cash, the full uncapped amount', () => {
    expect(s.totalSpend).toBeCloseTo(11_000, 6)
    expect(s.reducedByCap).toBeCloseTo(0, 6)
  })

  it('reports base build and cash spend as different percentages', () => {
    //  base build: 9,080 / 329,000 = 2.76%
    // total spend: 11,000 / 329,000 = 3.34%
    expect(s.baseBuildPercent).toBeCloseTo(0.0275988, 7)
    expect(s.budgetSpendPercent).toBeCloseTo(0.0334347, 7)
  })

  it('is OVER target in cash where capAtMax was under', () => {
    // 11,000 - 10,692.50 = +307.50
    expect(s.varianceToTargetDollars).toBeCloseTo(307.5, 6)
    // Same matrix, same population, opposite budget answer. This is why the
    // over-maximum mode has to be shown on the results screen.
    const capped = summarizeBudget(run('capAtMax'), TARGET)
    expect(capped.varianceToTargetDollars).toBeCloseTo(-1_612.5, 6)
  })
})

describe('summarizeBudget - allowOverMax mode', () => {
  const s = summarizeBudget(run('allowOverMax'), TARGET)

  it('builds the whole 11,000 into base', () => {
    expect(s.baseBuildCost).toBeCloseTo(11_000, 6)
    expect(s.lumpSumCost).toBe(0)
    expect(s.totalSpend).toBeCloseTo(11_000, 6)
  })

  it('costs the same cash as lumpSum but builds more base', () => {
    const lump = summarizeBudget(run('lumpSum'), TARGET)
    expect(s.totalSpend).toBeCloseTo(lump.totalSpend, 6)
    // 11,000 into base versus 9,080. The run-rate difference a single cost
    // figure would hide.
    expect(s.baseBuildCost).toBeCloseTo(11_000, 6)
    expect(lump.baseBuildCost).toBeCloseTo(9_080, 6)
  })
})

describe('summarizeBudget - empty and degenerate populations', () => {
  it('returns nulls rather than dividing by zero on an empty population', () => {
    const s = summarizeBudget([], TARGET)
    expect(s.eligiblePayroll).toBe(0)
    expect(s.budgetSpendPercent).toBeNull()
    expect(s.varianceToTargetPercent).toBeNull()
    expect(s.varianceToTargetDollars).toBeNull()
  })

  it('returns nulls when nobody is eligible', () => {
    const noneEligible = POPULATION.map((e) => ({ ...e, eligible: false }))
    const results = noneEligible.map((e) =>
      calculateEmployeeMerit(e, e.gradeId === 'G1' ? GRADE : undefined, MATRIX, settings()),
    )
    const s = summarizeBudget(results, TARGET)
    expect(s.eligiblePayroll).toBe(0)
    expect(s.budgetSpendPercent).toBeNull()
  })
})

describe('summarizeBudgetBy', () => {
  const TWO_GRADE: Grade[] = [
    GRADE,
    { id: 'G2', name: 'Senior', order: 2, min: 90_000, mid: 110_000, max: 130_000 },
  ]

  const mixed: Employee[] = [
    { id: 'A1', gradeId: 'G1', baseSalary: 81_000, performanceRating: 'Meets', fte: 1, eligible: true },
    { id: 'A2', gradeId: 'G1', baseSalary: 90_000, performanceRating: 'Meets', fte: 1, eligible: true },
    { id: 'B1', gradeId: 'G2', baseSalary: 110_000, performanceRating: 'Meets', fte: 1, eligible: true },
  ]

  const results = mixed.map((e) =>
    calculateEmployeeMerit(
      e,
      TWO_GRADE.find((g) => g.id === e.gradeId),
      MATRIX,
      settings(),
    ),
  )

  it('splits the population by grade', () => {
    const byGrade = summarizeBudgetBy(results, (r) => r.gradeId, TARGET)
    expect([...byGrade.keys()]).toEqual(['G1', 'G2'])
    expect(byGrade.get('G1')!.eligibleHeadcount).toBe(2)
    expect(byGrade.get('G2')!.eligibleHeadcount).toBe(1)
  })

  it('computes eligible payroll per grade', () => {
    const byGrade = summarizeBudgetBy(results, (r) => r.gradeId, TARGET)
    // G1: 81,000 + 90,000 = 171,000    G2: 110,000
    expect(byGrade.get('G1')!.eligiblePayroll).toBe(171_000)
    expect(byGrade.get('G2')!.eligiblePayroll).toBe(110_000)
  })

  it('computes cost per grade', () => {
    const byGrade = summarizeBudgetBy(results, (r) => r.gradeId, TARGET)
    // G1: 81,000 at 0.90 compa-ratio -> 3.0% -> 2,430
    //     90,000 at 1.00 compa-ratio -> 2.5% -> 2,250      total 4,680
    // G2: 110,000 at 1.00 compa-ratio -> 2.5% -> 2,750
    expect(byGrade.get('G1')!.totalSpend).toBeCloseTo(4_680, 6)
    expect(byGrade.get('G2')!.totalSpend).toBeCloseTo(2_750, 6)
  })

  it('produces group totals that reconcile to the whole', () => {
    const whole = summarizeBudget(results, TARGET)
    const byGrade = summarizeBudgetBy(results, (r) => r.gradeId, TARGET)
    const summed = [...byGrade.values()].reduce((t, g) => t + g.totalSpend, 0)
    expect(summed).toBeCloseTo(whole.totalSpend, 6)
  })

  it('groups by an arbitrary attribute', () => {
    const department = new Map([
      ['A1', 'Finance'],
      ['A2', 'Finance'],
      ['B1', 'Operations'],
    ])
    const byDept = summarizeBudgetBy(
      results,
      (r) => department.get(r.employeeId) ?? 'Unspecified',
      TARGET,
    )
    expect(byDept.get('Finance')!.eligibleHeadcount).toBe(2)
    expect(byDept.get('Operations')!.eligibleHeadcount).toBe(1)
  })
})
