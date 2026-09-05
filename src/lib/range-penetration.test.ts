import { describe, it, expect } from 'vitest'
import { calculateRangePenetration } from './range-penetration'
import { calculateCompaRatio } from './compa-ratio'

// A symmetric grade used throughout: 80,000 / 100,000 / 120,000.
// Range width = 120,000 - 80,000 = 40,000.
const MIN = 80_000
const MID = 100_000
const MAX = 120_000

describe('calculateRangePenetration', () => {
  it('returns 0 at the range minimum', () => {
    // (80,000 - 80,000) / 40,000 = 0 / 40,000 = 0
    expect(calculateRangePenetration(MIN, MIN, MAX)).toBe(0)
  })

  it('returns 1 at the range maximum', () => {
    // (120,000 - 80,000) / 40,000 = 40,000 / 40,000 = 1
    expect(calculateRangePenetration(MAX, MIN, MAX)).toBe(1)
  })

  it('returns 0.50 at the midpoint of a symmetric range', () => {
    // (100,000 - 80,000) / 40,000 = 20,000 / 40,000 = 0.50
    expect(calculateRangePenetration(MID, MIN, MAX)).toBe(0.5)
  })

  it('returns 0.25 one quarter through the range', () => {
    // (90,000 - 80,000) / 40,000 = 10,000 / 40,000 = 0.25
    expect(calculateRangePenetration(90_000, MIN, MAX)).toBe(0.25)
  })

  it('returns 0.75 three quarters through the range', () => {
    // (110,000 - 80,000) / 40,000 = 30,000 / 40,000 = 0.75
    expect(calculateRangePenetration(110_000, MIN, MAX)).toBe(0.75)
  })

  it('returns a NEGATIVE value for a green-circled employee', () => {
    // (70,000 - 80,000) / 40,000 = -10,000 / 40,000 = -0.25
    // Not clamped to 0. The employee is a quarter of a range-width below minimum.
    expect(calculateRangePenetration(70_000, MIN, MAX)).toBe(-0.25)
  })

  it('returns ABOVE 1 for a red-circled employee', () => {
    // (130,000 - 80,000) / 40,000 = 50,000 / 40,000 = 1.25
    // Not clamped to 1.
    expect(calculateRangePenetration(130_000, MIN, MAX)).toBe(1.25)
  })

  it('grosses a part-time salary up to full-time equivalent', () => {
    // 0.5 FTE paid 50,000 actual.
    // Full-time equivalent: 50,000 / 0.5 = 100,000
    // Penetration:          (100,000 - 80,000) / 40,000 = 0.50
    expect(calculateRangePenetration(50_000, MIN, MAX, 0.5)).toBe(0.5)
  })

  it('is not the same measure as compa-ratio', () => {
    // Same employee, asymmetric grade: min 80,000, mid 105,000, max 120,000.
    // Compa-ratio:  100,000 / 105,000        = 0.952...
    // Penetration:  (100,000 - 80,000)/40,000 = 0.50
    // Different questions, different answers. Bands built on one are not bands
    // built on the other.
    const compaRatio = calculateCompaRatio(100_000, 105_000)!
    const penetration = calculateRangePenetration(100_000, MIN, MAX)!
    expect(compaRatio).toBeCloseTo(0.952381, 6)
    expect(penetration).toBe(0.5)
    expect(compaRatio).not.toBe(penetration)
  })

  it('reflects range spread — same compa-ratio, different penetration', () => {
    // Two employees, both at compa-ratio 0.90 against a 100,000 midpoint,
    // in grades with different spreads.
    // Narrow grade (90,000-110,000): (90,000 - 90,000) / 20,000 = 0.00
    // Wide grade   (70,000-130,000): (90,000 - 70,000) / 60,000 = 0.3333...
    expect(calculateRangePenetration(90_000, 90_000, 110_000)).toBe(0)
    expect(calculateRangePenetration(90_000, 70_000, 130_000)).toBeCloseTo(1 / 3, 10)
  })

  it('returns null when max equals min (no range width)', () => {
    expect(calculateRangePenetration(95_000, 100_000, 100_000)).toBeNull()
  })

  it('returns null when the range is inverted', () => {
    expect(calculateRangePenetration(95_000, 120_000, 80_000)).toBeNull()
  })

  it('returns null when a bound is missing', () => {
    expect(calculateRangePenetration(95_000, NaN, MAX)).toBeNull()
    expect(calculateRangePenetration(95_000, MIN, NaN)).toBeNull()
  })

  it('returns null when fte is zero', () => {
    expect(calculateRangePenetration(95_000, MIN, MAX, 0)).toBeNull()
  })

  it('returns null when the salary is not a number', () => {
    expect(calculateRangePenetration(NaN, MIN, MAX)).toBeNull()
  })
})
