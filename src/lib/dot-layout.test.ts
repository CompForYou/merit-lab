import { describe, it, expect } from 'vitest'
import { layoutDots, layoutDotsByGrade } from './dot-layout'
import { runScenario } from './run-scenario'
import { SAMPLE_POPULATION } from '../data/sample-population'
import { SAMPLE_GRADES } from '../data/sample-structure'
import { DEFAULT_MERIT_MATRIX, DEFAULT_SETTINGS } from '../data/default-matrix'
import type { EmployeeMeritResult } from './merit-increase'
import type { Grade } from '../types/domain'

const result = (o: Partial<EmployeeMeritResult> & { employeeId: string }): EmployeeMeritResult => ({
  gradeId: 'G1',
  fte: 1,
  performanceRating: 'Meets',
  eligible: true,
  excluded: false,
  exclusionReason: null,
  compaRatio: 0.95,
  bandId: 'band-090-100',
  matrixPercent: 0.03,
  prorationFactor: 1,
  baseSalary: 95_000,
  uncappedIncreaseAmount: 0,
  increaseAmount: 0,
  lumpSumAmount: 0,
  reducedByCap: 0,
  newSalary: 95_000,
  newCompaRatio: 0.95,
  wasOverMaximumBefore: false,
  isOverMaximumAfter: false,
  crossedMaximum: false,
  wasBelowMinimumBefore: false,
  isBelowMinimumAfter: false,
  ...o,
})

describe('layoutDots - one dot per employee', () => {
  it('produces a dot for every placeable employee', () => {
    const layout = layoutDots([
      result({ employeeId: 'A' }),
      result({ employeeId: 'B' }),
      result({ employeeId: 'C' }),
    ])
    expect(layout.dots).toHaveLength(3)
    expect(layout.omitted).toBe(0)
  })

  it('omits employees with no compa-ratio and counts them', () => {
    // No dot can be drawn for someone who could not be placed. Counting them
    // means the interface can say so rather than quietly drawing fewer people
    // than the user pasted in.
    const layout = layoutDots([
      result({ employeeId: 'A' }),
      result({ employeeId: 'B', compaRatio: null, newCompaRatio: null, excluded: true }),
    ])
    expect(layout.dots).toHaveLength(1)
    expect(layout.omitted).toBe(1)
  })

  it('carries the rating and band through, for matrix hover linking', () => {
    const layout = layoutDots([
      result({ employeeId: 'A', performanceRating: 'Exceeds', bandId: 'band-100-110' }),
    ])
    expect(layout.dots[0].performanceRating).toBe('Exceeds')
    expect(layout.dots[0].bandId).toBe('band-100-110')
  })
})

describe('layoutDots - stacking', () => {
  it('gives a lone dot the centre row', () => {
    expect(layoutDots([result({ employeeId: 'A' })]).dots[0].row).toBe(0)
  })

  it('stacks symmetrically around the centre', () => {
    // Five employees at the same compa-ratio: 0, +1, -1, +2, -2.
    const layout = layoutDots(
      ['A', 'B', 'C', 'D', 'E'].map((id) => result({ employeeId: id })),
    )
    expect(layout.dots.map((d) => d.row)).toEqual([0, 1, -1, 2, -2])
    expect(layout.maxRow).toBe(2)
  })

  it('does not stack dots that fall in different bins', () => {
    const layout = layoutDots([
      result({ employeeId: 'A', compaRatio: 0.9, newCompaRatio: 0.9 }),
      result({ employeeId: 'B', compaRatio: 1.1, newCompaRatio: 1.1 }),
    ])
    expect(layout.dots.every((d) => d.row === 0)).toBe(true)
    expect(layout.maxRow).toBe(0)
  })

  it('stacks by the BEFORE position so a dot keeps its row when it moves', () => {
    // Two employees start together and end apart. They must stay on their own
    // rows, or the eye cannot follow either one sideways.
    const layout = layoutDots([
      result({ employeeId: 'A', compaRatio: 0.95, newCompaRatio: 0.95 }),
      result({ employeeId: 'B', compaRatio: 0.95, newCompaRatio: 1.4 }),
    ])
    expect(layout.dots.map((d) => d.row)).toEqual([0, 1])
  })

  it('is deterministic regardless of input order', () => {
    const a = layoutDots([
      result({ employeeId: 'A', compaRatio: 0.95, newCompaRatio: 0.95 }),
      result({ employeeId: 'B', compaRatio: 0.95, newCompaRatio: 0.95 }),
    ])
    const b = layoutDots([
      result({ employeeId: 'B', compaRatio: 0.95, newCompaRatio: 0.95 }),
      result({ employeeId: 'A', compaRatio: 0.95, newCompaRatio: 0.95 }),
    ])
    expect(a.dots.map((d) => [d.employeeId, d.row])).toEqual(
      b.dots.map((d) => [d.employeeId, d.row]),
    )
  })

  it('respects a wider bin by stacking more dots together', () => {
    const spread = [0.9, 0.92, 0.94].map((cr, i) =>
      result({ employeeId: `E${i}`, compaRatio: cr, newCompaRatio: cr }),
    )
    expect(layoutDots(spread, 0.01).maxRow).toBe(0)
    expect(layoutDots(spread, 0.1).maxRow).toBeGreaterThan(0)
  })
})

