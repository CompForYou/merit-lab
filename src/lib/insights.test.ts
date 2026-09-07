import { describe, it, expect } from 'vitest'
import {
  increaseDistribution,
  topCostDrivers,
  bandMovement,
  costPerCompaRatioPoint,
  structureRows,
} from './insights'
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
  ratings: ['Exceeds', 'Meets', 'Below'],
  bands: DEFAULT_COMPA_RATIO_BANDS,
  cells: {
    Exceeds: {
      'band-below-080': 0.06, 'band-080-090': 0.05, 'band-090-100': 0.045,
      'band-100-110': 0.04, 'band-above-110': 0.02,
    },
    Meets: {
      'band-below-080': 0.04, 'band-080-090': 0.035, 'band-090-100': 0.03,
      'band-100-110': 0.025, 'band-above-110': 0.01,
    },
    Below: {
      'band-below-080': 0, 'band-080-090': 0, 'band-090-100': 0,
      'band-100-110': 0, 'band-above-110': 0,
    },
  },
}

const SETTINGS: ScenarioSettings = {
  targetBudgetPercent: 0.0325,
  overMaxMode: 'capAtMax',
  prorationEnabled: false,
  compressionThreshold: 0.02,
}

const emp = (o: Partial<Employee> & { id: string }): Employee => ({
  gradeId: 'G1',
  baseSalary: 81_000,
  performanceRating: 'Meets',
  fte: 1,
  eligible: true,
  ...o,
})

const sample = runScenario(
  SAMPLE_POPULATION, SAMPLE_GRADES, DEFAULT_MERIT_MATRIX, DEFAULT_SETTINGS,
)

describe('increaseDistribution', () => {
  it('separates the people who receive nothing', () => {
    // A zero is not a small increase; it is a different conversation.
    const results = runScenario(
      [emp({ id: 'A' }), emp({ id: 'B', performanceRating: 'Below' })],
      [GRADE], MATRIX, SETTINGS,
    ).results
    const buckets = increaseDistribution(results)
    expect(buckets[0].label).toBe('Nothing')
    expect(buckets[0].count).toBe(1)
  })

  it('buckets by the floor, so 3% opens the 3 to 4 band', () => {
    // 81,000 at 0.90 compa-ratio -> Meets 3% exactly.
    const results = runScenario([emp({ id: 'A' })], [GRADE], MATRIX, SETTINGS).results
    const buckets = increaseDistribution(results)
    expect(buckets[0].label).toBe('3 to 4%')
  })

  it('accounts for every costed employee exactly once', () => {
    const buckets = increaseDistribution(sample.results)
    const counted = buckets.reduce((n, b) => n + b.count, 0)
    expect(counted).toBe(sample.budget.eligibleHeadcount)
  })

  it('reconciles its cost to the budget total', () => {
    const buckets = increaseDistribution(sample.results)
    const cost = buckets.reduce((t, b) => t + b.cost, 0)
    expect(cost).toBeCloseTo(sample.budget.totalSpend, 6)
  })

  it('shows the shape a single spend figure hides', () => {
    // The sample spends 3.35%, but that average is spread across several
    // buckets rather than concentrated on one.
    const buckets = increaseDistribution(sample.results)
    expect(buckets.length).toBeGreaterThan(3)
  })

  it('omits the nothing bucket when everyone receives something', () => {
    const results = runScenario([emp({ id: 'A' })], [GRADE], MATRIX, SETTINGS).results
    expect(increaseDistribution(results)[0].label).not.toBe('Nothing')
  })
})

describe('topCostDrivers', () => {
  const drivers = topCostDrivers(sample.matrixCells)

  it('ranks by cost, largest first', () => {
    const costs = drivers.map((d) => d.cost)
    expect([...costs].sort((a, b) => b - a)).toEqual(costs)
  })

  it('reports each cell as a share of total spend', () => {
    for (const d of drivers) {
      expect(d.shareOfTotal).toBeGreaterThan(0)
      expect(d.shareOfTotal).toBeLessThanOrEqual(1)
    }
  })

  it('shows that the most expensive cell is not the most generous one', () => {
    // The reversal the whole tool exists to make visible.
    const all = [...sample.matrixCells.cells].filter((c) => c.headcount > 0)
    const mostExpensive = [...all].sort((a, b) => b.cost - a.cost)[0]
    const mostGenerous = [...all].sort((a, b) => b.increasePercent - a.increasePercent)[0]
    expect(mostExpensive.increasePercent).toBeLessThan(mostGenerous.increasePercent)
  })

  it('returns nothing when no cell has cost anything', () => {
    const idle = runScenario(
      [emp({ id: 'A', performanceRating: 'Below' })], [GRADE], MATRIX, SETTINGS,
    )
    expect(topCostDrivers(idle.matrixCells)).toEqual([])
  })
})

