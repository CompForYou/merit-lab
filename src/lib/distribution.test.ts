import { describe, it, expect } from 'vitest'
import { summarizeDistribution } from './distribution'
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

const settings = (overMaxMode: OverMaxMode): ScenarioSettings => ({
  targetBudgetPercent: 0.0325,
  overMaxMode,
  prorationEnabled: false,
  compressionThreshold: 0.02,
})

// Four employees, hand-costed below. Grade 70,000 / 90,000 / 100,000.
//
//  id  salary  rating   compa-ratio  band        pct   increase  new salary
//  D1  63,000  Meets       0.70      below 0.80  4.0%    2,520      65,520
//  D2  81,000  Meets       0.90      0.90-1.00   3.0%    2,430      83,430
//  D3  90,000  Meets       1.00      1.00-1.10   2.5%    2,250      92,250
//  D4  99,000  Exceeds     1.10      above 1.10  2.0%    1,980     100,980
//
// D1 sits below the 70,000 minimum. D4 would cross the 100,000 maximum.
const POPULATION: Employee[] = [
  { id: 'D1', gradeId: 'G1', baseSalary: 63_000, performanceRating: 'Meets', fte: 1, eligible: true },
  { id: 'D2', gradeId: 'G1', baseSalary: 81_000, performanceRating: 'Meets', fte: 1, eligible: true },
  { id: 'D3', gradeId: 'G1', baseSalary: 90_000, performanceRating: 'Meets', fte: 1, eligible: true },
  { id: 'D4', gradeId: 'G1', baseSalary: 99_000, performanceRating: 'Exceeds', fte: 1, eligible: true },
]

const run = (mode: OverMaxMode, population = POPULATION) =>
  population.map((e) =>
    calculateEmployeeMerit(
      e,
      e.gradeId === 'G1' ? GRADE : undefined,
      MATRIX,
      settings(mode),
    ),
  )

describe('summarizeDistribution - the shift, in allowOverMax mode', () => {
  const s = summarizeDistribution(run('allowOverMax'))

  it('counts the whole placed population', () => {
    expect(s.populationCount).toBe(4)
    expect(s.excludedCount).toBe(0)
  })

  it('reports the mean compa-ratio before the cycle', () => {
    // (0.70 + 0.90 + 1.00 + 1.10) / 4 = 3.70 / 4 = 0.925
    expect(s.meanCompaRatioBefore).toBeCloseTo(0.925, 10)
  })

  it('reports the mean compa-ratio after the cycle', () => {
    // 65,520/90,000 = 0.728
    // 83,430/90,000 = 0.927
    // 92,250/90,000 = 1.025
    // 100,980/90,000 = 1.122
    // (0.728 + 0.927 + 1.025 + 1.122) / 4 = 3.802 / 4 = 0.9505
    expect(s.meanCompaRatioAfter).toBeCloseTo(0.9505, 10)
  })

  it('reports the mean shift', () => {
    // 0.9505 - 0.925 = 0.0255
    expect(s.meanShift).toBeCloseTo(0.0255, 10)
  })

  it('reports the median compa-ratio before the cycle', () => {
    // sorted: 0.70 | 0.90 | 1.00 | 1.10 -> (0.90 + 1.00) / 2 = 0.95
    expect(s.medianCompaRatioBefore).toBeCloseTo(0.95, 10)
  })

  it('reports the median compa-ratio after the cycle', () => {
    // sorted: 0.728 | 0.927 | 1.025 | 1.122 -> (0.927 + 1.025) / 2 = 0.976
    expect(s.medianCompaRatioAfter).toBeCloseTo(0.976, 10)
  })

  it('reports the median shift', () => {
    // 0.976 - 0.95 = 0.026
    expect(s.medianShift).toBeCloseTo(0.026, 10)
  })
})

