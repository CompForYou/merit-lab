import { describe, it, expect } from 'vitest'
import {
  calculateCompressionIndicators,
  MIN_HEADCOUNT_FOR_COMPRESSION_FLAG,
} from './compression'
import { calculateEmployeeMerit } from './merit-increase'
import { DEFAULT_COMPA_RATIO_BANDS } from './compa-ratio-bands'
import type {
  Employee,
  Grade,
  MeritMatrix,
  ScenarioSettings,
} from '../types/domain'

// Two adjacent grades, 25% midpoint progression.
const G1: Grade = { id: 'G1', name: 'Analyst', order: 1, min: 64_000, mid: 80_000, max: 96_000 }
const G2: Grade = { id: 'G2', name: 'Senior Analyst', order: 2, min: 80_000, mid: 100_000, max: 120_000 }
const GRADES = [G1, G2]

// A flat matrix: the rating alone decides the percentage, so the tests control
// exactly how much each grade moves.
const FLAT_MATRIX: MeritMatrix = {
  ratings: ['High', 'Standard', 'Low'],
  bands: DEFAULT_COMPA_RATIO_BANDS,
  cells: {
    High: {
      'band-below-080': 0.08,
      'band-080-090': 0.08,
      'band-090-100': 0.08,
      'band-100-110': 0.08,
      'band-above-110': 0.08,
    },
    Standard: {
      'band-below-080': 0.03,
      'band-080-090': 0.03,
      'band-090-100': 0.03,
      'band-100-110': 0.03,
      'band-above-110': 0.03,
    },
    Low: {
      'band-below-080': 0.01,
      'band-080-090': 0.01,
      'band-090-100': 0.01,
      'band-100-110': 0.01,
      'band-above-110': 0.01,
    },
  },
}

const SETTINGS: ScenarioSettings = {
  targetBudgetPercent: 0.0325,
  overMaxMode: 'allowOverMax',
  prorationEnabled: false,
  compressionThreshold: 0.02,
}

const staff = (
  gradeId: string,
  salary: number,
  rating: string,
  count: number,
  fte = 1,
): Employee[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `${gradeId}-${rating}-${i}`,
    gradeId,
    baseSalary: salary,
    performanceRating: rating,
    fte,
    eligible: true,
  }))

const run = (population: Employee[], grades = GRADES) =>
  calculateCompressionIndicators(
    population.map((e) =>
      calculateEmployeeMerit(
        e,
        grades.find((g) => g.id === e.gradeId),
        FLAT_MATRIX,
        SETTINGS,
      ),
    ),
    grades,
    SETTINGS.compressionThreshold,
  )

describe('calculateCompressionIndicators - the differential', () => {
  // Five on 80,000 in G1, five on 100,000 in G2. Both rated Standard (3%).
  const population = [
    ...staff('G1', 80_000, 'Standard', 5),
    ...staff('G2', 100_000, 'Standard', 5),
  ]
  const [pair] = run(population)

  it('produces one pair for two adjacent grades', () => {
    expect(run(population)).toHaveLength(1)
    expect(pair.lowerGradeName).toBe('Analyst')
    expect(pair.higherGradeName).toBe('Senior Analyst')
  })

  it('measures the differential as a percentage of the lower median', () => {
    // (100,000 - 80,000) / 80,000 = 20,000 / 80,000 = 0.25
    expect(pair.lowerMedianBefore).toBe(80_000)
    expect(pair.higherMedianBefore).toBe(100_000)
    expect(pair.differentialBefore).toBeCloseTo(0.25, 10)
  })

  it('leaves the differential unchanged when both grades get the same percentage', () => {
    // G1: 80,000 x 1.03 = 82,400      G2: 100,000 x 1.03 = 103,000
    // (103,000 - 82,400) / 82,400 = 20,600 / 82,400 = 0.25 exactly.
    // A uniform percentage increase preserves differentials exactly. Compression
    // comes from UNEVEN increases, not from spending money.
    expect(pair.lowerMedianAfter).toBeCloseTo(82_400, 6)
    expect(pair.higherMedianAfter).toBeCloseTo(103_000, 6)
    expect(pair.differentialAfter).toBeCloseTo(0.25, 10)
    expect(pair.differentialChange).toBeCloseTo(0, 10)
  })

  it('does not flag a differential that did not narrow', () => {
    expect(pair.flagged).toBe(false)
  })
})

describe('calculateCompressionIndicators - a narrowing differential', () => {
  // The lower grade gets 8%, the higher grade 1%.
  //   G1: 80,000 x 1.08 =  86,400
  //   G2: 100,000 x 1.01 = 101,000
  //   before: (100,000 - 80,000) / 80,000 = 0.25
  //   after:  (101,000 - 86,400) / 86,400 = 14,600 / 86,400 = 0.168981
  //   change: 0.168981 - 0.25 = -0.081019, i.e. narrowed by 8.10 points
  const population = [
    ...staff('G1', 80_000, 'High', 5),
    ...staff('G2', 100_000, 'Low', 5),
  ]
  const [pair] = run(population)

  it('computes the post-cycle differential', () => {
    expect(pair.lowerMedianAfter).toBeCloseTo(86_400, 6)
    expect(pair.higherMedianAfter).toBeCloseTo(101_000, 6)
    expect(pair.differentialAfter).toBeCloseTo(0.168981, 6)
  })

  it('reports the narrowing as a negative change', () => {
    expect(pair.differentialChange).toBeCloseTo(-0.081019, 6)
  })

  it('flags the pair, because 8.10 points exceeds the 2 point threshold', () => {
    expect(pair.flagged).toBe(true)
  })

  it('does not flag when the threshold is set above the movement', () => {
    const results = population.map((e) =>
      calculateEmployeeMerit(e, GRADES.find((g) => g.id === e.gradeId), FLAT_MATRIX, SETTINGS),
    )
    const loose = calculateCompressionIndicators(results, GRADES, 0.1)
    expect(loose[0].flagged).toBe(false)
  })
})