describe('layoutDots - the drawn range', () => {
  it('covers both the before and after position of every dot', () => {
    const layout = layoutDots([
      result({ employeeId: 'A', compaRatio: 0.7, newCompaRatio: 0.74 }),
      result({ employeeId: 'B', compaRatio: 1.2, newCompaRatio: 1.28 }),
    ])
    const [low, high] = layout.domain
    expect(low).toBeLessThan(0.7)
    expect(high).toBeGreaterThan(1.28)
  })

  it('does not crop outliers', () => {
    // The green- and red-circled employees are the interesting ones. Clamping
    // the axis to a tidy 0.80-1.20 would hide exactly who the user is after.
    const layout = layoutDots([
      result({ employeeId: 'A', compaRatio: 0.55, newCompaRatio: 0.57 }),
      result({ employeeId: 'B', compaRatio: 1.6, newCompaRatio: 1.6 }),
    ])
    expect(layout.domain[0]).toBeLessThan(0.55)
    expect(layout.domain[1]).toBeGreaterThan(1.6)
  })

  it('holds a minimum span so a tight population is not magnified', () => {
    const layout = layoutDots([
      result({ employeeId: 'A', compaRatio: 0.99, newCompaRatio: 0.99 }),
      result({ employeeId: 'B', compaRatio: 1.01, newCompaRatio: 1.01 }),
    ])
    expect(layout.domain[1] - layout.domain[0]).toBeGreaterThanOrEqual(0.2)
  })

  it('returns a sensible default range for an empty population', () => {
    expect(layoutDots([]).domain).toEqual([0.8, 1.2])
  })
})

describe('layoutDots - the sample population', () => {
  const scenario = runScenario(
    SAMPLE_POPULATION,
    SAMPLE_GRADES,
    DEFAULT_MERIT_MATRIX,
    DEFAULT_SETTINGS,
  )
  const layout = layoutDots(scenario.results)

  it('draws all 204 employees', () => {
    expect(layout.dots).toHaveLength(204)
    expect(layout.omitted).toBe(0)
  })

  it('moves every eligible dot to the right or leaves it still', () => {
    // A merit cycle never cuts pay, so no dot may travel left.
    for (const dot of layout.dots) {
      expect(dot.after).toBeGreaterThanOrEqual(dot.before - 1e-9)
    }
  })

  it('leaves ineligible dots exactly where they were', () => {
    const ineligible = layout.dots.filter((d) => !d.eligible)
    expect(ineligible.length).toBeGreaterThan(0)
    for (const dot of ineligible) {
      expect(dot.after).toBeCloseTo(dot.before, 10)
    }
  })

  it('marks the employees who end up outside their range', () => {
    expect(layout.dots.some((d) => d.isOverMaximumAfter)).toBe(true)
    expect(layout.dots.some((d) => d.isBelowMinimumAfter)).toBe(true)
  })

  it('keeps the stack shallow enough to draw', () => {
    // 204 dots binned at 0.01 should not pile into an unreadable column.
    expect(layout.maxRow).toBeLessThan(12)
  })
})

