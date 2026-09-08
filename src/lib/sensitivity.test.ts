import { describe, it, expect } from 'vitest'
import {
  fitMatrixToTarget,
  budgetSensitivity,
  defaultSensitivityTargets,
} from './sensitivity'
import type { Employee, Grade, MeritMatrix, ScenarioSettings } from '../types/domain'

/**
 * One grade wide enough that nothing hits its maximum, one band covering every
 * compa-ratio, and one rating. Everything the sensitivity table does is about
 * scaling, so the smallest population that can be scaled is the clearest test.
 */
const WIDE_GRADE: Grade = { id: 'G1', name: 'Analyst', order: 1, min: 50_000, mid: 100_000, max: 200_000 }

/** Same grade, but a maximum only 1,000 above where everybody is paid. */
const TIGHT_GRADE: Grade = { id: 'G1', name: 'Analyst', order: 1, min: 50_000, mid: 100_000, max: 101_000 }

const MATRIX: MeritMatrix = {
  ratings: ['Meets'],
  bands: [{ id: 'all', label: 'All', lowerBound: null, upperBound: null }],
  cells: { Meets: { all: 0.03 } },
}

const SETTINGS: ScenarioSettings = {
  targetBudgetPercent: 0.03,
  overMaxMode: 'capAtMax',
  prorationEnabled: false,
  compressionThreshold: 0.02,
}

/** Four people at 100,000, so eligible payroll is 400,000 and the sums are clean. */
const PEOPLE: Employee[] = [1, 2, 3, 4].map((n) => ({
  id: `E${n}`,
  gradeId: 'G1',
  baseSalary: 100_000,
  performanceRating: 'Meets',
  fte: 1,
  eligible: true,
}))

describe('fitMatrixToTarget - when the money can be spent', () => {
  /**
   * 3% of 400,000 is 12,000, which is a 3% spend. To reach 4% the matrix scales
   * by 4/3, giving a cell of 4%: 4% of 400,000 is 16,000, which is 4%.
   */
  it('reaches a higher target exactly', () => {
    const fitted = fitMatrixToTarget(PEOPLE, [WIDE_GRADE], MATRIX, SETTINGS, 0.04)
    expect(fitted.reachable).toBe(true)
    expect(fitted.achievedPercent).toBeCloseTo(0.04, 10)
    expect(fitted.scaleFactor).toBeCloseTo(4 / 3, 10)
    expect(fitted.matrix.cells.Meets.all).toBeCloseTo(0.04, 10)
  })

  it('reaches a lower target exactly', () => {
    const fitted = fitMatrixToTarget(PEOPLE, [WIDE_GRADE], MATRIX, SETTINGS, 0.02)
    expect(fitted.reachable).toBe(true)
    expect(fitted.achievedPercent).toBeCloseTo(0.02, 10)
    expect(fitted.matrix.cells.Meets.all).toBeCloseTo(0.02, 10)
  })

  it('leaves a matrix already on target alone', () => {
    const fitted = fitMatrixToTarget(PEOPLE, [WIDE_GRADE], MATRIX, SETTINGS, 0.03)
    expect(fitted.reachable).toBe(true)
    expect(fitted.scaleFactor).toBe(1)
    expect(fitted.matrix.cells.Meets.all).toBe(0.03)
  })

  it('zeroes the matrix for a target of nothing', () => {
    const fitted = fitMatrixToTarget(PEOPLE, [WIDE_GRADE], MATRIX, SETTINGS, 0)
    expect(fitted.reachable).toBe(true)
    expect(fitted.achievedPercent).toBe(0)
    expect(fitted.matrix.cells.Meets.all).toBe(0)
  })

  it('preserves the shape of the plan, scaling every cell by the same factor', () => {
    const shaped: MeritMatrix = {
      ...MATRIX,
      ratings: ['Exceeds', 'Meets'],
      cells: { Exceeds: { all: 0.05 }, Meets: { all: 0.03 } },
    }
    const population = [
      ...PEOPLE.slice(0, 2).map((e) => ({ ...e, performanceRating: 'Exceeds' })),
      ...PEOPLE.slice(2),
    ]
    // 5% and 3% of 100,000 twice each is 10,000 + 6,000 = 16,000 on 400,000: 4%.
    // Halving the target to 2% must halve both cells, not flatten them.
    const fitted = fitMatrixToTarget(population, [WIDE_GRADE], shaped, SETTINGS, 0.02)
    expect(fitted.achievedPercent).toBeCloseTo(0.02, 10)
    expect(fitted.matrix.cells.Exceeds.all).toBeCloseTo(0.025, 10)
    expect(fitted.matrix.cells.Meets.all).toBeCloseTo(0.015, 10)
  })
})

