import { normalizeHeader } from './csv'
import {
  parseCurrency,
  parseFte,
  parseBoolean,
  normalizeDate,
  looksNumeric,
} from './parse-values'

/**
 * Deciding which column in a pasted file is which.
 *
 * Automatic header matching gets a clean export right and a real one wrong. An
 * HRIS extract does not have a column called "base salary"; it has
 * `Curr_Ann_Base_Amt` next to `Prev_Ann_Base_Amt`, and a column called `Level`
 * that means job family, not grade. Two things follow from that, and this
 * module exists to serve them both.
 *
 * First, the user must be able to correct a mapping without leaving the tool.
 * Renaming columns in a spreadsheet and pasting again is where a first session
 * ends.
 *
 * Second, a confident wrong answer is more expensive than an admitted
 * uncertainty. A file mapped silently to the wrong salary column still produces
 * a budget, a distribution and an advisor finding, all of them wrong and none of
 * them obviously so. So every match carries how it was arrived at, and every
 * mapped column is checked against the shape of the data underneath it.
 */

export type EmployeeField =
  | 'id'
  | 'gradeId'
  | 'baseSalary'
  | 'performanceRating'
  | 'fte'
  | 'eligible'
  | 'hireDate'

/**
 * How a column came to be assigned to a field.
 *
 * `exact` is the field's own canonical name. `strong` is a specific alias that
 * has one plausible meaning. `loose` is an alias that a reasonable file could
 * use for something else entirely — `pay` might be total compensation, `band`
 * might be a compa-ratio band. `chosen` means the user set it themselves, which
 * outranks anything this module inferred.
 */
export type MatchQuality = 'exact' | 'strong' | 'loose' | 'chosen' | 'none'

/** The shape of the values in a column, inferred from a sample. */
export type ColumnKind = 'number' | 'date' | 'category' | 'text' | 'empty'

export interface FieldDescriptor {
  field: EmployeeField
  label: string
  required: boolean
  /** What the tool does with this column. */
  purpose: string
  /** What happens if it is absent. Empty for required fields. */
  whenAbsent: string
  /** Value shapes that are plausible for this field. */
  expects: ColumnKind[]
}

/**
 * The fields the tool reads, in the order a practitioner thinks about them.
 *
 * Required means the population cannot be costed without it. Everything else
 * degrades to a stated default rather than failing, because a file missing a
 * hire date is still a perfectly good file for costing a matrix.
 */
export const EMPLOYEE_FIELDS: FieldDescriptor[] = [
  {
    field: 'id',
    label: 'Employee id',
    required: true,
    purpose: 'Identifies a person in the dot plot, the search box and the export.',
    whenAbsent: '',
    expects: ['text', 'number', 'category'],
  },
  {
    field: 'gradeId',
    label: 'Grade',
    required: true,
    purpose: 'Places the employee in a salary range, which produces the compa-ratio.',
    whenAbsent: '',
    expects: ['category', 'text', 'number'],
  },
  {
    field: 'baseSalary',
    label: 'Base salary',
    required: true,
    purpose: 'Annualized fixed pay. Drives eligible payroll and every cost figure.',
    whenAbsent: '',
    expects: ['number'],
  },
  {
    field: 'performanceRating',
    label: 'Performance rating',
    required: true,
    purpose: 'Selects the matrix row.',
    whenAbsent: '',
    expects: ['category', 'text', 'number'],
  },
  {
    field: 'fte',
    label: 'FTE',
    required: false,
    purpose: 'Grosses pay up to full time for range placement. Cost stays on actual pay.',
    whenAbsent: 'Everyone is treated as full time.',
    expects: ['number'],
  },
  {
    field: 'eligible',
    label: 'Merit eligible',
    required: false,
    purpose: 'Excludes an employee from the increase and from eligible payroll.',
    whenAbsent: 'Everyone is treated as eligible.',
    expects: ['category', 'text', 'number'],
  },
  {
    field: 'hireDate',
    label: 'Hire date',
    required: false,
    purpose: 'Prorates the increase for anyone employed less than the full period.',
    whenAbsent: 'Nobody is prorated; everyone is treated as employed all year.',
    expects: ['date'],
  },
]

