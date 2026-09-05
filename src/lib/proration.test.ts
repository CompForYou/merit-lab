import { describe, it, expect } from 'vitest'
import { completedMonthsBetween, calculateProrationFactor } from './proration'

const EFFECTIVE = '2025-01-01'

describe('completedMonthsBetween', () => {
  it('counts a full year', () => {
    // 2024-01-01 to 2025-01-01 = (2025-2024)*12 + (1-1) = 12
    expect(completedMonthsBetween('2024-01-01', '2025-01-01')).toBe(12)
  })

  it('counts half a year', () => {
    // 2024-07-01 to 2025-01-01 = 12 + (1-7) = 12 - 6 = 6
    expect(completedMonthsBetween('2024-07-01', '2025-01-01')).toBe(6)
  })

  it('counts a quarter', () => {
    // 2024-10-01 to 2025-01-01 = 12 + (1-10) = 12 - 9 = 3
    expect(completedMonthsBetween('2024-10-01', '2025-01-01')).toBe(3)
  })

  it('does not count a month that has not completed', () => {
    // 2024-04-15 to 2025-01-01 = 12 + (1-4) = 9, then day 1 < day 15, so 9 - 1 = 8
    expect(completedMonthsBetween('2024-04-15', '2025-01-01')).toBe(8)
  })

  it('counts the month once the day-of-month is reached', () => {
    // 2024-04-15 to 2025-01-15 = 12 + (1-4) = 9, day 15 is not < 15, so 9
    expect(completedMonthsBetween('2024-04-15', '2025-01-15')).toBe(9)
  })

  it('returns zero for the same date', () => {
    expect(completedMonthsBetween('2025-01-01', '2025-01-01')).toBe(0)
  })

  it('returns a negative count when the hire date is after the end', () => {
    // 2025-04-01 to 2025-01-01 = 0 + (1-4) = -3
    expect(completedMonthsBetween('2025-04-01', '2025-01-01')).toBe(-3)
  })

  it('counts across several years', () => {
    // 2020-01-01 to 2025-01-01 = 5*12 = 60
    expect(completedMonthsBetween('2020-01-01', '2025-01-01')).toBe(60)
  })

  it('returns null for a missing or malformed date', () => {
    expect(completedMonthsBetween(undefined, EFFECTIVE)).toBeNull()
    expect(completedMonthsBetween('2024-07-01', undefined)).toBeNull()
    expect(completedMonthsBetween('01/07/2024', EFFECTIVE)).toBeNull()
    expect(completedMonthsBetween('2024-13-01', EFFECTIVE)).toBeNull()
    expect(completedMonthsBetween('not a date', EFFECTIVE)).toBeNull()
  })
})

describe('calculateProrationFactor', () => {
  it('returns 1.00 for someone employed the whole period', () => {
    // 12 completed months / 12 = 1.00
    expect(calculateProrationFactor('2024-01-01', EFFECTIVE, true)).toBe(1)
  })

  it('returns 0.50 for a mid-year hire', () => {
    // 6 completed months / 12 = 0.50
    expect(calculateProrationFactor('2024-07-01', EFFECTIVE, true)).toBe(0.5)
  })

  it('returns 0.25 for an October hire', () => {
    // 3 completed months / 12 = 0.25
    expect(calculateProrationFactor('2024-10-01', EFFECTIVE, true)).toBe(0.25)
  })

  it('returns two thirds for a mid-April hire', () => {
    // 8 completed months / 12 = 0.6666...
    expect(calculateProrationFactor('2024-04-15', EFFECTIVE, true)).toBeCloseTo(
      2 / 3,
      10,
    )
  })

  it('caps long tenure at 1.00', () => {
    // 60 completed months, capped to 12 / 12 = 1.00
    expect(calculateProrationFactor('2020-01-01', EFFECTIVE, true)).toBe(1)
  })

  it('returns 0 for someone hired after the effective date', () => {
    // -3 completed months, floored to 0 / 12 = 0
    expect(calculateProrationFactor('2025-04-01', EFFECTIVE, true)).toBe(0)
  })

  it('returns 1.00 when proration is switched off, whatever the hire date', () => {
    // Off by default. A brand new hire is not prorated unless the user asks.
    expect(calculateProrationFactor('2024-10-01', EFFECTIVE, false)).toBe(1)
    expect(calculateProrationFactor('2025-04-01', EFFECTIVE, false)).toBe(1)
  })

  it('returns 1.00 when no hire date is present', () => {
    expect(calculateProrationFactor(undefined, EFFECTIVE, true)).toBe(1)
  })

  it('returns 1.00 when no merit effective date is set', () => {
    expect(calculateProrationFactor('2024-07-01', undefined, true)).toBe(1)
  })

  it('returns 1.00 rather than guessing at a malformed date', () => {
    // Rejecting bad dates is the importer's job, on entry, where the user can fix it.
    expect(calculateProrationFactor('01/07/2024', EFFECTIVE, true)).toBe(1)
  })
})