describe('fitMatrixToTarget - when the population cannot absorb it', () => {
  /**
   * Everybody sits at 100,000 against a maximum of 101,000, so under capping no
   * employee can receive more than 1,000 however large the matrix gets. Spend
   * tops out at 4,000 on 400,000, which is 1%.
   *
   * This is a real limit of the plan design, not an arithmetic failure, and the
   * point of reporting it is that a plan which silently misses its target looks
   * like a tool that does not work.
   */
  it('stops at what the cap allows and says the target was not reached', () => {
    const fitted = fitMatrixToTarget(PEOPLE, [TIGHT_GRADE], MATRIX, SETTINGS, 0.03)
    expect(fitted.reachable).toBe(false)
    expect(fitted.achievedPercent).toBeCloseTo(0.01, 10)
  })

  it('reaches the same target once the cap is lifted', () => {
    // The same population and the same matrix, differing only in the mode. If
    // the shortfall above were arithmetic rather than the cap, this would fail
    // too.
    const fitted = fitMatrixToTarget(
      PEOPLE,
      [TIGHT_GRADE],
      MATRIX,
      { ...SETTINGS, overMaxMode: 'allowOverMax' },
      0.03,
    )
    expect(fitted.reachable).toBe(true)
    expect(fitted.achievedPercent).toBeCloseTo(0.03, 10)
  })

  it('reports a matrix that spends nothing as unreachable rather than dividing by zero', () => {
    const empty: MeritMatrix = { ...MATRIX, cells: { Meets: { all: 0 } } }
    const fitted = fitMatrixToTarget(PEOPLE, [WIDE_GRADE], empty, SETTINGS, 0.03)
    expect(fitted.reachable).toBe(false)
    expect(fitted.achievedPercent).toBe(0)
  })
})

describe('budgetSensitivity', () => {
  const rows = budgetSensitivity(PEOPLE, [WIDE_GRADE], MATRIX, SETTINGS, [0.02, 0.03, 0.04])

  it('returns one row per target, in the order asked for', () => {
    expect(rows.map((r) => r.targetPercent)).toEqual([0.02, 0.03, 0.04])
  })

  it('costs each row against its own scaled matrix', () => {
    // 2% of 400,000 is 8,000; 3% is 12,000; 4% is 16,000.
    expect(rows.map((r) => Math.round(r.totalSpend))).toEqual([8_000, 12_000, 16_000])
  })

  it('reports each row as reached', () => {
    expect(rows.every((r) => r.reachable)).toBe(true)
  })

  it('reports the consequences, not only the cost', () => {
    const top = rows[2]
    expect(top.cappedHeadcount).toBe(0)
    expect(top.belowMinimumAfter).toBe(0)
    expect(top.aboveMaximumAfter).toBe(0)
    // 100,000 to 104,000 against a midpoint of 100,000 moves the median from
    // 1.00 to 1.04, which is four points.
    expect(top.medianShift).toBeCloseTo(0.04, 10)
  })

  it('marks a row the cap will not let it reach', () => {
    const capped = budgetSensitivity(PEOPLE, [TIGHT_GRADE], MATRIX, SETTINGS, [0.03])
    expect(capped[0].reachable).toBe(false)
    expect(capped[0].achievedPercent).toBeCloseTo(0.01, 10)
    expect(capped[0].cappedHeadcount).toBe(4)
    expect(capped[0].reducedByCap).toBeGreaterThan(0)
  })
})

describe('defaultSensitivityTargets', () => {
  it('brackets the current target, reaching further down than up', () => {
    const targets = defaultSensitivityTargets(0.0325)
    expect(targets).toHaveLength(6)
    expect(targets[0]).toBeCloseTo(0.0225, 10)
    expect(targets[targets.length - 1]).toBeCloseTo(0.0375, 10)
  })

  it('returns them in ascending order', () => {
    const targets = defaultSensitivityTargets(0.0325)
    expect([...targets].sort((a, b) => a - b)).toEqual(targets)
  })

  it('drops negative targets rather than stacking rows at zero', () => {
    // At a 0.5% target, three of the six offsets fall below zero. Clamping them
    // would produce three identical 0% rows, which reads as a bug.
    const targets = defaultSensitivityTargets(0.005)
    expect(targets.every((t) => t >= 0)).toBe(true)
    expect(new Set(targets).size).toBe(targets.length)
  })
})
