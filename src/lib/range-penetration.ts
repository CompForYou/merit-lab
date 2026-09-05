/**
 * Range penetration — how far through the range the salary sits.
 *
 *   rangePenetration = (fullTimeEquivalentSalary - gradeMin) / (gradeMax - gradeMin)
 *
 * Returned as a decimal: 0 at the minimum, 1 at the maximum, 0.5 halfway.
 *
 * NOT CLAMPED, deliberately. A green-circled employee returns a negative value and
 * a red-circled employee returns above 1. Those outliers are the interesting cases
 * and clamping would hide exactly the people a practitioner is looking for.
 *
 * FTE is grossed up before the comparison, for the same reason as compa-ratio:
 * this places an employee in a range, and the range is expressed in full-time terms.
 *
 * Range penetration is not compa-ratio. Compa-ratio measures against a single point
 * (the midpoint); penetration measures position across the whole span. Two employees
 * can share a compa-ratio and have different penetration if their grades have
 * different range spreads.
 *
 * Returns null when the range has no width (max equals min) or is inverted.
 */
export function calculateRangePenetration(
  baseSalary: number,
  gradeMin: number,
  gradeMax: number,
  fte: number = 1,
): number | null {
  if (!Number.isFinite(baseSalary)) return null
  if (!Number.isFinite(gradeMin) || !Number.isFinite(gradeMax)) return null
  if (gradeMax <= gradeMin) return null
  if (!Number.isFinite(fte) || fte <= 0) return null

  const fullTimeEquivalentSalary = baseSalary / fte
  return (fullTimeEquivalentSalary - gradeMin) / (gradeMax - gradeMin)
}
