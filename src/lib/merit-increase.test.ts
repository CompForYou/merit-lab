import { describe, it, expect } from 'vitest'
import { calculateEmployeeMerit } from './merit-increase'
import { DEFAULT_COMPA_RATIO_BANDS } from './compa-ratio-bands'
import type {
  Employee,
  Grade,
  MeritMatrix,
  OverMaxMode,
  ScenarioSettings,
} from '../types/domain'

// Grade used throughout: 70,000 / 90,000 / 100,000.
const GRADE: Grade = {
  id: 'G1',
  name: 'Analyst',
  order: 1,
  min: 70_000,
  mid: 90_000,
  max: 100_000,
}

const MATRIX: MeritMatrix = {
  ratings: ['Exceeds', 'Meets', 'Below'],
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
    Below: {
      'band-below-080': 0,
      'band-080-090': 0,
      'band-090-100': 0,
      'band-100-110': 0,
      'band-above-110': 0,
    },
  },
}

const settings = (
  overMaxMode: OverMaxMode = 'capAtMax',
  overrides: Partial<ScenarioSettings> = {},
): ScenarioSettings => ({
  targetBudgetPercent: 0.0325,
  overMaxMode,
  prorationEnabled: false,
  compressionThreshold: 0.02,
  ...overrides,
})

const employee = (overrides: Partial<Employee> = {}): Employee => ({
  id: 'E1',
  gradeId: 'G1',
  baseSalary: 81_000,
  performanceRating: 'Meets',
  fte: 1,
  eligible: true,
  ...overrides,
})

describe('calculateEmployeeMerit - an ordinary increase', () => {
  // Base 81,000. Compa-ratio 81,000 / 90,000 = 0.90 exactly, which lands in the
  // 0.90-1.00 band (lower bound inclusive). Meets x 0.90-1.00 = 3%.
  //   uncapped  = 81,000 x 0.03 = 2,430
  //   headroom  = 100,000 - 81,000 = 19,000, so no cap applies
  //   newSalary = 81,000 + 2,430 = 83,430
  const result = calculateEmployeeMerit(employee(), GRADE, MATRIX, settings())

  it('places the employee at compa-ratio 0.90', () => {
    expect(result.compaRatio).toBe(0.9)
  })

  it('assigns the 0.90-1.00 band, not 0.80-0.90', () => {
    expect(result.bandId).toBe('band-090-100')
  })

  it('reads 3 percent from the matrix', () => {
    expect(result.matrixPercent).toBe(0.03)
  })

  it('calculates an increase of 2,430', () => {
    expect(result.increaseAmount).toBeCloseTo(2_430, 6)
  })

  it('produces a new salary of 83,430', () => {
    expect(result.newSalary).toBeCloseTo(83_430, 6)
  })

  it('recomputes compa-ratio on the new salary', () => {
    // 83,430 / 90,000 = 0.927
    expect(result.newCompaRatio).toBeCloseTo(0.927, 10)
  })

  it('withholds nothing and pays no lump sum', () => {
    expect(result.reducedByCap).toBe(0)
    expect(result.lumpSumAmount).toBe(0)
    expect(result.excluded).toBe(false)
  })
})