describe('layoutDotsByGrade - splitting the plot by grade', () => {
  const GRADES: Grade[] = [
    { id: 'G1', name: 'Analyst', order: 1, min: 51_000, mid: 60_000, max: 69_000 },
    { id: 'G2', name: 'Senior', order: 2, min: 80_000, mid: 100_000, max: 120_000 },
  ]

  const mixed = [
    result({ employeeId: 'A1', gradeId: 'G1', compaRatio: 0.95, newCompaRatio: 0.97 }),
    result({ employeeId: 'A2', gradeId: 'G1', compaRatio: 0.95, newCompaRatio: 0.97 }),
    result({ employeeId: 'B1', gradeId: 'G2', compaRatio: 1.02, newCompaRatio: 1.05 }),
  ]

  it('returns one group per grade, in declared order', () => {
    const layout = layoutDotsByGrade(mixed, GRADES)
    expect(layout.groups.map((g) => g.gradeName)).toEqual(['Analyst', 'Senior'])
  })

  it('puts each employee in their own grade band', () => {
    const layout = layoutDotsByGrade(mixed, GRADES)
    expect(layout.groups[0].dots.map((d) => d.employeeId)).toEqual(['A1', 'A2'])
    expect(layout.groups[1].dots.map((d) => d.employeeId)).toEqual(['B1'])
  })

  it('expresses each grade’s own bounds as compa-ratios', () => {
    // This is the whole point of the grouped view: on a shared axis these two
    // minimums sit at different compa-ratios, so no single line can show them.
    const layout = layoutDotsByGrade(mixed, GRADES)
    expect(layout.groups[0].minCompaRatio).toBeCloseTo(51_000 / 60_000, 10)
    expect(layout.groups[0].maxCompaRatio).toBeCloseTo(69_000 / 60_000, 10)
    expect(layout.groups[1].minCompaRatio).toBeCloseTo(80_000 / 100_000, 10)
    expect(layout.groups[1].maxCompaRatio).toBeCloseTo(120_000 / 100_000, 10)
    expect(layout.groups[0].minCompaRatio).not.toBeCloseTo(
      layout.groups[1].minCompaRatio!,
      3,
    )
  })

  it('restacks within each grade so rows start from that grade’s centre', () => {
    // A1 and A2 share a bin. Alone in their grade they must be rows 0 and 1,
    // regardless of where they sat among the whole population.
    const layout = layoutDotsByGrade(mixed, GRADES)
    expect(layout.groups[0].dots.map((d) => d.row)).toEqual([0, 1])
    expect(layout.groups[1].dots.map((d) => d.row)).toEqual([0])
    expect(layout.groups[1].maxRow).toBe(0)
  })

  it('shares one horizontal domain across every grade', () => {
    // The rows stack, but the axis is common, so a compa-ratio of 1.00 is in
    // the same place on every row.
    const layout = layoutDotsByGrade(mixed, GRADES)
    const flat = layoutDots(mixed)
    expect(layout.domain).toEqual(flat.domain)
  })

  it('returns an empty band for a grade with nobody in it', () => {
    const layout = layoutDotsByGrade([mixed[0]], GRADES)
    expect(layout.groups[1].dots).toEqual([])
    expect(layout.groups[1].maxRow).toBe(0)
  })

  it('keeps the same employees as the ungrouped layout', () => {
    const layout = layoutDotsByGrade(mixed, GRADES)
    const grouped = layout.groups.flatMap((g) => g.dots.map((d) => d.employeeId)).sort()
    const flat = layoutDots(mixed).dots.map((d) => d.employeeId).sort()
    expect(grouped).toEqual(flat)
  })

  it('reports the same omitted count as the ungrouped layout', () => {
    const withUnplaceable = [
      ...mixed,
      result({ employeeId: 'X', gradeId: 'GX', compaRatio: null, newCompaRatio: null, excluded: true }),
    ]
    expect(layoutDotsByGrade(withUnplaceable, GRADES).omitted).toBe(1)
  })

  it('leaves bounds null for a grade with no midpoint', () => {
    const broken: Grade[] = [{ ...GRADES[0], mid: 0 }]
    const layout = layoutDotsByGrade(mixed, broken)
    expect(layout.groups[0].minCompaRatio).toBeNull()
    expect(layout.groups[0].maxCompaRatio).toBeNull()
  })

  it('works on the sample population', () => {
    const scenario = runScenario(
      SAMPLE_POPULATION, SAMPLE_GRADES, DEFAULT_MERIT_MATRIX, DEFAULT_SETTINGS,
    )
    const layout = layoutDotsByGrade(scenario.results, SAMPLE_GRADES)
    expect(layout.groups).toHaveLength(8)
    const total = layout.groups.reduce((n, g) => n + g.dots.length, 0)
    expect(total).toBe(204)
    // Each grade's minimum sits at a different compa-ratio, because the spread
    // widens with grade. That is exactly why they cannot share one line.
    const mins = layout.groups.map((g) => g.minCompaRatio!)
    expect(new Set(mins.map((m) => m.toFixed(3))).size).toBeGreaterThan(4)
  })
})
