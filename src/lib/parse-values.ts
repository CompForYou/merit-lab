/**
 * Reading the values a payroll system actually exports.
 *
 * These are separated from the import itself so that column mapping can ask
 * "does this column look like money?" using exactly the same reader that will
 * later parse it. A preview that disagrees with the import is worse than no
 * preview at all.
 */

/** "$95,000.50", "95 000", "(1,000)" as negative. Returns null if unreadable. */
export function parseCurrency(raw: string): number | null {
  if (raw === '') return null
  const negative = /^\(.*\)$/.test(raw.trim())
  const cleaned = raw.replace(/[()$£€¥,\s]/g, '').replace(/[A-Za-z]/g, '')
  if (cleaned === '' || !/^-?\d*\.?\d+$/.test(cleaned)) return null
  const value = Number(cleaned)
  if (!Number.isFinite(value)) return null
  return negative ? -value : value
}

/**
 * Whether a value reads as a number without anything being thrown away.
 *
 * Deliberately stricter than `parseCurrency`, which removes letters before
 * parsing so that "USD 95000" imports. That tolerance is right when reading a
 * cell the user has already told us is money, and wrong when deciding whether a
 * column *is* money: under `parseCurrency`, "Person Number 3" reads as 3 and a
 * column of names would profile as numeric.
 *
 * So this permits currency symbols, thousands separators, parentheses and a
 * percent sign, and rejects anything that leaves a letter behind.
 */
export function looksNumeric(raw: string): boolean {
  const value = raw.trim()
  if (value === '') return false
  const stripped = value.replace(/[()$£€¥,%\s]/g, '')
  return /^[-+]?\d*\.?\d+$/.test(stripped)
}

/**
 * FTE arrives as a decimal (0.5) or a percentage (50), depending on the system.
 * Anything above 1 is read as a percentage, which is the only interpretation
 * that makes sense: nobody works 50 times full time.
 */
export function parseFte(raw: string): {
  value: number
  error?: string
  warning?: string
} {
  if (raw === '') return { value: 1 }

  const cleaned = raw.replace(/[%\s]/g, '')
  const value = Number(cleaned)
  if (cleaned === '' || !Number.isFinite(value)) {
    return { value: 1, error: `FTE "${raw}" is not a number.` }
  }
  if (value <= 0) return { value: 1, error: 'FTE must be greater than zero.' }

  if (value > 1) {
    if (value > 100) return { value: 1, error: `FTE "${raw}" is above 100%.` }
    return {
      value: value / 100,
      warning: `FTE "${raw}" read as ${value}%, that is ${value / 100} FTE.`,
    }
  }
  return { value }
}

export function parseBoolean(raw: string): boolean | null {
  const value = raw.trim().toLowerCase()
  if (value === '') return true
  if (['y', 'yes', 'true', 't', '1', 'eligible'].includes(value)) return true
  if (['n', 'no', 'false', 'f', '0', 'ineligible', 'not eligible'].includes(value)) {
    return false
  }
  return null
}

/** Accepts yyyy-mm-dd, dd/mm/yyyy and mm/dd/yyyy. Returns yyyy-mm-dd. */
export function normalizeDate(raw: string): string | undefined {
  const value = raw.trim()

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value)
  if (iso) return buildDate(+iso[1], +iso[2], +iso[3])

  const slashed = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(value)
  if (slashed) {
    const first = +slashed[1]
    const second = +slashed[2]
    const year = +slashed[3]
    // Ambiguous between day-first and month-first. Whichever value cannot be a
    // month decides it; if both could be, day-first is assumed.
    if (first > 12) return buildDate(year, second, first)
    if (second > 12) return buildDate(year, first, second)
    return buildDate(year, second, first)
  }

  return undefined
}

function buildDate(year: number, month: number, day: number): string | undefined {
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