describe('calculateEmployeeMerit - an increase that would cross the maximum', () => {
  // Base 98,000. Compa-ratio 98,000 / 90,000 = 1.0889 -> 1.00-1.10 band.
  // Exceeds x 1.00-1.10 = 4%.
  //   uncapped = 98,000 x 0.04 = 3,920
  //   headroom = 100,000 - 98,000 = 2,000
  const crosser = employee({ baseSalary: 98_000, performanceRating: 'Exceeds' })

  it('capAtMax: pays 2,000, withholds 1,920, lands exactly on the maximum', () => {
    const r = calculateEmployeeMerit(crosser, GRADE, MATRIX, settings('capAtMax'))
    expect(r.uncappedIncreaseAmount).toBeCloseTo(3_920, 6)
    expect(r.increaseAmount).toBe(2_000)
    expect(r.lumpSumAmount).toBe(0)
    expect(r.reducedByCap).toBeCloseTo(1_920, 6)
    expect(r.newSalary).toBe(100_000)
    expect(r.isOverMaximumAfter).toBe(false)
    expect(r.crossedMaximum).toBe(false)
  })

  it('allowOverMax: pays 3,920 in full and the employee becomes red-circled', () => {
    const r = calculateEmployeeMerit(crosser, GRADE, MATRIX, settings('allowOverMax'))
    expect(r.increaseAmount).toBeCloseTo(3_920, 6)
    expect(r.lumpSumAmount).toBe(0)
    expect(r.reducedByCap).toBe(0)
    expect(r.newSalary).toBeCloseTo(101_920, 6)
    expect(r.isOverMaximumAfter).toBe(true)
    expect(r.crossedMaximum).toBe(true)
  })

  it('lumpSum: 2,000 to base and 1,920 paid once', () => {
    const r = calculateEmployeeMerit(crosser, GRADE, MATRIX, settings('lumpSum'))
    expect(r.increaseAmount).toBe(2_000)
    expect(r.lumpSumAmount).toBeCloseTo(1_920, 6)
    expect(r.reducedByCap).toBe(0)
    expect(r.newSalary).toBe(100_000)
    expect(r.isOverMaximumAfter).toBe(false)
  })

  it('separates cash spend from base build across the three modes', () => {
    const cap = calculateEmployeeMerit(crosser, GRADE, MATRIX, settings('capAtMax'))
    const over = calculateEmployeeMerit(crosser, GRADE, MATRIX, settings('allowOverMax'))
    const lump = calculateEmployeeMerit(crosser, GRADE, MATRIX, settings('lumpSum'))

    // Cash out the door this year.
    expect(cap.increaseAmount + cap.lumpSumAmount).toBe(2_000)
    expect(over.increaseAmount + over.lumpSumAmount).toBeCloseTo(3_920, 6)
    expect(lump.increaseAmount + lump.lumpSumAmount).toBeCloseTo(3_920, 6)

    // Money built into base, which carries into next year's payroll.
    // allowOverMax and lumpSum cost the same cash but build different bases.
    expect(over.increaseAmount).toBeCloseTo(3_920, 6)
    expect(lump.increaseAmount).toBe(2_000)
  })
})

describe('calculateEmployeeMerit - an employee already above the maximum', () => {
  // Base 105,000 against a 100,000 maximum. Compa-ratio 105,000 / 90,000 = 1.1667
  // -> Above 1.10 band. Exceeds x Above 1.10 = 2%.
  //   uncapped = 105,000 x 0.02 = 2,100
  //   headroom = max(100,000 - 105,000, 0) = 0
  const redCircled = employee({ baseSalary: 105_000, performanceRating: 'Exceeds' })

  it('is recognised as over maximum before the cycle', () => {
    const r = calculateEmployeeMerit(redCircled, GRADE, MATRIX, settings('capAtMax'))
    expect(r.wasOverMaximumBefore).toBe(true)
    expect(r.crossedMaximum).toBe(false)
  })

  it('capAtMax: pays nothing and never cuts pay', () => {
    const r = calculateEmployeeMerit(redCircled, GRADE, MATRIX, settings('capAtMax'))
    expect(r.increaseAmount).toBe(0)
    expect(r.newSalary).toBe(105_000)
    expect(r.reducedByCap).toBeCloseTo(2_100, 6)
  })

  it('allowOverMax: pays the full 2,100', () => {
    const r = calculateEmployeeMerit(redCircled, GRADE, MATRIX, settings('allowOverMax'))
    expect(r.increaseAmount).toBeCloseTo(2_100, 6)
    expect(r.newSalary).toBeCloseTo(107_100, 6)
  })

  it('lumpSum: the entire 2,100 is a lump sum, base is untouched', () => {
    const r = calculateEmployeeMerit(redCircled, GRADE, MATRIX, settings('lumpSum'))
    expect(r.increaseAmount).toBe(0)
    expect(r.lumpSumAmount).toBeCloseTo(2_100, 6)
    expect(r.newSalary).toBe(105_000)
  })
})