/**
 * Accepted header spellings for each field.
 *
 * Compared after normalisation, so "Employee ID", "employee_id" and "EmployeeId"
 * all match the same entry. The aim is that a file exported from an HRIS imports
 * without anyone renaming a column by hand.
 */
export const FIELD_ALIASES: Record<EmployeeField, string[]> = {
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

/**
 * Aliases a reasonable file could use to mean something else.
 *
 * `level` and `band` are as likely to be a job architecture level or a
 * compa-ratio band as a pay grade. `pay` and `base` could be total cash. These
 * still match, because matching them is usually right and the alternative is a
 * file that will not import at all — but they are surfaced for confirmation
 * rather than accepted quietly.
 */
const LOOSE_ALIASES = new Set([
  'level', 'band', 'payband', 'salaryband',
  'pay', 'base', 'baserate',
  'performance', 'rating',
  'eligibility',
  'startdate',
])

/**
 * The most distinct values a column can hold and still be a category.
 *
 * A grade structure runs to maybe fifteen levels and a rating scale to five, so
 * twenty leaves room without admitting a column of job titles.
 */
const CATEGORY_CEILING = 20

export interface ColumnProfile {
  header: string
  index: number
  kind: ColumnKind
  distinctCount: number
  blankCount: number
  totalCount: number
  /** A few real values, for showing the user what they are choosing. */
  sample: string[]
}

export interface ColumnMapping {
  /** Column index for each field, or null when no column serves it. */
  columns: Record<EmployeeField, number | null>
  /** How each field's column was arrived at. */
  quality: Record<EmployeeField, MatchQuality>
}

export interface MappingConcern {
  field: EmployeeField
  /** `blocking` means nothing can be imported until it is resolved. */
  severity: 'blocking' | 'suspicious'
  message: string
}

/**
 * Match every header against the field aliases.
 *
 * A column is claimed by the first field that recognises it, and a field takes
 * only its first match, so a file carrying both `salary` and `annual_salary`
 * uses whichever appears first rather than silently preferring one. Anything
 * unclaimed becomes a grouping attribute, which is why a department column
 * needs no configuration at all.
 */
export function proposeMapping(headers: string[]): ColumnMapping {
  const columns = emptyColumns()
  const quality = emptyQuality()

  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header)
    if (normalized === '') return

    const field = (Object.keys(FIELD_ALIASES) as EmployeeField[]).find(
      (f) => FIELD_ALIASES[f].includes(normalized) && columns[f] === null,
    )
    if (!field) return

    columns[field] = index
    quality[field] = qualityOf(field, normalized)
  })

  return { columns, quality }
}

function qualityOf(field: EmployeeField, normalized: string): MatchQuality {
  if (LOOSE_ALIASES.has(normalized)) return 'loose'
  // The first alias is the field's canonical spelling.
  if (normalized === FIELD_ALIASES[field][0]) return 'exact'
  return 'strong'
}

/**
 * Point a field at a different column, or at none.
 *
 * Assigning a column that another field already holds takes it away from that
 * field, because one column cannot be two things and leaving both pointed at it
 * would produce a mapping the user did not intend and cannot see.
 */
export function setMappedColumn(
  mapping: ColumnMapping,
  field: EmployeeField,
  index: number | null,
): ColumnMapping {
  const columns = { ...mapping.columns }
  const quality = { ...mapping.quality }

  if (index !== null) {
    for (const other of Object.keys(columns) as EmployeeField[]) {
      if (other !== field && columns[other] === index) {
        columns[other] = null
        quality[other] = 'none'
      }
    }
  }

  columns[field] = index
  quality[field] = index === null ? 'none' : 'chosen'

  return { columns, quality }
}

