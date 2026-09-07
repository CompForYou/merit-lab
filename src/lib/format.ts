/**
 * Display formatting. The ONLY place in the codebase where rounding happens.
 *
 * Every calculation in src/lib carries full precision; these functions round at
 * the last possible moment, on the way to the screen. Rounding earlier produces
 * budget variances a practitioner will notice and distrust.
 *
 * A null becomes an em dash, never a zero. "Not calculable" and "zero" are
 * different statements, and a tool that renders the first as the second is
 * lying quietly.
 */

/**
 * Round half AWAY FROM ZERO, not JavaScript's default of half toward positive
 * infinity. Math.round(-1612.5) is -1612 while Math.round(1612.5) is 1613, so
 * the default renders a variance of plus and minus the same amount at different
 * magnitudes. A practitioner reads that as a defect, and they are right to.
 */
function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value)
}

/**
 * The currency and locale every figure is rendered in.
 *
 * Held as module state rather than threaded through every call. Formatting is
 * display-only and single-valued for the whole interface, and passing it into
 * fifteen components would add a parameter to code that has no other reason to
 * know about it. The compensation maths is unit-agnostic and untouched by this:
 * a scenario is single-currency, exactly as the spec requires.
 */
export interface CurrencyFormat {
  /** ISO 4217 code, e.g. USD, EUR, GBP. */
  currency: string
  /** BCP 47 tag, e.g. en-US, de-DE. Decides separators and symbol placement. */
  locale: string
}

const DEFAULT_FORMAT: CurrencyFormat = { currency: 'USD', locale: 'en-US' }
let activeFormat: CurrencyFormat = DEFAULT_FORMAT

export function setCurrencyFormat(next: CurrencyFormat): void {
  activeFormat = isUsable(next) ? next : DEFAULT_FORMAT
}

export function getCurrencyFormat(): CurrencyFormat {
  return activeFormat
}

/** Restores the default. Used by tests so one cannot leak into the next. */
export function resetCurrencyFormat(): void {
  activeFormat = DEFAULT_FORMAT
}

/** An unknown code or locale throws inside Intl, which would take the page down. */
function isUsable(format: CurrencyFormat): boolean {
  try {
    new Intl.NumberFormat(format.locale, {
      style: 'currency',
      currency: format.currency,
    }).format(1)
    return true
  } catch {
    return false
  }
}

function currencyFormatter(): Intl.NumberFormat {
  return new Intl.NumberFormat(activeFormat.locale, {
    style: 'currency',
    currency: activeFormat.currency,
    maximumFractionDigits: 0,
  })
}

/** Just the symbol, for building abbreviated figures like 1.71M. */
export function currencySymbol(): string {
  const parts = new Intl.NumberFormat(activeFormat.locale, {
    style: 'currency',
    currency: activeFormat.currency,
  }).formatToParts(1)
  return parts.find((part) => part.type === 'currency')?.value ?? ''
}

/** What a null renders as. Visually distinct from any real figure. */
export const NO_VALUE = '—'

/** Whole dollars with thousands separators: 95000 becomes $95,000. */
export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_VALUE
  return currencyFormatter().format(roundHalfAwayFromZero(value))
}

/**
 * Abbreviated currency for headline figures: 1710000 becomes $1.71M.
 * Below 10,000 it falls back to whole dollars, where the abbreviation would lose
 * more precision than it saves space.
 */
export function formatCurrencyCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_VALUE

  const sign = value < 0 ? '-' : ''
  const magnitude = Math.abs(value)
  const symbol = currencySymbol()

  if (magnitude >= 1_000_000) {
    return `${sign}${symbol}${(magnitude / 1_000_000).toFixed(2)}M`
  }
  if (magnitude >= 10_000) return `${sign}${symbol}${Math.round(magnitude / 1_000)}K`
  return currencyFormatter().format(roundHalfAwayFromZero(value))
}

/**
 * A decimal as a percentage: 0.0325 becomes 3.25%.
 * Internal storage is always decimal; this is the only place it becomes a percent.
 */
export function formatPercent(
  value: number | null | undefined,
  decimals = 2,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_VALUE
  return `${(value * 100).toFixed(decimals)}%`
}

/** A signed percentage for variances: +0.42% or -0.49%. */
export function formatPercentSigned(
  value: number | null | undefined,
  decimals = 2,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_VALUE
  const sign = value > 0 ? '+' : ''
  return `${sign}${(value * 100).toFixed(decimals)}%`
}

/** A signed dollar figure for variances: +$85K or -$1,613. */
export function formatCurrencySigned(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_VALUE
  const sign = value > 0 ? '+' : ''
  return `${sign}${formatCurrencyCompact(value)}`
}

/** Compa-ratio to two decimals: 0.95. Never shown as a percentage. */
export function formatCompaRatio(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_VALUE
  return value.toFixed(2)
}

/** A headcount or any other integer. */
export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_VALUE
  return roundHalfAwayFromZero(value).toLocaleString(activeFormat.locale)
}

/** "1 employee" / "204 employees", so labels do not read as a bug. */
export function pluralize(count: number, singular: string, plural?: string): string {
  const word = count === 1 ? singular : (plural ?? `${singular}s`)
  return `${formatCount(count)} ${word}`
}
