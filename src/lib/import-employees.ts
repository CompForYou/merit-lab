import type { Employee } from '../types/domain'
import { parseDelimitedText, normalizeHeader } from './csv'

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
}

export interface EmployeeImportOptions {
  /** Grade ids from the loaded structure. A row referencing anything else errors. */
  knownGradeIds?: string[]
  /** Ratings from the loaded scale. A row referencing anything else errors. */
  knownRatings?: string[]
}

/**
 * Accepted header spellings for each known field.
 *
 * Compared after normalisation, so "Employee ID", "employee_id" and "EmployeeId"
 * all match the same entry. The aim is that a file exported from an HRIS imports
 * without anyone renaming a column by hand.
 */
const FIELD_ALIASES: Record<string, string[]> = {
  id: [
    'id', 'employeeid', 'empid', 'employeenumber', 'employeeno',
    'workerid', 'personid', 'personnelnumber', 'associateid',
  ],
  gradeId: [
    'grade', 'gradeid', 'gradecode', 'paygrade', 'salarygrade',
    'level', 'joblevel', 'band', 'payband', 'salaryband',
  ],
  baseSalary: [
    'basesalary', 'salary', 'annualsalary', 'basepay', 'base',
    'annualbasesalary', 'currentsalary', 'annualrate', 'baserate', 'pay',
  ],
  performanceRating: [
    'performancerating', 'rating', 'performance', 'perfrating',
    'reviewrating', 'performancescore', 'appraisalrating', 'performanceresult',
  ],
  fte: ['fte', 'fulltimeequivalent', 'ftepercent', 'ftevalue', 'workingtime'],
  eligible: [
    'eligible', 'meriteligible', 'eligibility', 'iseligible',
    'eligibleformerit', 'meriteligibility',
  ],
  hireDate: [
    'hiredate', 'startdate', 'dateofhire', 'originalhiredate',
    'seniyoritydate', 'senioritydate', 'employmentstartdate', 'datehired',
  ],
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
    }
  }

  const headers = rows[0]
  const { fieldColumns, attributeColumns } = mapHeaders(headers)

  const required = ['id', 'gradeId', 'baseSalary', 'performanceRating'] as const
  const missing = required.filter((f) => fieldColumns[f] === undefined)
  if (missing.length > 0) {
    return {
      employees,
      errors: [
        {
          row: 1,
          column: null,
          message: `No column found for ${missing
            .map(describeField)
            .join(', ')}. Found: ${headers.join(', ')}.`,
        },
      ],
      warnings,
      attributeColumns: [],
    }
  }

  if (fieldColumns.eligible === undefined) {
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
    const cell = (field: string): string => {
      const index = fieldColumns[field]
      return index === undefined ? '' : (cells[index] ?? '').trim()
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
      fieldColumns.eligible === undefined ? true : parseBoolean(cell('eligible'))
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

    const attributes: Record<string, string> = {}
    for (const { header, index } of attributeColumns) {
      const value = (cells[index] ?? '').trim()
      if (value !== '') attributes[header] = value
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
      attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
    })
  }

  const salaryWarning = checkSalaryScale(employees)
  if (salaryWarning) warnings.push(salaryWarning)

  return {
    employees,
    errors,
    warnings,
    attributeColumns: attributeColumns.map((c) => c.header),
  }
}

function mapHeaders(headers: string[]) {
  const fieldColumns: Record<string, number> = {}
  const attributeColumns: { header: string; index: number }[] = []

  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header)
    if (normalized === '') return

    const field = Object.keys(FIELD_ALIASES).find(
      (f) => FIELD_ALIASES[f].includes(normalized) && fieldColumns[f] === undefined,
    )

    if (field) fieldColumns[field] = index
    else attributeColumns.push({ header: header.trim(), index })
  })

  return { fieldColumns, attributeColumns }
}

function describeField(field: string): string {
  const labels: Record<string, string> = {
    id: 'employee id',
    gradeId: 'grade',
    baseSalary: 'base salary',
    performanceRating: 'performance rating',
  }
  return labels[field] ?? field
}

/** "$95,000.50", "95 000", "(1,000)" as negative. Returns null if unreadable. */
function parseCurrency(raw: string): number | null {
  if (raw === '') return null
  const negative = /^\(.*\)$/.test(raw.trim())
  const cleaned = raw.replace(/[()$£€¥,\s]/g, '').replace(/[A-Za-z]/g, '')
  if (cleaned === '' || !/^-?\d*\.?\d+$/.test(cleaned)) return null
  const value = Number(cleaned)
  if (!Number.isFinite(value)) return null
  return negative ? -value : value
}

/**
 * FTE arrives as a decimal (0.5) or a percentage (50), depending on the system.
 * Anything above 1 is read as a percentage, which is the only interpretation
 * that makes sense: nobody works 50 times full time.
 */
function parseFte(raw: string): { value: number; error?: string; warning?: string } {
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

function parseBoolean(raw: string): boolean | null {
  const value = raw.trim().toLowerCase()
  if (value === '') return true
  if (['y', 'yes', 'true', 't', '1', 'eligible'].includes(value)) return true
  if (['n', 'no', 'false', 'f', '0', 'ineligible', 'not eligible'].includes(value)) {
    return false
  }
  return null
}

/** Accepts yyyy-mm-dd, dd/mm/yyyy and mm/dd/yyyy. Returns yyyy-mm-dd. */
function normalizeDate(raw: string): string | undefined {
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
