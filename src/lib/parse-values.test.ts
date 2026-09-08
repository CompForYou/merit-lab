import { describe, it, expect } from 'vitest'
import { looksNumeric, parseCurrency } from './parse-values'

/**
 * The other readers here are exercised through `import-employees.test.ts`,
 * which tests them against whole files. `looksNumeric` has no such coverage
 * because nothing imports through it: it exists only to decide what a column
 * is, and the cases that matter are the ones where it must disagree with
 * `parseCurrency`.
 */
describe('looksNumeric', () => {
  it('accepts money as a payroll system writes it', () => {
    expect(looksNumeric('95000')).toBe(true)
    expect(looksNumeric('$95,000')).toBe(true)
    expect(looksNumeric('95,000.50')).toBe(true)
    expect(looksNumeric('£102,500')).toBe(true)
    expect(looksNumeric('(1,000)')).toBe(true)
    expect(looksNumeric('0.5')).toBe(true)
    expect(looksNumeric('50%')).toBe(true)
  })

  it('rejects text that merely contains a number', () => {
    // This is the whole point. parseCurrency strips letters before parsing, so
    // it reads a 3 out of "Person Number 3" — correct when the user has already
    // said the column is money, and wrong when deciding whether it is.
    expect(parseCurrency('Person Number 3')).toBe(3)
    expect(looksNumeric('Person Number 3')).toBe(false)

    expect(parseCurrency('Grade 5')).toBe(5)
    expect(looksNumeric('Grade 5')).toBe(false)
  })

  it('rejects blanks and non-numbers', () => {
    expect(looksNumeric('')).toBe(false)
    expect(looksNumeric('   ')).toBe(false)
    expect(looksNumeric('n/a')).toBe(false)
    expect(looksNumeric('Meets')).toBe(false)
    expect(looksNumeric('2020-03-15')).toBe(false)
  })

  it('rejects a currency code it cannot strip, rather than guessing', () => {
    // "USD 95000" imports fine once the column is mapped, because parseCurrency
    // removes the letters. It does not profile as numeric, so the column reads
    // as text and the mapping check asks the user to confirm it. Admitting the
    // uncertainty is cheaper than a silently mistyped column.
    expect(parseCurrency('USD 95000')).toBe(95_000)
    expect(looksNumeric('USD 95000')).toBe(false)
  })
})