/** Every column no field claims. These become grouping attributes. */
export function attributeColumns(
  mapping: ColumnMapping,
  headers: string[],
): { header: string; index: number }[] {
  const claimed = new Set(
    Object.values(mapping.columns).filter((i): i is number => i !== null),
  )
  return headers
    .map((header, index) => ({ header: header.trim(), index }))
    .filter((c) => !claimed.has(c.index) && c.header !== '')
}

/**
 * Infer what a column holds from its values.
 *
 * Deliberately generous thresholds. The purpose is not classification for its
 * own sake but catching a mapping that cannot be right: a base salary column of
 * four repeating words, an employee id column with duplicates, a hire date
 * column of integers.
 */
export function profileColumn(
  header: string,
  index: number,
  values: string[],
): ColumnProfile {
  const trimmed = values.map((v) => v.trim())
  const present = trimmed.filter((v) => v !== '')
  const distinct = new Set(present)

  const base = {
    header,
    index,
    distinctCount: distinct.size,
    blankCount: trimmed.length - present.length,
    totalCount: trimmed.length,
    sample: [...new Set(present)].slice(0, 3),
  }

  if (present.length === 0) return { ...base, kind: 'empty' }

  const dates = present.filter((v) => normalizeDate(v) !== undefined).length
  if (dates / present.length >= 0.9) return { ...base, kind: 'date' }

  const numbers = present.filter(looksNumeric).length
  if (numbers / present.length >= 0.9) return { ...base, kind: 'number' }

  // A category is a small set of values that repeat: grades, ratings, locations,
  // eligibility flags. Both conditions matter. The ceiling excludes a column of
  // two hundred distinct job titles, and requiring at least one repeat excludes
  // a short column where every value happens to differ.
  if (distinct.size <= CATEGORY_CEILING && distinct.size < present.length) {
    return { ...base, kind: 'category' }
  }

  return { ...base, kind: 'text' }
}

/** Profile every column in a parsed file. */
export function profileColumns(rows: string[][]): ColumnProfile[] {
  if (rows.length === 0) return []
  const headers = rows[0]
  const body = rows.slice(1)
  return headers.map((header, index) =>
    profileColumn(header.trim(), index, body.map((row) => row[index] ?? '')),
  )
}

/**
 * Everything wrong or questionable about a mapping, before a row is imported.
 *
 * Blocking concerns stop the import. Suspicious ones do not: the user may know
 * something the data does not show, and a tool that refuses a file because it
 * disapproves of a column is a tool nobody uses twice. They are stated once,
 * next to the control that fixes them.
 */
export function checkMapping(
  mapping: ColumnMapping,
  profiles: ColumnProfile[],
): MappingConcern[] {
  const concerns: MappingConcern[] = []

  for (const descriptor of EMPLOYEE_FIELDS) {
    const index = mapping.columns[descriptor.field]

    if (index === null) {
      if (descriptor.required) {
        concerns.push({
          field: descriptor.field,
          severity: 'blocking',
          message: `No column is mapped to ${descriptor.label.toLowerCase()}.`,
        })
      }
      continue
    }

    const profile = profiles[index]
    if (!profile) continue

    if (profile.kind === 'empty') {
      concerns.push({
        field: descriptor.field,
        severity: descriptor.required ? 'blocking' : 'suspicious',
        message: `"${profile.header}" is empty.`,
      })
      continue
    }

    if (!descriptor.expects.includes(profile.kind)) {
      concerns.push({
        field: descriptor.field,
        severity: 'suspicious',
        message: `"${profile.header}" looks like ${describeKind(profile)}, and ${descriptor.label.toLowerCase()} expects ${descriptor.expects.map(kindNoun).join(' or ')}.`,
      })
      continue
    }

    // Targeted checks that a shape alone does not catch.
    if (descriptor.field === 'id') {
      const repeated = profile.totalCount - profile.blankCount - profile.distinctCount
      if (repeated > 0) {
        concerns.push({
          field: 'id',
          severity: 'suspicious',
          message: `"${profile.header}" repeats ${repeated === 1 ? 'a value' : `${repeated} values`}. An employee id should be unique, so this may be a manager or department column.`,
        })
      }
    }

    if (descriptor.field === 'eligible' && profile.distinctCount > 2) {
      concerns.push({
        field: 'eligible',
        severity: 'suspicious',
        message: `"${profile.header}" holds ${profile.distinctCount} different values. Merit eligibility reads as yes or no.`,
      })
    }

    if (mapping.quality[descriptor.field] === 'loose') {
      concerns.push({
        field: descriptor.field,
        severity: 'suspicious',
        message: `"${profile.header}" was matched by name alone and could mean something else. Confirm it is ${descriptor.label.toLowerCase()}.`,
      })
    }
  }

  return concerns
}

