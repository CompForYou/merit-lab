import { describe, it, expect } from 'vitest'
import {
  SAMPLE_POPULATION,
  SAMPLE_RATINGS,
  generateSamplePopulation,
} from './sample-population'
import { SAMPLE_GRADES } from './sample-structure'
import { calculateCompaRatio } from '../lib/compa-ratio'
import { calculateRangeSpread } from '../lib/range-spread'
import { calculateStructureProgressions } from '../lib/midpoint-progression'
import { median } from '../lib/statistics'

const gradeById = new Map(SAMPLE_GRADES.map((g) => [g.id, g]))
const fullTimeSalary = (e: { baseSalary: number; fte: number }) => e.baseSalary / e.fte

describe('SAMPLE_GRADES - the structure is coherent', () => {
  it('has eight grades in ascending order', () => {
    expect(SAMPLE_GRADES).toHaveLength(8)
    expect(SAMPLE_GRADES.map((g) => g.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('puts every midpoint exactly halfway between its minimum and maximum', () => {
    for (const g of SAMPLE_GRADES) {
      expect(g.mid).toBe((g.min + g.max) / 2)
    }
  })

  it('widens the range spread at every step', () => {
    const spreads = SAMPLE_GRADES.map((g) => calculateRangeSpread(g.min, g.max)!)
    for (let i = 1; i < spreads.length; i++) {
      expect(spreads[i]).toBeGreaterThan(spreads[i - 1])
    }
    // Grade 1 around 35%, grade 8 around 65%.
    expect(spreads[0]).toBeCloseTo(0.353, 3)
    expect(spreads[7]).toBeCloseTo(0.648, 3)
  })

  it('widens the midpoint progression toward the top', () => {
    const steps = calculateStructureProgressions(SAMPLE_GRADES)
    expect(steps).toHaveLength(7)
    // 11.67% at the bottom, 20.94% at the top.
    expect(steps[0].progression).toBeCloseTo(0.117, 3)
    expect(steps[6].progression).toBeCloseTo(0.2094, 4)
    expect(steps[6].progression!).toBeGreaterThan(steps[0].progression!)
  })

  it('overlaps each grade with the one above it', () => {
    // A structure whose grades do not overlap has gaps nobody can be paid in.
    for (let i = 1; i < SAMPLE_GRADES.length; i++) {
      expect(SAMPLE_GRADES[i].min).toBeLessThan(SAMPLE_GRADES[i - 1].max)
    }
  })
})

describe('generateSamplePopulation - determinism', () => {
  it('produces an identical population from the same seed', () => {
    expect(generateSamplePopulation(1)).toEqual(generateSamplePopulation(1))
  })

  it('produces a different population from a different seed', () => {
    expect(generateSamplePopulation(1)).not.toEqual(generateSamplePopulation(2))
  })

  it('is the population exported as the default sample', () => {
    expect(SAMPLE_POPULATION).toEqual(generateSamplePopulation())
  })
})

describe('SAMPLE_POPULATION - shape', () => {
  it('has 204 employees', () => {
    expect(SAMPLE_POPULATION).toHaveLength(204)
  })

  it('gives every employee a unique id', () => {
    const ids = new Set(SAMPLE_POPULATION.map((e) => e.id))
    expect(ids.size).toBe(SAMPLE_POPULATION.length)
  })

  it('uses no names as identifiers', () => {
    // Constraint: an id must not be a name. These are sequence numbers.
    for (const e of SAMPLE_POPULATION) {
      expect(e.id).toMatch(/^EMP-\d{4}$/)
    }
  })

  it('places every employee in a grade that exists', () => {
    for (const e of SAMPLE_POPULATION) {
      expect(gradeById.has(e.gradeId)).toBe(true)
    }
  })

  it('uses only ratings from the scale', () => {
    for (const e of SAMPLE_POPULATION) {
      expect(SAMPLE_RATINGS).toContain(e.performanceRating as never)
    }
  })

  it('gives every employee a positive salary and a valid FTE', () => {
    for (const e of SAMPLE_POPULATION) {
      expect(e.baseSalary).toBeGreaterThan(0)
      expect(e.fte).toBeGreaterThan(0)
      expect(e.fte).toBeLessThanOrEqual(1)
    }
  })

  it('carries department and location as grouping attributes', () => {
    for (const e of SAMPLE_POPULATION) {
      expect(e.attributes?.department).toBeTruthy()
      expect(e.attributes?.location).toBeTruthy()
    }
  })

  it('is shaped as a pyramid, with more juniors than seniors', () => {
    const count = (id: string) =>
      SAMPLE_POPULATION.filter((e) => e.gradeId === id).length
    expect(count('G1')).toBeGreaterThan(count('G8'))
    expect(count('G8')).toBe(8)
  })
})

describe('SAMPLE_POPULATION - it exercises the awkward cases', () => {
  // A sample where every path through the maths goes untested would make the
  // tool look like it works when it has not been asked a hard question.

  it('contains green-circled employees', () => {
    const green = SAMPLE_POPULATION.filter(
      (e) => fullTimeSalary(e) < gradeById.get(e.gradeId)!.min,
    )
    expect(green.length).toBeGreaterThanOrEqual(5)
    // But not so many that the structure looks broken: under 10%.
    expect(green.length / SAMPLE_POPULATION.length).toBeLessThan(0.1)
  })

  it('contains red-circled employees', () => {
    const red = SAMPLE_POPULATION.filter(
      (e) => fullTimeSalary(e) > gradeById.get(e.gradeId)!.max,
    )
    expect(red.length).toBeGreaterThanOrEqual(2)
    expect(red.length / SAMPLE_POPULATION.length).toBeLessThan(0.05)
  })

  it('contains part-time employees', () => {
    const partTime = SAMPLE_POPULATION.filter((e) => e.fte < 1)
    expect(partTime.length).toBeGreaterThanOrEqual(5)
  })

  it('contains ineligible employees', () => {
    const ineligible = SAMPLE_POPULATION.filter((e) => !e.eligible)
    expect(ineligible.length).toBeGreaterThanOrEqual(3)
    expect(ineligible.length / SAMPLE_POPULATION.length).toBeLessThan(0.1)
  })

  it('contains employees hired inside the last twelve months', () => {
    // So proration has something to act on against a 2025-01-01 effective date.
    const recent = SAMPLE_POPULATION.filter((e) => e.hireDate! >= '2024-01-01')
    expect(recent.length).toBeGreaterThanOrEqual(8)
  })

  it('gives every employee a parseable ISO hire date', () => {
    for (const e of SAMPLE_POPULATION) {
      expect(e.hireDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})

describe('SAMPLE_POPULATION - it looks like a real population', () => {
  const compaRatios = SAMPLE_POPULATION.map(
    (e) => calculateCompaRatio(e.baseSalary, gradeById.get(e.gradeId)!.mid, e.fte)!,
  )

  it('places everyone somewhere calculable', () => {
    for (const cr of compaRatios) expect(cr).not.toBeNull()
  })

  it('has a median compa-ratio a little below midpoint', () => {
    // Where populations usually sit, once hiring below midpoint and slow range
    // movement have done their work.
    const m = median(compaRatios)!
    expect(m).toBeGreaterThan(0.94)
    expect(m).toBeLessThan(1.01)
  })

  it('spreads across the range rather than clustering on one point', () => {
    const sorted = [...compaRatios].sort((a, b) => a - b)
    const p10 = sorted[Math.floor(sorted.length * 0.1)]
    const p90 = sorted[Math.floor(sorted.length * 0.9)]
    expect(p90 - p10).toBeGreaterThan(0.15)
  })

  it('puts half the population in the top two rating boxes', () => {
    // An observed distribution, not a guideline one: real populations drift up.
    const topTwo = SAMPLE_POPULATION.filter((e) =>
      ['Exceeds', 'Strong'].includes(e.performanceRating),
    )
    expect(topTwo.length / SAMPLE_POPULATION.length).toBeGreaterThan(0.4)
  })

  it('puts almost nobody in the bottom box', () => {
    const bottom = SAMPLE_POPULATION.filter((e) => e.performanceRating === 'Below')
    expect(bottom.length / SAMPLE_POPULATION.length).toBeLessThan(0.04)
  })
})