describe('summarizeDistribution - crossing the maximum', () => {
  it('counts nobody above maximum before the cycle', () => {
    // D4 on 99,000 is inside a 100,000 maximum.
    const s = summarizeDistribution(run('allowOverMax'))
    expect(s.countAboveMaximumBefore).toBe(0)
  })

  it('counts D4 crossing in allowOverMax mode', () => {
    // 99,000 + 1,980 = 100,980, above the 100,000 maximum.
    const s = summarizeDistribution(run('allowOverMax'))
    expect(s.countAboveMaximumAfter).toBe(1)
    expect(s.countCrossedMaximum).toBe(1)
  })

  it('counts nobody crossing in capAtMax mode', () => {
    // The same employee is capped to exactly 100,000, which is not above it.
    const s = summarizeDistribution(run('capAtMax'))
    expect(s.countAboveMaximumAfter).toBe(0)
    expect(s.countCrossedMaximum).toBe(0)
  })

  it('does not count an already red-circled employee as crossing', () => {
    // Starts at 105,000, already above the maximum. They did not cross; they
    // were already there. The crossing count answers "what did my matrix do".
    const alreadyOver: Employee[] = [
      { id: 'R1', gradeId: 'G1', baseSalary: 105_000, performanceRating: 'Exceeds', fte: 1, eligible: true },
    ]
    const s = summarizeDistribution(run('allowOverMax', alreadyOver))
    expect(s.countAboveMaximumBefore).toBe(1)
    expect(s.countAboveMaximumAfter).toBe(1)
    expect(s.countCrossedMaximum).toBe(0)
  })
})

describe('summarizeDistribution - below the minimum', () => {
  const s = summarizeDistribution(run('capAtMax'))

  it('counts D1 below minimum before the cycle', () => {
    // 63,000 against a 70,000 minimum.
    expect(s.countBelowMinimumBefore).toBe(1)
  })

  it('counts D1 still below minimum after the cycle', () => {
    // 63,000 + 2,520 = 65,520, still under 70,000. A 4% merit increase does not
    // fix a green-circled employee; that needs a separate adjustment.
    expect(s.countStillBelowMinimum).toBe(1)
  })

  it('drops the count when the increase clears the minimum', () => {
    // 69,000 at 0.7667 compa-ratio -> below 0.80 -> 4% -> +2,760 -> 71,760.
    const nearlyThere: Employee[] = [
      { id: 'N1', gradeId: 'G1', baseSalary: 69_000, performanceRating: 'Meets', fte: 1, eligible: true },
    ]
    const t = summarizeDistribution(run('capAtMax', nearlyThere))
    expect(t.countBelowMinimumBefore).toBe(1)
    expect(t.countStillBelowMinimum).toBe(0)
  })
})

describe('summarizeDistribution - who is included', () => {
  it('keeps ineligible employees in the distribution', () => {
    // An ineligible employee still occupies a position in the population.
    // Their compa-ratio is unchanged, so they damp the shift rather than vanish.
    const withIneligible = [
      ...POPULATION,
      { id: 'D5', gradeId: 'G1', baseSalary: 90_000, performanceRating: 'Meets', fte: 1, eligible: false },
    ]
    const s = summarizeDistribution(run('allowOverMax', withIneligible))
    expect(s.populationCount).toBe(5)
    // Before: (0.70 + 0.90 + 1.00 + 1.10 + 1.00) / 5 = 4.70 / 5 = 0.94
    expect(s.meanCompaRatioBefore).toBeCloseTo(0.94, 10)
  })

  it('counts uncostable employees separately and leaves them out of the averages', () => {
    const withExcluded = [
      ...POPULATION,
      { id: 'D6', gradeId: 'GX', baseSalary: 85_000, performanceRating: 'Meets', fte: 1, eligible: true },
    ]
    const s = summarizeDistribution(run('allowOverMax', withExcluded))
    expect(s.excludedCount).toBe(1)
    expect(s.populationCount).toBe(4)
    // Unchanged from the four-person case: the excluded employee does not
    // silently drag the mean.
    expect(s.meanCompaRatioBefore).toBeCloseTo(0.925, 10)
  })

  it('returns nulls for an empty population rather than zero', () => {
    const s = summarizeDistribution([])
    expect(s.populationCount).toBe(0)
    expect(s.meanCompaRatioBefore).toBeNull()
    expect(s.medianShift).toBeNull()
  })
})
