import type { Grade } from '../types/domain'
import { parseDelimitedText, normalizeHeader } from './csv'
import type { ImportIssue } from './import-employees'

export interface GradeImportResult {
  grades: Grade[]
  errors: ImportIssue[]
  warnings: ImportIssue[]
}

const FIELD_ALIASES: Record<string, string[]> = {
  id: ['grade', 'gradeid', 'gradecode', 'code', 'id', 'paygrade', 'salarygrade', 'band', 'level'],
  name: ['name', 'gradename', 'label', 'title', 'description', 'jobfamily'],
  order: ['order', 'gradeorder', 'sequence', 'rank', 'levelnumber', 'sortorder'],
  min: ['min', 'minimum', 'rangeminimum', 'rangemin', 'salaryminimum', 'low'],
  mid: ['mid', 'midpoint', 'rangemidpoint', 'target', 'salarymidpoint', 'middle'],
  max: ['max', 'maximum', 'rangemaximum', 'rangemax', 'salarymaximum', 'high'],
}

/**
 * Import a salary structure from pasted CSV or tab-separated text.
 *
 * Only the grade identifier and two of the three range points are required. A
 * missing midpoint is derived as the arithmetic middle of the range, which is
 * how most published structures are built anyway; the derivation is reported so
 * nobody is surprised by a midpoint they did not supply.
 *
 * A missing order column is derived from ascending midpoint, and that is stated
 * on screen. Inference is acceptable as a fallback but never silently: midpoint
 * order is wrong for structures with parallel job families, and the user is the
 * only one who can tell.
 */
export function importGradesFromCsv(text: string): GradeImportResult {
  const errors: ImportIssue[] = []
  const warnings: ImportIssue[] = []
  const grades: Grade[] = []

  const rows = parseDelimitedText(text)
  if (rows.length === 0) {
    return {
      grades,
      errors: [{ row: null, column: null, message: 'The pasted text is empty.' }],
      warnings,
    }
  }

  const headers = rows[0]
  const columns: Record<string, number> = {}
  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header)
    const field = Object.keys(FIELD_ALIASES).find(
      (f) => FIELD_ALIASES[f].includes(normalized) && columns[f] === undefined,
    )
    if (field) columns[field] = index
  })

  const missing = (['id', 'min', 'max'] as const).filter((f) => columns[f] === undefined)
  if (missing.length > 0) {
    return {
      grades,
      errors: [
        {
          row: 1,
          column: null,
          message: `No column found for ${missing.join(', ')}. Found: ${headers.join(', ')}.`,
        },
      ],
      warnings,
    }
  }

  const hasOrderColumn = columns.order !== undefined
  const seenIds = new Set<string>()

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i]
    const lineNumber = i + 1
    const cell = (field: string): string => {
      const index = columns[field]
      return index === undefined ? '' : (cells[index] ?? '').trim()
    }

    const id = cell('id')
    if (id === '') {
      errors.push({ row: lineNumber, column: 'grade', message: 'Grade code is blank.' })
      continue
    }
    if (seenIds.has(id)) {
      errors.push({
        row: lineNumber,
        column: 'grade',
        message: `Duplicate grade "${id}". The first occurrence was kept.`,
      })
      continue
    }

    const min = parseNumber(cell('min'))
    const max = parseNumber(cell('max'))
    if (min === null || max === null) {
      errors.push({
        row: lineNumber,
        column: min === null ? 'minimum' : 'maximum',
        message: `Grade "${id}" has a range bound that is not a number.`,
      })
      continue
    }
    if (min <= 0) {
      errors.push({
        row: lineNumber,
        column: 'minimum',
        message: `Grade "${id}" has a minimum of ${min}. It must be greater than zero.`,
      })
      continue
    }
    if (max <= min) {
      errors.push({
        row: lineNumber,
        column: 'maximum',
        message: `Grade "${id}" has a maximum at or below its minimum.`,
      })
      continue
    }

    const rawMid = cell('mid')
    let mid = parseNumber(rawMid)
    if (mid === null) {
      mid = (min + max) / 2
      if (rawMid !== '') {
        errors.push({
          row: lineNumber,
          column: 'midpoint',
          message: `Grade "${id}" has a midpoint that is not a number.`,
        })
        continue
      }
      warnings.push({
        row: lineNumber,
        column: 'midpoint',
        message: `Grade "${id}" has no midpoint. Using the middle of the range, ${mid.toLocaleString()}.`,
      })
    } else if (mid < min || mid > max) {
      warnings.push({
        row: lineNumber,
        column: 'midpoint',
        message: `Grade "${id}" has a midpoint outside its own range. Compa-ratios for this grade will look wrong.`,
      })
    }

    const order = hasOrderColumn ? parseNumber(cell('order')) : null
    if (hasOrderColumn && order === null) {
      errors.push({
        row: lineNumber,
        column: 'order',
        message: `Grade "${id}" has an order that is not a number.`,
      })
      continue
    }

    seenIds.add(id)
    grades.push({
      id,
      name: cell('name') || id,
      order: order ?? 0,
      min,
      mid,
      max,
    })
  }

  if (!hasOrderColumn && grades.length > 1) {
    // Fallback, stated rather than silent. Midpoint order is wrong for parallel
    // job families, and only the user can tell whether that applies here.
    const byMidpoint = [...grades].sort((a, b) => a.mid - b.mid)
    byMidpoint.forEach((g, index) => {
      g.order = index + 1
    })
    warnings.push({
      row: null,
      column: 'order',
      message:
        'No grade order column found. Grades were ordered by ascending midpoint. Check this if your structure has parallel job families whose midpoints overlap.',
    })
  }

  const duplicateOrders = findDuplicateOrders(grades)
  if (hasOrderColumn && duplicateOrders.length > 0) {
    warnings.push({
      row: null,
      column: 'order',
      message: `More than one grade shares order ${duplicateOrders.join(', ')}. Midpoint progression and compression will pair grades unpredictably.`,
    })
  }

  return { grades: grades.sort((a, b) => a.order - b.order), errors, warnings }
}

function parseNumber(raw: string): number | null {
  if (raw === '') return null
  const cleaned = raw.replace(/[$£€¥,\s]/g, '')
  if (cleaned === '' || !/^-?\d*\.?\d+$/.test(cleaned)) return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}

function findDuplicateOrders(grades: Grade[]): number[] {
  const seen = new Set<number>()
  const duplicates = new Set<number>()
  for (const g of grades) {
    if (seen.has(g.order)) duplicates.add(g.order)
    seen.add(g.order)
  }
  return [...duplicates].sort((a, b) => a - b)
}
