import { describe, it, expect } from 'vitest'
import { resultsToCsv } from './export-csv'
import { runScenario } from './run-scenario'
import { SAMPLE_POPULATION } from '../data/sample-population'
import { SAMPLE_GRADES } from '../data/sample-structure'
import { DEFAULT_MERIT_MATRIX, DEFAULT_SETTINGS } from '../data/default-matrix'
import type { Employee, Grade } from '../types/domain'

const GRADE: Grade = {
  id: 'G1',
  name: 'Analyst',
  order: 1,
  min: 70_000,
  mid: 90_000,
  max: 100_000,
}

const csvFor = (employees: Employee[], grades: Grade[] = [GRADE]) => {
  const scenario = runScenario(employees, grades, DEFAULT_MERIT_MATRIX, DEFAULT_SETTINGS)
  return resultsToCsv(scenario.results, employees, grades)
}

const lines = (csv: string) => csv.split('\r\n')
const cells = (line: string) => line.split(',')

describe('resultsToCsv - shape', () => {
  const employees: Employee[] = [
    { id: 'E1', gradeId: 'G1', baseSalary: 81_000, performanceRating: 'Meets', fte: 1, eligible: true },
    { id: 'E2', gradeId: 'G1', baseSalary: 95_000, performanceRating: 'Exceeds', fte: 1, eligible: true },
  ]
  const csv = csvFor(employees)

  it('writes a header and one row per employee', () => {
    expect(lines(csv)).toHaveLength(3)
  })

  it('leads with the employee id and grade', () => {
    expect(cells(lines(csv)[0]).slice(0, 2)).toEqual(['employee_id', 'grade'])
    expect(cells(lines(csv)[1]).slice(0, 2)).toEqual(['E1', 'G1'])
  })

  it('includes every intermediate value, not just the answer', () => {
    // A practitioner handed only a new salary cannot check the working.
    const header = cells(lines(csv)[0])
    for (const column of [
      'compa_ratio',
      'compa_ratio_band',
      'matrix_percent',
      'proration_factor',
      'uncapped_increase',
      'withheld_at_maximum',
      'new_compa_ratio',
    ]) {
      expect(header).toContain(column)
    }
  })
})

describe('resultsToCsv - the numbers', () => {
  it('writes the figures the calculation produced', () => {
    // 81,000 at compa-ratio 0.90 -> 0.90-1.00 band -> Meets 3% -> 2,430
    const csv = csvFor([
      { id: 'E1', gradeId: 'G1', baseSalary: 81_000, performanceRating: 'Meets', fte: 1, eligible: true },
    ])
    const row = cells(lines(csv)[1])
    const header = cells(lines(csv)[0])
    const get = (name: string) => row[header.indexOf(name)]

    expect(get('base_salary')).toBe('81000')
    expect(Number(get('compa_ratio'))).toBeCloseTo(0.9, 10)
    expect(get('compa_ratio_band')).toBe('band-090-100')
    expect(Number(get('matrix_percent'))).toBe(0.03)
    expect(Number(get('increase_amount'))).toBeCloseTo(2_430, 6)
    expect(Number(get('new_salary'))).toBeCloseTo(83_430, 6)
  })

  it('writes full-time equivalent salary alongside actual pay', () => {
    const csv = csvFor([
      { id: 'P1', gradeId: 'G1', baseSalary: 45_000, performanceRating: 'Meets', fte: 0.5, eligible: true },
    ])
    const header = cells(lines(csv)[0])
    const row = cells(lines(csv)[1])
    expect(row[header.indexOf('base_salary')]).toBe('45000')
    expect(row[header.indexOf('full_time_equivalent_salary')]).toBe('90000')
  })

  it('does not round', () => {
    // 81,111 x 3% = 2,433.33
    const csv = csvFor([
      { id: 'E1', gradeId: 'G1', baseSalary: 81_111, performanceRating: 'Meets', fte: 1, eligible: true },
    ])
    const header = cells(lines(csv)[0])
    const row = cells(lines(csv)[1])
    expect(Number(row[header.indexOf('increase_amount')])).toBeCloseTo(2_433.33, 8)
  })

  it('leaves a null compa-ratio blank rather than writing zero', () => {
    const noMid: Grade = { ...GRADE, mid: 0 }
    const csv = csvFor(
      [{ id: 'E1', gradeId: 'G1', baseSalary: 81_000, performanceRating: 'Meets', fte: 1, eligible: true }],
      [noMid],
    )
    const header = cells(lines(csv)[0])
    const row = cells(lines(csv)[1])
    expect(row[header.indexOf('compa_ratio')]).toBe('')
    expect(row[header.indexOf('not_costed_reason')]).toBe('compa-ratio-undefined')
  })
})

describe('resultsToCsv - grouping attributes ride back out', () => {
  const csv = csvFor([
    {
      id: 'E1', gradeId: 'G1', baseSalary: 81_000, performanceRating: 'Meets',
      fte: 1, eligible: true, attributes: { department: 'Finance', location: 'Remote' },
    },
    {
      id: 'E2', gradeId: 'G1', baseSalary: 82_000, performanceRating: 'Meets',
      fte: 1, eligible: true, attributes: { department: 'Operations' },
    },
  ])

  it('adds a column per attribute, sorted', () => {
    const header = cells(lines(csv)[0])
    expect(header.slice(-2)).toEqual(['department', 'location'])
  })

  it('leaves a blank where an employee has no value', () => {
    const row = cells(lines(csv)[2])
    expect(row.slice(-2)).toEqual(['Operations', ''])
  })
})

