import { describe, it, expect } from 'vitest'
import { calculateRangeSpread } from './range-spread'

describe('calculateRangeSpread', () => {
  it('returns 0.50 for an 80,000-120,000 range', () => {
    // (120,000 - 80,000) / 80,000 = 40,000 / 80,000 = 0.50
    expect(calculateRangeSpread(80_000, 120_000)).toBe(0.5)
  })

  it('returns 0.50 for a 100,000-150,000 range', () => {
    // (150,000 - 100,000) / 100,000 = 50,000 / 100,000 = 0.50
    // Same spread, different absolute dollars — which is the point of the measure.
    expect(calculateRangeSpread(100_000, 150_000)).toBe(0.5)
  })

  it('returns 1.00 for a range whose maximum is double its minimum', () => {
    // (100,000 - 50,000) / 50,000 = 50,000 / 50,000 = 1.00
    expect(calculateRangeSpread(50_000, 100_000)).toBe(1)
  })

  it('returns a narrow spread for a tight range', () => {
    // (110,000 - 90,000) / 90,000 = 20,000 / 90,000 = 0.2222...
    expect(calculateRangeSpread(90_000, 110_000)).toBeCloseTo(0.222222, 6)
  })

  it('returns a wide spread for a broad range', () => {
    // (130,000 - 70,000) / 70,000 = 60,000 / 70,000 = 0.857142...
    expect(calculateRangeSpread(70_000, 130_000)).toBeCloseTo(0.857143, 6)
  })

  it('returns 0 when max equals min', () => {
    // (100,000 - 100,000) / 100,000 = 0. A zero-width range is degenerate but
    // not undefined, so it returns 0 rather than null.
    expect(calculateRangeSpread(100_000, 100_000)).toBe(0)
  })

  it('returns null when the minimum is zero', () => {
    expect(calculateRangeSpread(0, 100_000)).toBeNull()
  })

  it('returns null when the minimum is negative', () => {
    expect(calculateRangeSpread(-10_000, 100_000)).toBeNull()
  })

  it('returns null when the range is inverted', () => {
    expect(calculateRangeSpread(120_000, 80_000)).toBeNull()
  })

  it('returns null when a bound is missing', () => {
    expect(calculateRangeSpread(NaN, 120_000)).toBeNull()
    expect(calculateRangeSpread(80_000, NaN)).toBeNull()
  })
})
