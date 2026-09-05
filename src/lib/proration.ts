/** The performance period is the 12 months ending on the merit effective date. */
export const PERFORMANCE_PERIOD_MONTHS = 12

/**
 * Completed whole months between two ISO dates (yyyy-mm-dd).
 *
 * "Completed" means the day-of-month has been reached: 15 Jan to 14 Feb is zero
 * completed months; 15 Jan to 15 Feb is one. Negative when the end precedes the
 * start. Returns null when either date is missing or unparseable.
 *
 * Whole months rather than days, deliberately. Merit administration runs on
 * months, a month count can be verified by hand, and a day-count basis produces
 * factors like 0.6849 that nobody can check.
 *
 * Known edge: hired on the 31st with an effective date at the end of a shorter
 * month (31 Jan to 28 Feb) counts as zero completed months, not one. Rare, worth
 * one twelfth of one increase, and preferred over a rule that is harder to state.
 */
export function completedMonthsBetween(
  startDate: string | undefined,
  endDate: string | undefined,
): number | null {
  const start = parseIsoDate(startDate)
  const end = parseIsoDate(endDate)
  if (start === null || end === null) return null

  let months =
    (end.year - start.year) * 12 + (end.month - start.month)
  if (end.day < start.day) months -= 1

  return months
}

/**
 * The fraction of the performance period an employee worked, 0 to 1.
 *
 *   prorationFactor = completedMonths / 12
 *
 * Returns 1 (no proration) when proration is switched off, when no hire date is
 * present, or when no merit effective date is set. Malformed dates are the
 * importer's problem to reject on entry, not this function's to guess at.
 *
 * Someone employed for the whole period, or longer, returns 1. Someone hired
 * after the effective date returns 0.
 */
export function calculateProrationFactor(
  hireDate: string | undefined,
  meritEffectiveDate: string | undefined,
  prorationEnabled: boolean,
): number {
  if (!prorationEnabled) return 1
  if (!hireDate || !meritEffectiveDate) return 1

  const months = completedMonthsBetween(hireDate, meritEffectiveDate)
  if (months === null) return 1

  const clamped = Math.min(Math.max(months, 0), PERFORMANCE_PERIOD_MONTHS)
  return clamped / PERFORMANCE_PERIOD_MONTHS
}

interface ParsedDate {
  year: number
  month: number
  day: number
}

/** Strict yyyy-mm-dd parse. No timezone involvement — these are calendar dates. */
function parseIsoDate(value: string | undefined): ParsedDate | null {
  if (!value) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12) return null
  if (day < 1 || day > 31) return null

  return { year, month, day }
}
