import { describe, it, expect } from 'vitest'
import { runScenario, fitToBudgetFactor } from './run-scenario'
import { findCell } from './matrix-cells'
import { scaleMatrix } from './matrix-edit'
import { SAMPLE_POPULATION } from '../data/sample-population'
import { SAMPLE_GRADES } from '../data/sample-structure'
import { DEFAULT_MERIT_MATRIX, DEFAULT_SETTINGS } from '../data/default-matrix'
import type { Employee, Grade, MeritMatrix, ScenarioSettings } from '../types/domain'
import { DEFAULT_COMPA_RATIO_BANDS } from './compa-ratio-bands'

const GRADE: Grade = {
  id: 'G1',
  name: 'Analyst',
  order: 1,
  min: 70_000,
  mid: 90_000,
  max: 100_000,
}

const SMALL_MATRIX: MeritMatrix = {
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

const SETTINGS: ScenarioSettings = {
  targetBudgetPercent: 0.0325,
  overMaxMode: 'capAtMax',
  prorationEnabled: false,
  compressionThreshold: 0.02,
}

// Four employees at compa-ratio 0.90, so all four land in the same band.
//   81,000 x 3.0% = 2,430 each for the two rated Meets
//   81,000 x 4.5% = 3,645 each for the two rated Exceeds
const FOUR: Employee[] = [
  { id: 'A', gradeId: 'G1', baseSalary: 81_000, performanceRating: 'Meets', fte: 1, eligible: true },
  { id: 'B', gradeId: 'G1', baseSalary: 81_000, performanceRating: 'Meets', fte: 1, eligible: true },
  { id: 'C', gradeId: 'G1', baseSalary: 81_000, performanceRating: 'Exceeds', fte: 1, eligible: true },
  { id: 'D', gradeId: 'G1', baseSalary: 81_000, performanceRating: 'Exceeds', fte: 1, eligible: true },
]

describe('runScenario - matrix cell costs', () => {
  const run = runScenario(FOUR, [GRADE], SMALL_MATRIX, SETTINGS)

  it('groups employees into the cell that priced them', () => {
    const meets = findCell(run.matrixCells, 'Meets', 'band-090-100')!
    const exceeds = findCell(run.matrixCells, 'Exceeds', 'band-090-100')!
    expect(meets.headcount).toBe(2)
    expect(exceeds.headcount).toBe(2)
  })

  it('costs each cell', () => {
    // 2 x 81,000 x 3.0% = 4,860
    // 2 x 81,000 x 4.5% = 7,290
    expect(findCell(run.matrixCells, 'Meets', 'band-090-100')!.cost).toBeCloseTo(4_860, 6)
    expect(findCell(run.matrixCells, 'Exceeds', 'band-090-100')!.cost).toBeCloseTo(7_290, 6)
  })

  it('records the eligible payroll behind each cell', () => {
    expect(findCell(run.matrixCells, 'Meets', 'band-090-100')!.eligiblePayroll).toBe(162_000)
  })

  it('leaves untouched cells at zero rather than absent', () => {
    const empty = findCell(run.matrixCells, 'Meets', 'band-above-110')!
    expect(empty.headcount).toBe(0)
    expect(empty.cost).toBe(0)
  })

  it('reconciles cell costs to the budget total', () => {
    expect(run.matrixCells.totalCost).toBeCloseTo(run.budget.totalSpend, 6)
  })

  it('reconciles cell headcount to the eligible headcount', () => {
    expect(run.matrixCells.totalHeadcount).toBe(run.budget.eligibleHeadcount)
  })

  it('totals by rating row and by band column', () => {
    expect(run.matrixCells.byRating.get('Meets')).toBeCloseTo(4_860, 6)
    expect(run.matrixCells.byRating.get('Exceeds')).toBeCloseTo(7_290, 6)
    expect(run.matrixCells.byBand.get('band-090-100')).toBeCloseTo(12_150, 6)
  })
})

describe('runScenario - a modest cell can cost more than a generous one', () => {
  it('prices thirty people at 3% above ten people at 5%', () => {
    // The reversal the spec asks the interface to show. 30 x 100,000 x 3% is
    // 90,000; 10 x 100,000 x 5% is 50,000. The generous cell is cheaper.
    const many: Employee[] = [
      ...Array.from({ length: 30 }, (_, i) => ({
        id: `M${i}`, gradeId: 'G1', baseSalary: 81_000,
        performanceRating: 'Meets', fte: 1, eligible: true,
      })),
      ...Array.from({ length: 10 }, (_, i) => ({
        id: `E${i}`, gradeId: 'G1', baseSalary: 81_000,
        performanceRating: 'Exceeds', fte: 1, eligible: true,
      })),
    ]
    const run = runScenario(many, [GRADE], SMALL_MATRIX, SETTINGS)
    const meets = findCell(run.matrixCells, 'Meets', 'band-090-100')!
    const exceeds = findCell(run.matrixCells, 'Exceeds', 'band-090-100')!

    expect(meets.increasePercent).toBeLessThan(exceeds.increasePercent)
    expect(meets.cost).toBeGreaterThan(exceeds.cost)
    // 30 x 2,430 = 72,900 against 10 x 3,645 = 36,450
    expect(meets.cost).toBeCloseTo(72_900, 6)
    expect(exceeds.cost).toBeCloseTo(36_450, 6)
  })
})

describe('runScenario - the sample population against the default matrix', () => {
  const run = runScenario(
    SAMPLE_POPULATION,
    SAMPLE_GRADES,
    DEFAULT_MERIT_MATRIX,
    DEFAULT_SETTINGS,
  )

  it('costs every employee', () => {
    expect(run.results).toHaveLength(204)
    expect(run.budget.excludedHeadcount).toBe(0)
  })

  it('lands slightly over a 3.25% target', () => {
    // A first draft usually does. 3.35% against 3.25%.
    expect(run.budget.budgetSpendPercent!).toBeCloseTo(0.0335, 4)
    expect(run.budget.varianceToTargetDollars!).toBeGreaterThan(0)
  })

  it('withholds money at the range maximum under capAtMax', () => {
    expect(run.budget.reducedByCap).toBeGreaterThan(0)
    expect(run.budget.uncappedCost).toBeGreaterThan(run.budget.totalSpend)
  })

  it('moves the median compa-ratio up the range', () => {
    expect(run.distribution.medianCompaRatioAfter!).toBeGreaterThan(
      run.distribution.medianCompaRatioBefore!,
    )
  })

  it('leaves some employees still below minimum', () => {
    // A merit matrix does not fix green-circling; that needs its own adjustment.
    expect(run.distribution.countStillBelowMinimum).toBeGreaterThan(0)
  })

  it('produces one compression pair per adjacent grade step', () => {
    expect(run.compression).toHaveLength(7)
  })

  it('reconciles by-grade spend to the whole', () => {
    const summed = [...run.byGrade.values()].reduce((t, g) => t + g.totalSpend, 0)
    expect(summed).toBeCloseTo(run.budget.totalSpend, 6)
  })
})

describe('runScenario - the over-maximum mode changes the answer', () => {
  const forMode = (overMaxMode: ScenarioSettings['overMaxMode']) =>
    runScenario(SAMPLE_POPULATION, SAMPLE_GRADES, DEFAULT_MERIT_MATRIX, {
      ...DEFAULT_SETTINGS,
      overMaxMode,
    }).budget

  it('costs least under capAtMax', () => {
    const cap = forMode('capAtMax')
    const over = forMode('allowOverMax')
    expect(cap.totalSpend).toBeLessThan(over.totalSpend)
  })

  it('costs the same cash under allowOverMax and lumpSum', () => {
    expect(forMode('allowOverMax').totalSpend).toBeCloseTo(
      forMode('lumpSum').totalSpend,
      6,
    )
  })

  it('builds less base under lumpSum than under allowOverMax', () => {
    // Identical cash, different run-rate. The distinction a single cost figure
    // would hide.
    expect(forMode('lumpSum').baseBuildCost).toBeLessThan(
      forMode('allowOverMax').baseBuildCost,
    )
  })
})

describe('fitToBudgetFactor', () => {
  it('returns the multiple that would reach the target', () => {
    // Spending 3.35% against a 3.25% target needs scaling by 0.970.
    expect(fitToBudgetFactor(0.0335, 0.0325)).toBeCloseTo(0.9701, 4)
  })

  it('returns above 1 when under target', () => {
    expect(fitToBudgetFactor(0.03, 0.0325)!).toBeGreaterThan(1)
  })

  it('returns null when the matrix spends nothing', () => {
    // There is no multiple of zero that reaches a non-zero target.
    expect(fitToBudgetFactor(0, 0.0325)).toBeNull()
    expect(fitToBudgetFactor(null, 0.0325)).toBeNull()
  })

  const fitOnce = (settings: ScenarioSettings) => {
    const before = runScenario(
      SAMPLE_POPULATION, SAMPLE_GRADES, DEFAULT_MERIT_MATRIX, settings,
    ).budget
    const factor = fitToBudgetFactor(
      before.budgetSpendPercent,
      settings.targetBudgetPercent,
    )!
    const after = runScenario(
      SAMPLE_POPULATION,
      SAMPLE_GRADES,
      scaleMatrix(DEFAULT_MERIT_MATRIX, factor),
      settings,
    ).budget
    return { before, after, factor }
  }

  it('lands exactly on target when no increase is capped', () => {
    // With nothing withheld at the maximum, cost is perfectly linear in the
    // matrix percentage and one pass is exact to floating-point precision.
    for (const overMaxMode of ['allowOverMax', 'lumpSum'] as const) {
      const { after } = fitOnce({ ...DEFAULT_SETTINGS, overMaxMode })
      expect(after.budgetSpendPercent!).toBeCloseTo(0.0325, 12)
      expect(after.reducedByCap).toBe(0)
    }
  })

  it('lands within a hundredth of a basis point under capAtMax', () => {
    // Not literally exact here: shrinking the matrix moves a couple of employees
    // off their cap, and their increases resume scaling. The residual is around
    // 0.002 basis points, which is tens of dollars on a payroll of millions.
    const { after } = fitOnce({ ...DEFAULT_SETTINGS, overMaxMode: 'capAtMax' })
    expect(after.budgetSpendPercent!).toBeCloseTo(0.0325, 6)
    expect(Math.abs(after.budgetSpendPercent! - 0.0325)).toBeLessThan(0.000001)
  })

  it('lands exactly on a lower target', () => {
    const { after } = fitOnce({ ...DEFAULT_SETTINGS, targetBudgetPercent: 0.01 })
    expect(after.budgetSpendPercent!).toBeCloseTo(0.01, 5)
  })

  it('scales every cell by the same factor, preserving the plan shape', () => {
    const { factor } = fitOnce(DEFAULT_SETTINGS)
    const scaled = scaleMatrix(DEFAULT_MERIT_MATRIX, factor)
    for (const rating of DEFAULT_MERIT_MATRIX.ratings) {
      for (const band of DEFAULT_MERIT_MATRIX.bands) {
        const before = DEFAULT_MERIT_MATRIX.cells[rating][band.id]
        if (before === 0) continue
        expect(scaled.cells[rating][band.id] / before).toBeCloseTo(factor, 10)
      }
    }
  })

  it('falls short of a target the range maximum will not permit', () => {
    // At a 10% target the matrix nearly triples, so a large part of the
    // population hits its range maximum and stops absorbing increase. Under
    // capAtMax the plan physically cannot spend 10%, and re-applying the factor
    // will not change that. The shortfall is a real limit, not a rounding error.
    const { after } = fitOnce({ ...DEFAULT_SETTINGS, targetBudgetPercent: 0.1 })
    expect(after.budgetSpendPercent!).toBeLessThan(0.1)
    expect(after.budgetSpendPercent!).toBeGreaterThan(0.095)
    expect(after.reducedByCap).toBeGreaterThan(0)
  })

  it('reaches the same target when nothing is capped', () => {
    // The identical 10% target under allowOverMax, where no increase is
    // withheld, lands exactly. This is what proves the shortfall above is the
    // cap and not the arithmetic.
    const { after } = fitOnce({
      ...DEFAULT_SETTINGS,
      targetBudgetPercent: 0.1,
      overMaxMode: 'allowOverMax',
    })
    expect(after.budgetSpendPercent!).toBeCloseTo(0.1, 6)
    expect(after.reducedByCap).toBe(0)
  })
})