function describeKind(profile: ColumnProfile): string {
  switch (profile.kind) {
    case 'number':
      return 'numbers'
    case 'date':
      return 'dates'
    case 'category':
      return `a category with ${profile.distinctCount} values`
    case 'empty':
      return 'nothing'
    default:
      return 'free text'
  }
}

function kindNoun(kind: ColumnKind): string {
  switch (kind) {
    case 'number':
      return 'numbers'
    case 'date':
      return 'dates'
    case 'category':
      return 'a small set of repeated values'
    case 'empty':
      return 'nothing'
    default:
      return 'text'
  }
}

export interface PreviewCell {
  raw: string
  /** What the tool will actually use, once read. */
  read: string
  ok: boolean
}

/**
 * What the first few rows become once read.
 *
 * Shows the interpretation, not just the value, because the interpretation is
 * where the surprises live: an FTE of 50 becomes 0.5, a salary of "(1,000)"
 * becomes negative, and a date of 03/04/2024 is read day-first. Every one of
 * those is defensible and none of them is guessable, so they are shown before
 * the import rather than explained after it.
 */
export function mappingPreview(
  rows: string[][],
  mapping: ColumnMapping,
  limit = 3,
): Record<EmployeeField, PreviewCell[]> {
  const body = rows.slice(1, 1 + limit)
  const preview = {} as Record<EmployeeField, PreviewCell[]>

  for (const descriptor of EMPLOYEE_FIELDS) {
    const index = mapping.columns[descriptor.field]
    preview[descriptor.field] =
      index === null
        ? []
        : body.map((row) => readCell(descriptor.field, (row[index] ?? '').trim()))
  }

  return preview
}

function readCell(field: EmployeeField, raw: string): PreviewCell {
  switch (field) {
    case 'baseSalary': {
      const value = parseCurrency(raw)
      return value === null
        ? { raw, read: 'not a number', ok: false }
        : { raw, read: value.toLocaleString('en-US'), ok: true }
    }
    case 'fte': {
      if (raw === '') return { raw, read: '1 (blank)', ok: true }
      const result = parseFte(raw)
      return result.error
        ? { raw, read: 'not a valid FTE', ok: false }
        : { raw, read: String(result.value), ok: true }
    }
    case 'eligible': {
      const value = parseBoolean(raw)
      return value === null
        ? { raw, read: 'not yes or no', ok: false }
        : { raw, read: value ? 'yes' : 'no', ok: true }
    }
    case 'hireDate': {
      if (raw === '') return { raw, read: 'none', ok: true }
      const value = normalizeDate(raw)
      return value === undefined
        ? { raw, read: 'not a date', ok: false }
        : { raw, read: value, ok: true }
    }
    default:
      return { raw, read: raw, ok: raw !== '' }
  }
}

function emptyColumns(): Record<EmployeeField, number | null> {
  return {
    id: null,
    gradeId: null,
    baseSalary: null,
    performanceRating: null,
    fte: null,
    eligible: null,
    hireDate: null,
  }
}

function emptyQuality(): Record<EmployeeField, MatchQuality> {
  return {
    id: 'none',
    gradeId: 'none',
    baseSalary: 'none',
    performanceRating: 'none',
    fte: 'none',
    eligible: 'none',
    hireDate: 'none',
  }
}