describe('resultsToCsv - escaping', () => {
  it('quotes a value containing a comma', () => {
    const csv = csvFor([
      {
        id: 'E1', gradeId: 'G1', baseSalary: 81_000, performanceRating: 'Meets',
        fte: 1, eligible: true, attributes: { department: 'Finance, Group' },
      },
    ])
    expect(csv).toContain('"Finance, Group"')
  })

  it('doubles a quote inside a value', () => {
    const csv = csvFor([
      {
        id: 'E1', gradeId: 'G1', baseSalary: 81_000, performanceRating: 'Meets',
        fte: 1, eligible: true, attributes: { department: 'The "Group"' },
      },
    ])
    expect(csv).toContain('"The ""Group"""')
  })

  it('neutralises a value a spreadsheet would run as a formula', () => {
    // An id or department beginning =, +, - or @ is a formula to Excel. Left
    // alone it would execute on open rather than display.
    const csv = csvFor([
      {
        id: '=cmd|calc', gradeId: 'G1', baseSalary: 81_000, performanceRating: 'Meets',
        fte: 1, eligible: true, attributes: { department: '@SUM(A1:A9)' },
      },
    ])
    expect(csv).toContain("'=cmd|calc")
    expect(csv).toContain("'@SUM(A1:A9)")
  })

  it('does not mangle an ordinary negative number', () => {
    const csv = csvFor([
      { id: 'E1', gradeId: 'G1', baseSalary: 81_000, performanceRating: 'Meets', fte: 1, eligible: true },
    ])
    expect(csv).not.toContain("'-")
  })
})

describe('resultsToCsv - the sample population', () => {
  const scenario = runScenario(
    SAMPLE_POPULATION, SAMPLE_GRADES, DEFAULT_MERIT_MATRIX, DEFAULT_SETTINGS,
  )
  const csv = resultsToCsv(scenario.results, SAMPLE_POPULATION, SAMPLE_GRADES)

  it('writes every employee', () => {
    expect(lines(csv)).toHaveLength(205)
  })

  it('reconciles its increase column to the budget total', () => {
    const header = cells(lines(csv)[0])
    const increaseAt = header.indexOf('increase_amount')
    const lumpAt = header.indexOf('lump_sum_amount')
    const total = lines(csv)
      .slice(1)
      .reduce((sum, line) => {
        const row = cells(line)
        return sum + Number(row[increaseAt]) + Number(row[lumpAt])
      }, 0)
    expect(total).toBeCloseTo(scenario.budget.totalSpend, 6)
  })
})

describe('resultsToCsv - what produced these results', () => {
  const employees: Employee[] = [
    { id: 'E1', gradeId: 'G1', baseSalary: 81_000, performanceRating: 'Meets', fte: 1, eligible: true },
    { id: 'E2', gradeId: 'G1', baseSalary: 95_000, performanceRating: 'Exceeds', fte: 1, eligible: true },
  ]
  const scenario = runScenario(employees, [GRADE], DEFAULT_MERIT_MATRIX, DEFAULT_SETTINGS)

  const withContext = resultsToCsv(scenario.results, employees, [GRADE], {
    planName: 'FY26 Plan A',
    settings: { ...DEFAULT_SETTINGS, roundingIncrement: 500, currency: 'GBP' },
    exportedAt: new Date('2026-03-15T09:30:00.000Z'),
  })

  it('records the settings that produced the file', () => {
    // A results file that cannot say what made it cannot be reproduced, and a
    // number nobody can reproduce cannot be audited.
    const header = cells(lines(withContext)[0])
    expect(header).toContain('plan_name')
    expect(header).toContain('target_budget_percent')
    expect(header).toContain('over_max_mode')
    expect(header).toContain('rounding_increment')
    expect(header).toContain('exported_at')
  })

  it('repeats them on every row, keeping the file a plain rectangle', () => {
    // A header block above the data would break every naive parser. Constant
    // columns are how an audit export normally looks.
    const rows = lines(withContext)
    const width = cells(rows[0]).length
    for (const row of rows) expect(cells(row)).toHaveLength(width)

    const planAt = cells(rows[0]).indexOf('plan_name')
    expect(cells(rows[1])[planAt]).toBe('FY26 Plan A')
    expect(cells(rows[2])[planAt]).toBe('FY26 Plan A')
  })

  it('records the settings that change the arithmetic', () => {
    const header = cells(lines(withContext)[0])
    const row = cells(lines(withContext)[1])
    expect(row[header.indexOf('over_max_mode')]).toBe(DEFAULT_SETTINGS.overMaxMode)
    expect(row[header.indexOf('rounding_increment')]).toBe('500')
    expect(row[header.indexOf('currency')]).toBe('GBP')
    expect(row[header.indexOf('exported_at')]).toBe('2026-03-15T09:30:00.000Z')
  })

  it('reconstructs the matrix from the per-row columns', () => {
    // No separate matrix section is needed: rating, band and matrix_percent on
    // each row rebuild every cell that costed anybody.
    const header = cells(lines(withContext)[0])
    const ratingAt = header.indexOf('performance_rating')
    const bandAt = header.indexOf('compa_ratio_band')
    const percentAt = header.indexOf('matrix_percent')

    for (const line of lines(withContext).slice(1)) {
      const row = cells(line)
      const expected = DEFAULT_MERIT_MATRIX.cells[row[ratingAt]]?.[row[bandAt]]
      expect(Number(row[percentAt])).toBe(expected)
    }
  })

  it('leaves the file unchanged when no context is given', () => {
    // The argument is optional, so every existing caller keeps its old output.
    const bare = resultsToCsv(scenario.results, employees, [GRADE])
    expect(cells(lines(bare)[0])).not.toContain('plan_name')
  })
})
