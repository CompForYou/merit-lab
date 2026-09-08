import type { Employee } from '../types/domain'
import { parseDelimitedText } from './csv'
import { parseCurrency, parseFte, parseBoolean, normalizeDate } from './parse-values'
import {
  proposeMapping,
  attributeColumns as unclaimedColumns,
  EMPLOYEE_FIELDS,
  type ColumnMapping,
  type EmployeeField,
} from './column-mapping'

/**
 * One problem with an imported file.
 *
 * `row` is the line number as the user sees it in their spreadsheet, counting
 * the header as row 1, so an error can be pointed at. Null means the problem is
 * with the file as a whole.
 */
export interface ImportIssue {
  row: number | null
  column: string | null
  message: string
}

export interface EmployeeImportResult {
  employees: Employee[]
  /** Rows that could not be imported. These employees are absent from the result. */
  errors: ImportIssue[]
  /** Rows that were imported but deserve a second look. */
  warnings: ImportIssue[]
  /** Headers that were not recognised and became grouping attributes. */
  attributeColumns: string[]
  /** The mapping actually used, whether proposed or supplied. */
  mapping: ColumnMapping
}

export interface EmployeeImportOptions {
  /** Grade ids from the loaded structure. A row referencing anything else errors. */
  knownGradeIds?: string[]
  /** Ratings from the loaded scale. A row referencing anything else errors. */
  knownRatings?: string[]
  /**
   * Which column serves which field.
   *
   * Absent, the headers are matched automatically. Supplied, it is obeyed
   * exactly: the user has looked at their own file and this module has not.
   */
  mapping?: ColumnMapping
}

/** Below this median salary the file is probably hourly or monthly, not annual. */
const IMPLAUSIBLE_ANNUAL_SALARY_MEDIAN = 1_000

/**
 * Import a population from pasted CSV or tab-separated text.
 *
 * A bad row costs that row, not the whole paste: valid rows import, invalid ones
 * are reported with their line number and left out. Somebody with one malformed
 * salary in two hundred rows should not have to start again.
 *
 * Unrecognised columns are preserved as grouping attributes, so a department or
 * location column in the source file becomes a dimension the budget can be
 * broken down by without any configuration.
 */
