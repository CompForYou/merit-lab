import type { Employee, Grade } from '../types/domain'
import type { EmployeeMeritResult } from './merit-increase'

/**
 * Per-employee results as CSV, for taking into a spreadsheet.
 *
 * Every intermediate value is included, not just the answer: the compa-ratio,
 * the band, the matrix percentage, the proration factor and the uncapped
 * increase are all there. A practitioner handed only a new salary cannot check
 * the working, and a number nobody can check is a number nobody will defend in
 * a review.
 *
 * Numbers are written unrounded, at full precision. Rounding belongs at display
 * time, and a spreadsheet will do its own.
 */
export function resultsToCsv(
  results: EmployeeMeritResult[],
  employees: Employee[],
  grades: Grade[],
): string {
  const employeeById = new Map(employees.map((e) => [e.id, e]))
  const gradeById = new Map(grades.map((g) => [g.id, g]))

  // Any grouping columns the user brought in with their file ride back out.
  const attributeNames = [
    ...new Set(employees.flatMap((e) => Object.keys(e.attributes ?? {}))),
  ].sort()

  const header = [
    'employee_id',
    'grade',
    'grade_name',
    'grade_min',
    'grade_mid',
    'grade_max',
    'base_salary',
    'fte',
    'full_time_equivalent_salary',
    'performance_rating',
    'eligible',
    'compa_ratio',
    'compa_ratio_band',
    'matrix_percent',
    'proration_factor',
    'uncapped_increase',
    'increase_amount',
    'lump_sum_amount',
    'withheld_at_maximum',
    'new_salary',
    'new_compa_ratio',
    'was_over_maximum',
    'is_over_maximum',
    'crossed_maximum',
    'is_below_minimum',
    'not_costed_reason',
    ...attributeNames,
  ]

  const rows = results.map((r) => {
    const employee = employeeById.get(r.employeeId)
    const grade = gradeById.get(r.gradeId)
    const band = r.bandId ?? ''

    return [
      r.employeeId,
      r.gradeId,
      grade?.name ?? '',
      grade?.min ?? '',
      grade?.mid ?? '',
      grade?.max ?? '',
      r.baseSalary,
      r.fte,
      r.fte > 0 ? r.baseSalary / r.fte : '',
      r.performanceRating,
      r.eligible ? 'Y' : 'N',
      r.compaRatio ?? '',
      band,
      r.matrixPercent ?? '',
      r.prorationFactor,
      r.uncappedIncreaseAmount,
      r.increaseAmount,
      r.lumpSumAmount,
      r.reducedByCap,
      r.newSalary,
      r.newCompaRatio ?? '',
      r.wasOverMaximumBefore ? 'Y' : 'N',
      r.isOverMaximumAfter ? 'Y' : 'N',
      r.crossedMaximum ? 'Y' : 'N',
      r.isBelowMinimumAfter ? 'Y' : 'N',
      r.exclusionReason ?? '',
      ...attributeNames.map((name) => employee?.attributes?.[name] ?? ''),
    ]
  })

  return [header, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n')
}

/**
 * Quote a cell only when it needs it, and double any quotes inside.
 *
 * A leading =, +, - or @ is prefixed with a quote character. Spreadsheets treat
 * those as the start of a formula, and an employee id or department name that
 * happens to begin with one would otherwise be executed rather than displayed.
 */
function escapeCell(value: string | number): string {
  const text = String(value)
  const needsFormulaGuard = /^[=+\-@\t\r]/.test(text) && Number.isNaN(Number(text))
  const guarded = needsFormulaGuard ? `'${text}` : text

  if (/[",\r\n]/.test(guarded)) return `"${guarded.replace(/"/g, '""')}"`
  return guarded
}
