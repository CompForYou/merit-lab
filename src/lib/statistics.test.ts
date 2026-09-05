import { describe, it, expect } from 'vitest'
import { mean, median } from './statistics'

describe('mean', () => {
  it('averages a simple set', () => {
    // (1 + 2 + 3 + 4) / 4 = 10 / 4 = 2.5
    expect(mean([1, 2, 3, 4])).toBe(2.5)
  })

  it('averages salaries', () => {
    // (90,000 + 100,000 + 110,000) / 3 = 300,000 / 3 = 100,000
    expect(mean([90_000, 100_000, 110_000])).toBe(100_000)
  })

  it('returns the value itself for a single item', () => {
    expect(mean([95_000])).toBe(95_000)
  })

  it('returns null for an empty set', () => {
    expect(mean([])).toBeNull()
  })
})

describe('median', () => {
  it('returns the middle value of an odd-sized set', () => {
    // sorted: 90,000 | 100,000 | 130,000  -> middle is 100,000
    expect(median([130_000, 90_000, 100_000])).toBe(100_000)
  })

  it('averages the two middle values of an even-sized set', () => {
    // sorted: 90,000 | 100,000 | 110,000 | 130,000
    // (100,000 + 110,000) / 2 = 105,000
    expect(median([130_000, 90_000, 110_000, 100_000])).toBe(105_000)
  })

  it('is not distorted by an extreme value the way the mean is', () => {
    // mean:   (90,000 + 100,000 + 500,000) / 3 = 230,000
    // median: 100,000
    expect(mean([90_000, 100_000, 500_000])).toBe(230_000)
    expect(median([90_000, 100_000, 500_000])).toBe(100_000)
  })

  it('returns the value itself for a single item', () => {
    expect(median([95_000])).toBe(95_000)
  })

  it('returns null for an empty set', () => {
    expect(median([])).toBeNull()
  })

  it('does not sort the caller-supplied array in place', () => {
    const values = [130_000, 90_000, 100_000]
    median(values)
    expect(values[0]).toBe(130_000)
  })
})
