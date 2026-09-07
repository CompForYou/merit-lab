import { describe, it, expect } from 'vitest'
import { assignCompaRatioBand, DEFAULT_COMPA_RATIO_BANDS } from './compa-ratio-bands'
import type { CompaRatioBand } from '../types/domain'

const bandFor = (compaRatio: number | null) =>
  assignCompaRatioBand(compaRatio)?.label ?? null

describe('DEFAULT_COMPA_RATIO_BANDS', () => {
  it('has the five bands the spec names', () => {
    expect(DEFAULT_COMPA_RATIO_BANDS.map((b) => b.label)).toEqual([
      'Below 0.80',
      '0.80 - 0.90',
      '0.90 - 1.00',
      '1.00 - 1.10',
      '1.10 and above',
    ])
  })

  it('leaves no gap between adjacent bands', () => {
    for (let i = 1; i < DEFAULT_COMPA_RATIO_BANDS.length; i++) {
      expect(DEFAULT_COMPA_RATIO_BANDS[i].lowerBound).toBe(
        DEFAULT_COMPA_RATIO_BANDS[i - 1].upperBound,
      )
    }
  })

  it('is unbounded at both ends', () => {
    expect(DEFAULT_COMPA_RATIO_BANDS[0].lowerBound).toBeNull()
    expect(DEFAULT_COMPA_RATIO_BANDS[4].upperBound).toBeNull()
  })
})

describe('assignCompaRatioBand — values inside each band', () => {
  it('places 0.70 below 0.80', () => {
    expect(bandFor(0.7)).toBe('Below 0.80')
  })
  it('places 0.85 in 0.80-0.90', () => {
    expect(bandFor(0.85)).toBe('0.80 - 0.90')
  })
  it('places 0.95 in 0.90-1.00', () => {
    expect(bandFor(0.95)).toBe('0.90 - 1.00')
  })
  it('places 1.05 in 1.00-1.10', () => {
    expect(bandFor(1.05)).toBe('1.00 - 1.10')
  })
  it('places 1.30 above 1.10', () => {
    expect(bandFor(1.3)).toBe('1.10 and above')
  })
})

describe('assignCompaRatioBand — boundary behaviour', () => {
  // The spec states boundaries are inclusive at the lower bound. Every value
  // sitting exactly on a boundary therefore belongs to the band ABOVE it.

  it('places exactly 0.80 in 0.80-0.90, not below 0.80', () => {
    expect(bandFor(0.8)).toBe('0.80 - 0.90')
  })

  it('places exactly 0.90 in 0.90-1.00, not 0.80-0.90', () => {
    expect(bandFor(0.9)).toBe('0.90 - 1.00')
  })

  it('places exactly 1.00 in 1.00-1.10, not 0.90-1.00', () => {
    // An employee paid exactly at midpoint sits at the BOTTOM of the
    // 1.00-1.10 band, not the top of the 0.90-1.00 band.
    expect(bandFor(1.0)).toBe('1.00 - 1.10')
  })

  it('places exactly 1.10 above 1.10', () => {
    expect(bandFor(1.1)).toBe('1.10 and above')
  })

  it('places a hair below a boundary in the lower band', () => {
    expect(bandFor(0.8999999)).toBe('0.80 - 0.90')
    expect(bandFor(0.9999999)).toBe('0.90 - 1.00')
  })
})

describe('assignCompaRatioBand — extremes and failures', () => {
  it('places a very low compa-ratio in the bottom band', () => {
    expect(bandFor(0.01)).toBe('Below 0.80')
  })

  it('places a very high compa-ratio in the top band', () => {
    expect(bandFor(5)).toBe('1.10 and above')
  })

  it('returns null when the compa-ratio could not be calculated', () => {
    // Propagates the null from calculateCompaRatio rather than inventing a band.
    expect(assignCompaRatioBand(null)).toBeNull()
  })

  it('returns null for a non-finite compa-ratio', () => {
    expect(assignCompaRatioBand(NaN)).toBeNull()
    expect(assignCompaRatioBand(Infinity)).toBeNull()
  })

  it('returns null when the supplied bands leave the value uncovered', () => {
    // A user-defined set with a hole in it: nothing covers 0.95.
    const gapped: CompaRatioBand[] = [
      { id: 'a', label: 'low', lowerBound: null, upperBound: 0.9 },
      { id: 'b', label: 'high', lowerBound: 1.0, upperBound: null },
    ]
    expect(assignCompaRatioBand(0.95, gapped)).toBeNull()
  })
})

describe('assignCompaRatioBand — user-defined bands', () => {
  it('accepts a custom band set', () => {
    const threeBands: CompaRatioBand[] = [
      { id: 'lo', label: 'Below 0.90', lowerBound: null, upperBound: 0.9 },
      { id: 'mid', label: '0.90 - 1.10', lowerBound: 0.9, upperBound: 1.1 },
      { id: 'hi', label: '1.10 and above', lowerBound: 1.1, upperBound: null },
    ]
    expect(assignCompaRatioBand(0.85, threeBands)?.label).toBe('Below 0.90')
    expect(assignCompaRatioBand(1.0, threeBands)?.label).toBe('0.90 - 1.10')
    expect(assignCompaRatioBand(1.1, threeBands)?.label).toBe('1.10 and above')
  })
})
