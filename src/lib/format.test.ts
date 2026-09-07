import { describe, it, expect } from 'vitest'
import {
  NO_VALUE,
  formatCurrency,
  formatCurrencyCompact,
  formatCurrencySigned,
  formatPercent,
  formatPercentSigned,
  formatCompaRatio,
  formatCount,
  pluralize,
} from './format'

describe('formatCurrency', () => {
  it('adds thousands separators', () => {
    expect(formatCurrency(95_000)).toBe('$95,000')
    expect(formatCurrency(1_710_000)).toBe('$1,710,000')
  })

  it('rounds to whole dollars at the last moment', () => {
    expect(formatCurrency(2_433.33)).toBe('$2,433')
    expect(formatCurrency(2_433.67)).toBe('$2,434')
  })

  it('handles zero and negatives', () => {
    expect(formatCurrency(0)).toBe('$0')
    expect(formatCurrency(-1_612.5)).toBe('-$1,613')
  })

  it('rounds a negative exactly like its positive twin', () => {
    // JavaScript's Math.round sends half toward positive infinity, so the naive
    // version renders -1612.50 as -1,612 and +1612.50 as +1,613. A variance
    // that changes magnitude when it changes sign looks like a bug.
    expect(formatCurrency(1_612.5)).toBe('$1,613')
    expect(formatCurrency(-1_612.5)).toBe('-$1,613')
    expect(formatCurrency(2_433.5)).toBe('$2,434')
    expect(formatCurrency(-2_433.5)).toBe('-$2,434')
  })
})

describe('formatCurrencyCompact', () => {
  it('abbreviates millions to two decimals', () => {
    expect(formatCurrencyCompact(1_710_000)).toBe('$1.71M')
    expect(formatCurrencyCompact(17_057_300)).toBe('$17.06M')
  })

  it('abbreviates thousands with no decimals', () => {
    expect(formatCurrencyCompact(85_000)).toBe('$85K')
    expect(formatCurrencyCompact(1_612.5 * 10)).toBe('$16K')
  })

  it('shows whole dollars below ten thousand, where abbreviating loses too much', () => {
    expect(formatCurrencyCompact(9_080)).toBe('$9,080')
    expect(formatCurrencyCompact(1_612.5)).toBe('$1,613')
  })

  it('keeps the sign on negatives', () => {
    expect(formatCurrencyCompact(-1_710_000)).toBe('-$1.71M')
  })
})

describe('formatPercent', () => {
  it('turns a decimal into a percentage', () => {
    // Storage is 0.0325; the screen shows 3.25%.
    expect(formatPercent(0.0325)).toBe('3.25%')
    expect(formatPercent(0.03)).toBe('3.00%')
  })

  it('respects the requested precision', () => {
    expect(formatPercent(0.0275988, 1)).toBe('2.8%')
    expect(formatPercent(0.0275988, 3)).toBe('2.760%')
  })
})

describe('formatPercentSigned', () => {
  it('marks an over-target variance with a plus', () => {
    expect(formatPercentSigned(0.0042)).toBe('+0.42%')
  })

  it('leaves the minus sign on an under-target variance', () => {
    expect(formatPercentSigned(-0.0049012)).toBe('-0.49%')
  })

  it('does not sign an exact zero', () => {
    expect(formatPercentSigned(0)).toBe('0.00%')
  })
})

describe('formatCurrencySigned', () => {
  it('signs both directions', () => {
    expect(formatCurrencySigned(85_000)).toBe('+$85K')
    expect(formatCurrencySigned(-1_612.5)).toBe('-$1,613')
  })
})

describe('formatCompaRatio', () => {
  it('shows two decimals, never a percentage', () => {
    expect(formatCompaRatio(0.95)).toBe('0.95')
    expect(formatCompaRatio(1)).toBe('1.00')
    expect(formatCompaRatio(1.0888888)).toBe('1.09')
  })
})

describe('formatCount', () => {
  it('separates thousands', () => {
    expect(formatCount(204)).toBe('204')
    expect(formatCount(12_500)).toBe('12,500')
  })
})

describe('pluralize', () => {
  it('uses the singular for exactly one', () => {
    expect(pluralize(1, 'employee')).toBe('1 employee')
  })

  it('uses the plural for everything else', () => {
    expect(pluralize(0, 'employee')).toBe('0 employees')
    expect(pluralize(204, 'employee')).toBe('204 employees')
  })

  it('accepts an irregular plural', () => {
    expect(pluralize(2, 'person', 'people')).toBe('2 people')
  })
})

describe('null handling - the rule that matters', () => {
  // A null means "could not be calculated". Rendering it as 0 would turn a
  // missing midpoint into a real-looking figure, which is exactly the silent
  // failure the null return values exist to prevent.
  it('renders every null as an em dash, never a zero', () => {
    expect(formatCurrency(null)).toBe(NO_VALUE)
    expect(formatCurrencyCompact(null)).toBe(NO_VALUE)
    expect(formatCurrencySigned(null)).toBe(NO_VALUE)
    expect(formatPercent(null)).toBe(NO_VALUE)
    expect(formatPercentSigned(null)).toBe(NO_VALUE)
    expect(formatCompaRatio(null)).toBe(NO_VALUE)
    expect(formatCount(null)).toBe(NO_VALUE)
  })

  it('renders undefined the same way', () => {
    expect(formatCurrency(undefined)).toBe(NO_VALUE)
    expect(formatCompaRatio(undefined)).toBe(NO_VALUE)
  })

  it('renders NaN and Infinity as no value rather than as text', () => {
    expect(formatCurrency(NaN)).toBe(NO_VALUE)
    expect(formatPercent(Infinity)).toBe(NO_VALUE)
  })

  it('never confuses zero with no value', () => {
    expect(formatCurrency(0)).toBe('$0')
    expect(formatCompaRatio(0)).toBe('0.00')
    expect(formatCurrency(0)).not.toBe(NO_VALUE)
  })
})
