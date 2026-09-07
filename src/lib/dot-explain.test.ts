import { describe, it, expect } from 'vitest'
import { explainDot } from './dot-explain'
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

const settings = (overMaxMode: OverMaxMode = 'capAtMax'): ScenarioSettings => ({
  targetBudgetPercent: 0.0325,
  overMaxMode,
  prorationEnabled: false,
  compressionThreshold: 0.02,
})

const employee = (o: Partial<Employee> = {}): Employee => ({
  id: 'E1',
  gradeId: 'G1',
  baseSalary: 81_000,
  performanceRating: 'Meets',
  fte: 1,
  eligible: true,
  ...o,
})

const explainFor = (
  o: Partial<Employee> = {},
  mode: OverMaxMode = 'capAtMax',
  /** null means the grade is genuinely absent, which undefined cannot express
   *  here: it would select the default parameter instead. */
  grade: Grade | null = GRADE,
) => {
  const resolved = grade ?? undefined
  return explainDot(
    calculateEmployeeMerit(employee(o), resolved, MATRIX, settings(mode)),
    resolved,
    MATRIX,
  )
}

describe('explainDot - an employee inside their range', () => {
  const e = explainFor()

  it('reports the status as in range', () => {
    expect(e.status).toBe('in-range')
  })

  it('names the range in the sentence', () => {
    expect(e.reason).toBe('Inside the Analyst range, $70,000 to $100,000.')
  })

  it('carries the figures needed to check the working', () => {
    expect(e.matrixPercent).toBe(0.03)
    expect(e.increaseAmount).toBeCloseTo(2_430, 6)
    expect(e.newSalary).toBeCloseTo(83_430, 6)
    expect(e.compaRatioBefore).toBeCloseTo(0.9, 10)
    expect(e.bandLabel).toBe('0.90 - 1.00')
  })
})

describe('explainDot - above the maximum', () => {
  it('says by how much, and that this cycle caused it', () => {
    // 99,000 at 1.10 compa-ratio -> above 1.10 band -> Exceeds 2% -> +1,980
    // 100,980 exceeds the 100,000 maximum by 980.
    const e = explainFor(
      { baseSalary: 99_000, performanceRating: 'Exceeds' },
      'allowOverMax',
    )
    expect(e.status).toBe('above-maximum')
    expect(e.reason).toContain('Above maximum — $100,980 exceeds the Analyst maximum')
    expect(e.reason).toContain('$100,000 by $980')
    expect(e.reason).toContain('This cycle carried them over it.')
  })

  it('distinguishes someone who was already over before the cycle', () => {
    // A red-circled employee did not cross anything; they were already there.
    const e = explainFor(
      { baseSalary: 105_000, performanceRating: 'Exceeds' },
      'allowOverMax',
    )
    expect(e.reason).toContain('They were already above it before this cycle.')
    expect(e.reason).not.toContain('carried them over')
  })
})

describe('explainDot - below the minimum', () => {
  const e = explainFor({ baseSalary: 60_000 })

  it('says by how much', () => {
    // 60,000 -> below 0.80 band -> Meets 4% -> +2,400 -> 62,400
    // 70,000 - 62,400 = 7,600 under.
    expect(e.status).toBe('below-minimum')
    expect(e.reason).toContain('Below minimum — $62,400 is $7,600 under')
    expect(e.reason).toContain('Analyst minimum of $70,000')
  })

  it('says a merit increase will not fix it', () => {
    expect(e.reason).toContain('does not clear green-circling')
  })
})

describe('explainDot - ineligible', () => {
  const e = explainFor({ eligible: false })

  it('explains why the dot has not moved', () => {
    expect(e.status).toBe('ineligible')
    expect(e.reason).toContain('Not eligible for an increase, so this dot has not moved')
    expect(e.reason).toContain('0.90')
    expect(e.reason).toContain('excluded from eligible payroll')
  })
})

describe('explainDot - could not be costed', () => {
  it('names the missing grade', () => {
    const e = explainFor({ gradeId: 'GX' }, 'capAtMax', null)
    expect(e.status).toBe('not-costed')
    expect(e.reason).toContain('grade "GX" is not in the loaded structure')
  })

  it('names an unknown rating', () => {
    const e = explainFor({ performanceRating: 'Outstanding' })
    expect(e.status).toBe('not-costed')
    expect(e.reason).toContain('"Outstanding" has no row in this matrix')
  })

  it('names a grade with no usable midpoint', () => {
    const e = explainFor({}, 'capAtMax', { ...GRADE, mid: 0 })
    expect(e.reason).toContain('no usable midpoint')
  })
})

describe('explainDot - part-time employees', () => {
  // 0.5 FTE paid 49,500. Full-time equivalent 99,000, compa-ratio 1.10,
  // Exceeds x above-1.10 = 2%. Increase 990 on actual pay -> 50,490 actual,
  // which is 100,980 full-time and over the 100,000 maximum.
  const e = explainFor(
    { baseSalary: 49_500, fte: 0.5, performanceRating: 'Exceeds' },
    'allowOverMax',
  )

  it('compares full-time equivalent pay against the range', () => {
    // Comparing their ACTUAL 50,490 against a full-time 100,000 maximum would
    // report them as comfortably inside a range they have in fact left.
    expect(e.status).toBe('above-maximum')
    expect(e.reason).toContain('$100,980 full-time equivalent exceeds')
  })

  it('states the actual pay too, so the figures can be reconciled', () => {
    expect(e.isPartTime).toBe(true)
    expect(e.reason).toContain('Actual pay $50,490 at 0.5 FTE.')
  })

  it('does not add the full-time note for a full-time employee', () => {
    expect(explainFor().reason).not.toContain('full-time equivalent')
    expect(explainFor().reason).not.toContain('Actual pay')
  })
})

describe('explainDot - always answers the question the colour raises', () => {
  it('gives a non-empty reason for every status', () => {
    const cases = [
      explainFor(),
      explainFor({ baseSalary: 60_000 }),
      explainFor({ baseSalary: 105_000, performanceRating: 'Exceeds' }, 'allowOverMax'),
      explainFor({ eligible: false }),
      explainFor({ gradeId: 'GX' }, 'capAtMax', null),
    ]
    const seen = new Set(cases.map((c) => c.status))
    expect(seen.size).toBe(5)
    for (const c of cases) {
      expect(c.reason.length).toBeGreaterThan(20)
      expect(c.reason.trim().endsWith('.')).toBe(true)
    }
  })
})