export function importEmployeesFromCsv(
  text: string,
  options: EmployeeImportOptions = {},
): EmployeeImportResult {
  const errors: ImportIssue[] = []
  const warnings: ImportIssue[] = []
  const employees: Employee[] = []

  const rows = parseDelimitedText(text)
  if (rows.length === 0) {
    return {
      employees,
      errors: [{ row: null, column: null, message: 'The pasted text is empty.' }],
      warnings,
      attributeColumns: [],
      mapping: proposeMapping([]),
    }
  }

  const headers = rows[0]
  const mapping = options.mapping ?? proposeMapping(headers)
  const attributes = unclaimedColumns(mapping, headers)

  const required = EMPLOYEE_FIELDS.filter((f) => f.required)
  const missing = required.filter((f) => mapping.columns[f.field] === null)
  if (missing.length > 0) {
    return {
      employees,
      errors: [
        {
          row: 1,
          column: null,
          message: `No column found for ${missing
            .map((f) => f.label.toLowerCase())
            .join(', ')}. Found: ${headers.join(', ')}.`,
        },
      ],
      warnings,
      attributeColumns: [],
      mapping,
    }
  }

  if (mapping.columns.eligible === null) {
    warnings.push({
      row: 1,
      column: null,
      message: 'No eligibility column found. Every employee is treated as eligible.',
    })
  }

  const seenIds = new Set<string>()

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i]
    const lineNumber = i + 1
    const cell = (field: EmployeeField): string => {
      const index = mapping.columns[field]
      return index === null ? '' : (cells[index] ?? '').trim()
    }

    const id = cell('id')
    if (id === '') {
      errors.push({ row: lineNumber, column: 'id', message: 'Employee id is blank.' })
      continue
    }
    if (seenIds.has(id)) {
      errors.push({
        row: lineNumber,
        column: 'id',
        message: `Duplicate employee id "${id}". The first occurrence was kept.`,
      })
      continue
    }

    const gradeId = cell('gradeId')
    if (gradeId === '') {
      errors.push({ row: lineNumber, column: 'grade', message: `Grade is blank for "${id}".` })
      continue
    }
    if (options.knownGradeIds && !options.knownGradeIds.includes(gradeId)) {
      errors.push({
        row: lineNumber,
        column: 'grade',
        message: `Grade "${gradeId}" is not in the loaded salary structure.`,
      })
      continue
    }

    const baseSalary = parseCurrency(cell('baseSalary'))
    if (baseSalary === null) {
      errors.push({
        row: lineNumber,
        column: 'base salary',
        message: `Base salary "${cell('baseSalary')}" is not a number.`,
      })
      continue
    }
    if (baseSalary <= 0) {
      errors.push({
        row: lineNumber,
        column: 'base salary',
        message: `Base salary must be greater than zero for "${id}".`,
      })
      continue
    }

    const performanceRating = cell('performanceRating')
    if (performanceRating === '') {
      errors.push({
        row: lineNumber,
        column: 'performance rating',
        message: `Performance rating is blank for "${id}".`,
      })
      continue
    }
    if (options.knownRatings && !options.knownRatings.includes(performanceRating)) {
      errors.push({
        row: lineNumber,
        column: 'performance rating',
        message: `Rating "${performanceRating}" is not in the rating scale.`,
      })
      continue
    }

    const fteResult = parseFte(cell('fte'))
    if (fteResult.error) {
      errors.push({ row: lineNumber, column: 'fte', message: fteResult.error })
      continue
    }
    if (fteResult.warning) {
      warnings.push({ row: lineNumber, column: 'fte', message: fteResult.warning })
    }

    const eligible =
      mapping.columns.eligible === null ? true : parseBoolean(cell('eligible'))
    if (eligible === null) {
      errors.push({
        row: lineNumber,
        column: 'eligible',
        message: `Cannot read "${cell('eligible')}" as yes or no.`,
      })
      continue
    }

    const rawHireDate = cell('hireDate')
    const hireDate = rawHireDate === '' ? undefined : normalizeDate(rawHireDate)
    if (rawHireDate !== '' && hireDate === undefined) {
      warnings.push({
        row: lineNumber,
        column: 'hire date',
        message: `Hire date "${rawHireDate}" is not a recognised date. Proration will treat this employee as employed all year.`,
      })
    }

    const rowAttributes: Record<string, string> = {}
    for (const { header, index } of attributes) {
      const value = (cells[index] ?? '').trim()
      if (value !== '') rowAttributes[header] = value
    }

    seenIds.add(id)
    employees.push({
      id,
      gradeId,
      baseSalary,
      performanceRating,
      fte: fteResult.value,
      eligible,
      hireDate,
      attributes: Object.keys(rowAttributes).length > 0 ? rowAttributes : undefined,
    })
  }

  const salaryWarning = checkSalaryScale(employees)
  if (salaryWarning) warnings.push(salaryWarning)

  return {
    employees,
    errors,
    warnings,
    attributeColumns: attributes.map((c) => c.header),
    mapping,
  }
}

/**
 * A whole-file sanity check. If the median salary is implausibly small the file
 * is probably hourly or monthly pay, and costing it as annual would understate
 * the budget by a factor of tens.
 */
function checkSalaryScale(employees: Employee[]): ImportIssue | null {
  if (employees.length === 0) return null
  const sorted = employees.map((e) => e.baseSalary).sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  if (median >= IMPLAUSIBLE_ANNUAL_SALARY_MEDIAN) return null

  return {
    row: null,
    column: 'base salary',
    message: `The median salary is ${median.toLocaleString()}, which looks like an hourly or monthly rate rather than an annual one. Merit Lab expects annualized base salary.`,
  }
}