describe('calculateEmployeeMerit - part-time employees', () => {
  // 0.5 FTE paid 49,000 actual.
  //   full-time equivalent = 49,000 / 0.5 = 98,000
  //   compa-ratio          = 98,000 / 90,000 = 1.0889 -> 1.00-1.10 band -> 4%
  //   uncapped increase    = 49,000 x 0.04 = 1,960   (on ACTUAL pay)
  //   effective maximum    = 100,000 x 0.5 = 50,000
  //   headroom             = 50,000 - 49,000 = 1,000
  const partTime = employee({
    baseSalary: 49_000,
    fte: 0.5,
    performanceRating: 'Exceeds',
  })

  it('places on full-time equivalent but costs on actual pay', () => {
    const r = calculateEmployeeMerit(partTime, GRADE, MATRIX, settings('capAtMax'))
    expect(r.compaRatio).toBeCloseTo(98_000 / 90_000, 10)
    expect(r.bandId).toBe('band-100-110')
    expect(r.uncappedIncreaseAmount).toBeCloseTo(1_960, 6)
  })

  it('scales the range maximum to the employee FTE', () => {
    const r = calculateEmployeeMerit(partTime, GRADE, MATRIX, settings('capAtMax'))
    expect(r.increaseAmount).toBe(1_000)
    expect(r.newSalary).toBe(50_000)
    expect(r.reducedByCap).toBeCloseTo(960, 6)
  })

  it('produces the same compa-ratio as the full-time equivalent employee', () => {
    const full = employee({ baseSalary: 98_000, performanceRating: 'Exceeds' })
    const a = calculateEmployeeMerit(partTime, GRADE, MATRIX, settings('capAtMax'))
    const b = calculateEmployeeMerit(full, GRADE, MATRIX, settings('capAtMax'))
    expect(a.compaRatio).toBeCloseTo(b.compaRatio!, 10)
    expect(a.bandId).toBe(b.bandId)
  })
})

describe('calculateEmployeeMerit - proration', () => {
  const midYearHire = employee({ hireDate: '2024-07-01' })

  it('is off by default and pays the full increase', () => {
    const r = calculateEmployeeMerit(midYearHire, GRADE, MATRIX, settings())
    expect(r.prorationFactor).toBe(1)
    expect(r.increaseAmount).toBeCloseTo(2_430, 6)
  })

  it('halves the increase for a six-month hire when switched on', () => {
    // 6 completed months / 12 = 0.5
    // 81,000 x 0.03 x 0.5 = 1,215
    const r = calculateEmployeeMerit(
      midYearHire,
      GRADE,
      MATRIX,
      settings('capAtMax', {
        prorationEnabled: true,
        meritEffectiveDate: '2025-01-01',
      }),
    )
    expect(r.prorationFactor).toBe(0.5)
    expect(r.increaseAmount).toBeCloseTo(1_215, 6)
    expect(r.newSalary).toBeCloseTo(82_215, 6)
  })

  it('pays a full increase to someone employed the whole period', () => {
    const r = calculateEmployeeMerit(
      employee({ hireDate: '2020-03-01' }),
      GRADE,
      MATRIX,
      settings('capAtMax', {
        prorationEnabled: true,
        meritEffectiveDate: '2025-01-01',
      }),
    )
    expect(r.prorationFactor).toBe(1)
    expect(r.increaseAmount).toBeCloseTo(2_430, 6)
  })
})

