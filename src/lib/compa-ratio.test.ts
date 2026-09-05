import { describe, it, expect } from 'vitest'
import { calculateCompaRatio } from './compa-ratio'

describe('calculateCompaRatio', () => {
  it('returns 0.95 for a salary 5% below midpoint', () => {
    // 95,000 / 100,000 = 0.95
    expect(calculateCompaRatio(95_000, 100_000)).toBe(0.95)
  })

  it('returns 1.00 for a salary exactly at midpoint', () => {
    // 100,000 / 100,000 = 1.00
    expect(calculateCompaRatio(100_000, 100_000)).toBe(1.0)
  })

  it('returns 1.10 for a salary 10% above midpoint', () => {
    // 110,000 / 100,000 = 1.10
    expect(calculateCompaRatio(110_000, 100_000)).toBe(1.1)
  })

  it('grosses a part-time salary up to full-time equivalent before comparing', () => {
    // A 0.5 FTE employee paid 47,500 actual.
    // Full-time equivalent: 47,500 / 0.5 = 95,000
    // Compa-ratio:          95,000 / 100,000 = 0.95
    // Identical to the full-time employee in the first test, which is the point.
    expect(calculateCompaRatio(47_500, 100_000, 0.5)).toBe(0.95)
  })

  it('treats a 0.8 FTE employee consistently', () => {
    // Full-time equivalent: 76,000 / 0.8 = 95,000
    // Compa-ratio:          95,000 / 100,000 = 0.95
    expect(calculateCompaRatio(76_000, 100_000, 0.8)).toBe(0.95)
  })

  it('defaults to full-time when fte is not supplied', () => {
    expect(calculateCompaRatio(95_000, 100_000)).toBe(
      calculateCompaRatio(95_000, 100_000, 1),
    )
  })

  it('does not round — a repeating ratio keeps full precision', () => {
    // 100,000 / 3 = 33,333.333...  →  100,000 / 33,333.333... = 3
    expect(calculateCompaRatio(100_000, 100_000 / 3)).toBeCloseTo(3, 10)
  })

  it('returns null, not zero, when the midpoint is zero', () => {
    expect(calculateCompaRatio(95_000, 0)).toBeNull()
  })

  it('returns null when the midpoint is missing', () => {
    expect(calculateCompaRatio(95_000, NaN)).toBeNull()
  })

  it('returns null when the midpoint is negative', () => {
    expect(calculateCompaRatio(95_000, -100_000)).toBeNull()
  })

  it('returns null when fte is zero', () => {
    expect(calculateCompaRatio(95_000, 100_000, 0)).toBeNull()
  })

  it('returns null when the salary is not a number', () => {
    expect(calculateCompaRatio(NaN, 100_000)).toBeNull()
  })

  it('handles a green-circled employee below the range', () => {
    // 70,000 / 100,000 = 0.70
    expect(calculateCompaRatio(70_000, 100_000)).toBe(0.7)
  })

  it('handles a red-circled employee above the range', () => {
    // 130,000 / 100,000 = 1.30
    expect(calculateCompaRatio(130_000, 100_000)).toBe(1.3)
  })
})
