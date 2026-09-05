import { describe, it, expect } from 'vitest'
import {
  calculateMidpointProgression,
  calculateStructureProgressions,
} from './midpoint-progression'
import type { Grade } from '../types/domain'

const grade = (order: number, name: string, min: number, mid: number, max: number): Grade => ({
  id: `G${order}`,
  name,
  order,
  min,
  mid,
  max,
})

describe('calculateMidpointProgression', () => {
  it('returns 0.10 for a 100,000 to 110,000 step', () => {
    // (110,000 - 100,000) / 100,000 = 10,000 / 100,000 = 0.10
    expect(calculateMidpointProgression(100_000, 110_000)).toBe(0.1)
  })

  it('returns 0.15 for a 100,000 to 115,000 step', () => {
    // (115,000 - 100,000) / 100,000 = 15,000 / 100,000 = 0.15
    expect(calculateMidpointProgression(100_000, 115_000)).toBe(0.15)
  })

  it('returns 0.25 for an 80,000 to 100,000 step', () => {
    // (100,000 - 80,000) / 80,000 = 20,000 / 80,000 = 0.25
    expect(calculateMidpointProgression(80_000, 100_000)).toBe(0.25)
  })

  it('measures against the LOWER grade, not the higher', () => {
    // 80,000 -> 100,000 is a 25% step up: 20,000 / 80,000 = 0.25
    // It is NOT 20% (20,000 / 100,000). The denominator is the grade below.
    expect(calculateMidpointProgression(80_000, 100_000)).toBe(0.25)
    expect(calculateMidpointProgression(80_000, 100_000)).not.toBe(0.2)
  })

  it('returns a NEGATIVE progression for an inverted structure', () => {
    // (95,000 - 100,000) / 100,000 = -5,000 / 100,000 = -0.05
    // A higher-ordered grade paying less than the one below it. Surfaced, not hidden.
    expect(calculateMidpointProgression(100_000, 95_000)).toBe(-0.05)
  })

  it('returns 0 when two adjacent midpoints are identical', () => {
    expect(calculateMidpointProgression(100_000, 100_000)).toBe(0)
  })

  it('returns null when the lower midpoint is zero', () => {
    expect(calculateMidpointProgression(0, 100_000)).toBeNull()
  })

  it('returns null when a midpoint is missing', () => {
    expect(calculateMidpointProgression(100_000, NaN)).toBeNull()
    expect(calculateMidpointProgression(NaN, 100_000)).toBeNull()
  })
})

describe('calculateStructureProgressions', () => {
  // Three grades with a constant 25% progression:
  //   G1 mid  80,000
  //   G2 mid 100,000   (100,000 -  80,000) /  80,000 = 0.25
  //   G3 mid 125,000   (125,000 - 100,000) / 100,000 = 0.25
  const structure: Grade[] = [
    grade(1, 'Analyst', 64_000, 80_000, 96_000),
    grade(2, 'Senior Analyst', 80_000, 100_000, 120_000),
    grade(3, 'Manager', 100_000, 125_000, 150_000),
  ]

  it('produces one step fewer than the number of grades', () => {
    expect(calculateStructureProgressions(structure)).toHaveLength(2)
  })

  it('computes each adjacent step', () => {
    const steps = calculateStructureProgressions(structure)
    expect(steps[0].progression).toBe(0.25)
    expect(steps[1].progression).toBe(0.25)
  })

  it('labels each step with the grades it spans', () => {
    const steps = calculateStructureProgressions(structure)
    expect(steps[0].lowerGradeName).toBe('Analyst')
    expect(steps[0].higherGradeName).toBe('Senior Analyst')
    expect(steps[1].lowerGradeName).toBe('Senior Analyst')
    expect(steps[1].higherGradeName).toBe('Manager')
  })

  it('uses the explicit order field, not the array sequence', () => {
    // Same three grades, shuffled. Results must be identical.
    const shuffled = [structure[2], structure[0], structure[1]]
    const steps = calculateStructureProgressions(shuffled)
    expect(steps.map((s) => s.lowerGradeName)).toEqual(['Analyst', 'Senior Analyst'])
    expect(steps.map((s) => s.progression)).toEqual([0.25, 0.25])
  })

  it('does not sort the caller-supplied array in place', () => {
    const shuffled = [structure[2], structure[0], structure[1]]
    calculateStructureProgressions(shuffled)
    expect(shuffled[0].name).toBe('Manager')
  })

  it('uses order even when it disagrees with midpoint sequence', () => {
    // A deliberately inverted structure: the grade ordered ABOVE has a LOWER
    // midpoint. Ordering by midpoint would silently hide this; ordering by the
    // declared `order` reports it as a negative progression.
    //   (95,000 - 100,000) / 100,000 = -0.05
    const inverted: Grade[] = [
      grade(1, 'Lower', 80_000, 100_000, 120_000),
      grade(2, 'Higher', 76_000, 95_000, 114_000),
    ]
    const steps = calculateStructureProgressions(inverted)
    expect(steps[0].lowerGradeName).toBe('Lower')
    expect(steps[0].progression).toBe(-0.05)
  })

  it('returns no steps for a single-grade structure', () => {
    expect(calculateStructureProgressions([structure[0]])).toEqual([])
  })

  it('returns no steps for an empty structure', () => {
    expect(calculateStructureProgressions([])).toEqual([])
  })
})