describe('calculateEmployeeMerit - eligibility', () => {
  it('pays nothing to an ineligible employee but keeps their compa-ratio', () => {
    const r = calculateEmployeeMerit(
      employee({ eligible: false }),
      GRADE,
      MATRIX,
      settings(),
    )
    expect(r.increaseAmount).toBe(0)
    expect(r.lumpSumAmount).toBe(0)
    expect(r.newSalary).toBe(81_000)
    // Still placed, so they appear in the distribution chart.
    expect(r.compaRatio).toBe(0.9)
    expect(r.newCompaRatio).toBe(0.9)
    // Not eligible is not the same as not calculable.
    expect(r.excluded).toBe(false)
  })

  it('pays nothing for a zero-percent matrix cell without excluding the employee', () => {
    const r = calculateEmployeeMerit(
      employee({ performanceRating: 'Below' }),
      GRADE,
      MATRIX,
      settings(),
    )
    expect(r.matrixPercent).toBe(0)
    expect(r.increaseAmount).toBe(0)
    expect(r.excluded).toBe(false)
  })
})

describe('calculateEmployeeMerit - green-circled employees', () => {
  it('reports an employee still below minimum after the increase', () => {
    // Base 60,000. Compa-ratio 60,000 / 90,000 = 0.6667 -> Below 0.80 -> 4%
    //   increase  = 60,000 x 0.04 = 2,400
    //   newSalary = 62,400, still under the 70,000 minimum
    const r = calculateEmployeeMerit(
      employee({ baseSalary: 60_000 }),
      GRADE,
      MATRIX,
      settings(),
    )
    expect(r.bandId).toBe('band-below-080')
    expect(r.increaseAmount).toBeCloseTo(2_400, 6)
    expect(r.newSalary).toBeCloseTo(62_400, 6)
    expect(r.isBelowMinimumAfter).toBe(true)
  })
})

describe('calculateEmployeeMerit - employees that cannot be costed', () => {
  it('excludes an employee whose grade is missing', () => {
    const r = calculateEmployeeMerit(employee(), undefined, MATRIX, settings())
    expect(r.excluded).toBe(true)
    expect(r.exclusionReason).toBe('grade-not-found')
    expect(r.increaseAmount).toBe(0)
  })

  it('excludes an employee whose grade has no midpoint', () => {
    const noMid: Grade = { ...GRADE, mid: 0 }
    const r = calculateEmployeeMerit(employee(), noMid, MATRIX, settings())
    expect(r.excluded).toBe(true)
    expect(r.exclusionReason).toBe('compa-ratio-undefined')
    expect(r.compaRatio).toBeNull()
    expect(r.increaseAmount).toBe(0)
  })

  it('excludes an employee whose rating has no row in the matrix', () => {
    const r = calculateEmployeeMerit(
      employee({ performanceRating: 'Outstanding' }),
      GRADE,
      MATRIX,
      settings(),
    )
    expect(r.excluded).toBe(true)
    expect(r.exclusionReason).toBe('no-matrix-cell')
    expect(r.increaseAmount).toBe(0)
  })

  it('excludes an employee no band covers', () => {
    const gapped: MeritMatrix = {
      ...MATRIX,
      bands: [
        { id: 'lo', label: 'low', lowerBound: null, upperBound: 0.5 },
        { id: 'hi', label: 'high', lowerBound: 1.5, upperBound: null },
      ],
    }
    const r = calculateEmployeeMerit(employee(), GRADE, gapped, settings())
    expect(r.excluded).toBe(true)
    expect(r.exclusionReason).toBe('no-band-matches')
  })
})

describe('calculateEmployeeMerit - no rounding', () => {
  it('keeps sub-cent precision through the calculation', () => {
    // 81,111 x 0.03 = 2,433.33
    const r = calculateEmployeeMerit(
      employee({ baseSalary: 81_111 }),
      GRADE,
      MATRIX,
      settings(),
    )
    expect(r.increaseAmount).toBeCloseTo(2_433.33, 8)
    expect(r.newSalary).toBeCloseTo(83_544.33, 8)
  })
})
