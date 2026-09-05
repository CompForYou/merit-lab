/**
 * Compa-ratio — base salary as a proportion of the grade midpoint.
 *
 *   compaRatio = fullTimeEquivalentSalary / gradeMidpoint
 *
 * Returned as a decimal (0.95), never a percentage. Never rounded: rounding here
 * would propagate into band assignment and budget cost.
 *
 * FTE handling. `baseSalary` is the employee's ACTUAL annualized pay at their FTE,
 * so a 0.5 FTE employee paid $47,500 has a baseSalary of $47,500, not $95,000.
 * Range placement must compare like with like against a full-time midpoint, so the
 * salary is grossed up to full-time equivalent before the comparison. Without this,
 * every part-time employee reads as severely green-circled and lands in the
 * highest-increase band of the merit matrix.
 *
 * Cost calculations use baseSalary directly and must NOT use this gross-up.
 *
 * Returns null — never zero — when the ratio is undefined. A zero would flow
 * silently into a band lookup and understate spend; a null forces the caller to
 * handle the employee explicitly.
 */
export function calculateCompaRatio(
  baseSalary: number,
  gradeMidpoint: number,
  fte: number = 1,
): number | null {
  if (!Number.isFinite(baseSalary)) return null
  if (!Number.isFinite(gradeMidpoint) || gradeMidpoint <= 0) return null
  if (!Number.isFinite(fte) || fte <= 0) return null

  const fullTimeEquivalentSalary = baseSalary / fte
  return fullTimeEquivalentSalary / gradeMidpoint
}