describe('calculateCompressionIndicators - small grades are not flagged', () => {
  // The same 8.10 point narrowing, but only three people in each grade.
  const population = [
    ...staff('G1', 80_000, 'High', 3),
    ...staff('G2', 100_000, 'Low', 3),
  ]
  const [pair] = run(population)

  it('still reports the differential and the headcounts', () => {
    expect(pair.lowerHeadcount).toBe(3)
    expect(pair.higherHeadcount).toBe(3)
    expect(pair.differentialChange).toBeCloseTo(-0.081019, 6)
  })

  it('marks the pair as below the headcount threshold', () => {
    expect(pair.belowHeadcountThreshold).toBe(true)
  })

  it('does not flag it, because a three-person median is not stable', () => {
    expect(pair.flagged).toBe(false)
  })

  it('flags the same movement once both grades reach the threshold', () => {
    const bigger = [
      ...staff('G1', 80_000, 'High', MIN_HEADCOUNT_FOR_COMPRESSION_FLAG),
      ...staff('G2', 100_000, 'Low', MIN_HEADCOUNT_FOR_COMPRESSION_FLAG),
    ]
    expect(run(bigger)[0].flagged).toBe(true)
  })

  it('is below threshold when only one side is small', () => {
    const lopsided = [
      ...staff('G1', 80_000, 'High', 10),
      ...staff('G2', 100_000, 'Low', 2),
    ]
    const [p] = run(lopsided)
    expect(p.belowHeadcountThreshold).toBe(true)
    expect(p.flagged).toBe(false)
  })
})

describe('calculateCompressionIndicators - part-time employees', () => {
  it('takes medians on full-time equivalent salary', () => {
    // Four full-timers on 80,000 plus one 0.5 FTE paid 40,000 actual.
    // Grossed up, that fifth employee is also at 80,000, so the median holds.
    // Using actual pay would drag the G1 median down and invent compression.
    const population = [
      ...staff('G1', 80_000, 'Standard', 4),
      ...staff('G1', 40_000, 'Standard', 1, 0.5),
      ...staff('G2', 100_000, 'Standard', 5),
    ]
    const [pair] = run(population)
    expect(pair.lowerMedianBefore).toBe(80_000)
    expect(pair.differentialBefore).toBeCloseTo(0.25, 10)
  })
})

describe('calculateCompressionIndicators - structure walking', () => {
  const G3: Grade = { id: 'G3', name: 'Manager', order: 3, min: 100_000, mid: 125_000, max: 150_000 }

  it('produces one pair fewer than the number of grades', () => {
    const population = [
      ...staff('G1', 80_000, 'Standard', 5),
      ...staff('G2', 100_000, 'Standard', 5),
      ...staff('G3', 125_000, 'Standard', 5),
    ]
    const pairs = run(population, [G1, G2, G3])
    expect(pairs).toHaveLength(2)
    expect(pairs.map((p) => p.lowerGradeName)).toEqual(['Analyst', 'Senior Analyst'])
  })

  it('pairs adjacent grades only, never every combination', () => {
    const population = [
      ...staff('G1', 80_000, 'Standard', 5),
      ...staff('G2', 100_000, 'Standard', 5),
      ...staff('G3', 125_000, 'Standard', 5),
    ]
    const pairs = run(population, [G1, G2, G3])
    // Analyst to Manager is not a pair. Three grades would give three
    // combinations; compression is about the step between neighbours.
    expect(pairs.some((p) => p.lowerGradeId === 'G1' && p.higherGradeId === 'G3')).toBe(false)
  })

  it('uses declared order, not the array sequence', () => {
    const population = [
      ...staff('G1', 80_000, 'Standard', 5),
      ...staff('G2', 100_000, 'Standard', 5),
    ]
    const pairs = run(population, [G2, G1])
    expect(pairs[0].lowerGradeName).toBe('Analyst')
    expect(pairs[0].higherGradeName).toBe('Senior Analyst')
  })

  it('returns no pairs for a single-grade structure', () => {
    expect(run(staff('G1', 80_000, 'Standard', 5), [G1])).toEqual([])
  })
})

describe('calculateCompressionIndicators - empty grades', () => {
  it('returns nulls rather than a differential when a grade has nobody in it', () => {
    const population = staff('G1', 80_000, 'Standard', 5)
    const [pair] = run(population)
    expect(pair.lowerHeadcount).toBe(5)
    expect(pair.higherHeadcount).toBe(0)
    expect(pair.higherMedianBefore).toBeNull()
    expect(pair.differentialBefore).toBeNull()
    expect(pair.differentialChange).toBeNull()
    expect(pair.flagged).toBe(false)
  })
})