describe('bandMovement', () => {
  it('counts an employee lifted into the next band', () => {
    // 89,000 is compa-ratio 0.989 -> 0.90-1.00. Meets pays 3%, taking them to
    // 91,670, which is 1.019 and therefore the 1.00-1.10 band.
    const results = runScenario(
      [emp({ id: 'A', baseSalary: 89_000 })], [GRADE], MATRIX, SETTINGS,
    ).results
    const moved = bandMovement(results, DEFAULT_COMPA_RATIO_BANDS)
    expect(moved.movedUp).toBe(1)
    expect(moved.stayed).toBe(0)
  })

  it('counts an employee who stays put', () => {
    const results = runScenario([emp({ id: 'A' })], [GRADE], MATRIX, SETTINGS).results
    const moved = bandMovement(results, DEFAULT_COMPA_RATIO_BANDS)
    expect(moved.stayed).toBe(1)
    expect(moved.movedUp).toBe(0)
  })

  it('never reports anyone moving down, because pay is never cut', () => {
    const moved = bandMovement(sample.results, DEFAULT_COMPA_RATIO_BANDS)
    expect(moved.movedDown).toBe(0)
  })

  it('accounts for every placed employee', () => {
    const moved = bandMovement(sample.results, DEFAULT_COMPA_RATIO_BANDS)
    expect(moved.movedUp + moved.stayed + moved.movedDown).toBe(204)
  })
})

describe('costPerCompaRatioPoint', () => {
  it('prices a point of median movement', () => {
    const cost = costPerCompaRatioPoint(sample.budget, sample.distribution)!
    expect(cost).toBeGreaterThan(0)
    // Spend divided by the median shift expressed in points.
    const expected =
      sample.budget.totalSpend / (sample.distribution.medianShift! * 100)
    expect(cost).toBeCloseTo(expected, 6)
  })

  it('returns null when the plan does not move the median', () => {
    expect(
      costPerCompaRatioPoint(sample.budget, {
        ...sample.distribution,
        medianShift: 0,
      }),
    ).toBeNull()
  })

  it('returns null when nothing was spent', () => {
    expect(
      costPerCompaRatioPoint({ ...sample.budget, totalSpend: 0 }, sample.distribution),
    ).toBeNull()
  })
})

describe('structureRows', () => {
  const rows = structureRows(SAMPLE_GRADES, sample.results)

  it('returns one row per grade in order', () => {
    expect(rows).toHaveLength(8)
    expect(rows.map((r) => r.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('reports spread widening with grade, as the sample structure does', () => {
    expect(rows[0].spread).toBeCloseTo(0.353, 3)
    expect(rows[7].spread).toBeCloseTo(0.648, 3)
  })

  it('leaves progression null for the lowest grade and reports it above', () => {
    expect(rows[0].progressionFromBelow).toBeNull()
    expect(rows[1].progressionFromBelow).toBeCloseTo(0.117, 3)
  })

  it('reports median range penetration, which compa-ratio cannot tell you', () => {
    // Position across the whole span, as opposed to distance from one point.
    for (const row of rows) {
      expect(row.medianPenetrationAfter).not.toBeNull()
      expect(row.medianPenetrationAfter!).toBeGreaterThan(-1)
      expect(row.medianPenetrationAfter!).toBeLessThan(2)
    }
  })

  it('reports how far each grade overlaps the one beneath it', () => {
    // Overlapping grades are normal; the size of the overlap is the thing to
    // watch, because a large one means a promotion may not move anyone's pay.
    expect(rows[0].overlapWithBelow).toBeNull()
    for (const row of rows.slice(1)) {
      expect(row.overlapWithBelow).not.toBeNull()
      expect(row.overlapWithBelow!).toBeGreaterThan(0)
    }
  })

  it('counts each grade population', () => {
    expect(rows.reduce((n, r) => n + r.headcount, 0)).toBe(204)
  })
})
