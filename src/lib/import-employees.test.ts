import { describe, it, expect } from 'vitest'
import { importEmployeesFromCsv } from './import-employees'

const HEADER = 'employee_id,grade,base_salary,performance_rating,fte,eligible,hire_date'
const ROW_A = 'E1,G1,95000,Meets,1,Y,2020-03-15'
const ROW_B = 'E2,G1,88000,Exceeds,1,Y,2018-07-01'

const csv = (...lines: string[]) => [HEADER, ...lines].join('\n')

describe('importEmployeesFromCsv - a clean file', () => {
  const result = importEmployeesFromCsv(csv(ROW_A, ROW_B))

  it('imports every row', () => {
    expect(result.employees).toHaveLength(2)
    expect(result.errors).toHaveLength(0)
  })

  it('reads each field', () => {
    expect(result.employees[0]).toMatchObject({
      id: 'E1',
      gradeId: 'G1',
      baseSalary: 95_000,
      performanceRating: 'Meets',
      fte: 1,
      eligible: true,
      hireDate: '2020-03-15',
    })
  })
})

describe('importEmployeesFromCsv - header spellings', () => {
  it('accepts a Workday-style export', () => {
    const r = importEmployeesFromCsv(
      'Employee ID,Pay Grade,Annual Base Salary,Review Rating,FTE,Merit Eligible\nE1,G1,95000,Meets,1,Yes',
    )
    expect(r.errors).toHaveLength(0)
    expect(r.employees[0].baseSalary).toBe(95_000)
  })

  it('accepts headers that differ only in case and punctuation', () => {
    const r = importEmployeesFromCsv(
      'EmployeeId,GRADE,base-salary,Performance_Rating\nE1,G1,95000,Meets',
    )
    expect(r.errors).toHaveLength(0)
    expect(r.employees[0].id).toBe('E1')
  })

  it('reports which required column is missing', () => {
    const r = importEmployeesFromCsv('employee_id,grade\nE1,G1')
    expect(r.employees).toHaveLength(0)
    expect(r.errors[0].message).toContain('base salary')
    expect(r.errors[0].message).toContain('performance rating')
  })

  it('warns but proceeds when there is no eligibility column', () => {
    const r = importEmployeesFromCsv(
      'employee_id,grade,base_salary,performance_rating\nE1,G1,95000,Meets',
    )
    expect(r.errors).toHaveLength(0)
    expect(r.employees[0].eligible).toBe(true)
    expect(r.warnings[0].message).toContain('treated as eligible')
  })
})

describe('importEmployeesFromCsv - salary parsing', () => {
  const salary = (raw: string) =>
    importEmployeesFromCsv(
      `employee_id,grade,base_salary,performance_rating\nE1,G1,${raw},Meets`,
    )

  it('strips currency symbols and thousands separators', () => {
    expect(salary('"$95,000"').employees[0].baseSalary).toBe(95_000)
  })

  it('accepts a decimal', () => {
    expect(salary('95000.50').employees[0].baseSalary).toBe(95_000.5)
  })

  it('accepts spaces as separators', () => {
    expect(salary('"95 000"').employees[0].baseSalary).toBe(95_000)
  })

  it('rejects text that is not a number', () => {
    const r = salary('not a number')
    expect(r.employees).toHaveLength(0)
    expect(r.errors[0].message).toContain('is not a number')
    expect(r.errors[0].row).toBe(2)
  })

  it('rejects a zero or negative salary', () => {
    expect(salary('0').errors[0].message).toContain('greater than zero')
  })
})

describe('importEmployeesFromCsv - FTE parsing', () => {
  const fte = (raw: string) =>
    importEmployeesFromCsv(
      `employee_id,grade,base_salary,performance_rating,fte\nE1,G1,95000,Meets,${raw}`,
    )

  it('reads a decimal FTE', () => {
    expect(fte('0.5').employees[0].fte).toBe(0.5)
  })

  it('reads 50 as fifty percent, not fifty times full time', () => {
    const r = fte('50')
    expect(r.employees[0].fte).toBe(0.5)
    expect(r.warnings.some((w) => w.message.includes('0.5 FTE'))).toBe(true)
  })

  it('reads a percent sign', () => {
    expect(fte('80%').employees[0].fte).toBeCloseTo(0.8, 10)
  })

  it('defaults to full time when blank', () => {
    expect(fte('').employees[0].fte).toBe(1)
  })

  it('rejects an FTE above 100 percent', () => {
    expect(fte('150').errors[0].message).toContain('above 100%')
  })
})

describe('importEmployeesFromCsv - eligibility parsing', () => {
  const eligible = (raw: string) =>
    importEmployeesFromCsv(
      `employee_id,grade,base_salary,performance_rating,eligible\nE1,G1,95000,Meets,${raw}`,
    )

  it('accepts the affirmative spellings', () => {
    for (const value of ['Y', 'Yes', 'TRUE', 'true', '1']) {
      expect(eligible(value).employees[0].eligible).toBe(true)
    }
  })

  it('accepts the negative spellings', () => {
    for (const value of ['N', 'No', 'FALSE', 'false', '0']) {
      expect(eligible(value).employees[0].eligible).toBe(false)
    }
  })

  it('rejects something it cannot read either way', () => {
    expect(eligible('maybe').errors[0].message).toContain('yes or no')
  })
})

describe('importEmployeesFromCsv - date parsing', () => {
  const hired = (raw: string) =>
    importEmployeesFromCsv(
      `employee_id,grade,base_salary,performance_rating,hire_date\nE1,G1,95000,Meets,${raw}`,
    )

  it('accepts an ISO date', () => {
    expect(hired('2020-03-15').employees[0].hireDate).toBe('2020-03-15')
  })

  it('reads an unambiguous day-first date', () => {
    // 15 cannot be a month, so this is 15 March.
    expect(hired('15/03/2020').employees[0].hireDate).toBe('2020-03-15')
  })

  it('reads an unambiguous month-first date', () => {
    // 15 cannot be a month, so this is 15 March.
    expect(hired('03/15/2020').employees[0].hireDate).toBe('2020-03-15')
  })

  it('imports the row but warns when the date is unreadable', () => {
    const r = hired('last March')
    expect(r.employees).toHaveLength(1)
    expect(r.employees[0].hireDate).toBeUndefined()
    expect(r.warnings.some((w) => w.message.includes('not a recognised date'))).toBe(true)
  })
})

describe('importEmployeesFromCsv - validation against a loaded structure', () => {
  const options = { knownGradeIds: ['G1', 'G2'], knownRatings: ['Meets', 'Exceeds'] }

  it('rejects a grade that is not in the structure', () => {
    const r = importEmployeesFromCsv(csv('E1,G9,95000,Meets,1,Y,2020-01-01'), options)
    expect(r.employees).toHaveLength(0)
    expect(r.errors[0].message).toContain('not in the loaded salary structure')
  })

  it('rejects a rating that is not in the scale', () => {
    const r = importEmployeesFromCsv(csv('E1,G1,95000,Superb,1,Y,2020-01-01'), options)
    expect(r.errors[0].message).toContain('not in the rating scale')
  })

  it('accepts anything when no structure is supplied', () => {
    const r = importEmployeesFromCsv(csv('E1,G9,95000,Superb,1,Y,2020-01-01'))
    expect(r.employees).toHaveLength(1)
  })
})

describe('importEmployeesFromCsv - duplicate and blank ids', () => {
  it('keeps the first of a duplicated id and reports the second', () => {
    const r = importEmployeesFromCsv(csv(ROW_A, 'E1,G1,70000,Meets,1,Y,2019-01-01'))
    expect(r.employees).toHaveLength(1)
    expect(r.employees[0].baseSalary).toBe(95_000)
    expect(r.errors[0].message).toContain('Duplicate employee id')
    expect(r.errors[0].row).toBe(3)
  })

  it('rejects a blank id', () => {
    const r = importEmployeesFromCsv(csv(',G1,95000,Meets,1,Y,2020-01-01'))
    expect(r.errors[0].message).toContain('blank')
  })
})

describe('importEmployeesFromCsv - one bad row does not cost the file', () => {
  it('imports the good rows and reports only the bad one', () => {
    const r = importEmployeesFromCsv(
      csv(ROW_A, 'E3,G1,oops,Meets,1,Y,2020-01-01', ROW_B),
    )
    expect(r.employees.map((e) => e.id)).toEqual(['E1', 'E2'])
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0].row).toBe(3)
  })
})

describe('importEmployeesFromCsv - unrecognised columns', () => {
  const r = importEmployeesFromCsv(
    'employee_id,grade,base_salary,performance_rating,department,location\n' +
      'E1,G1,95000,Meets,Finance,Head Office',
  )

  it('keeps them as grouping attributes', () => {
    expect(r.employees[0].attributes).toEqual({
      department: 'Finance',
      location: 'Head Office',
    })
  })

  it('reports which columns became attributes', () => {
    expect(r.attributeColumns).toEqual(['department', 'location'])
  })
})

describe('importEmployeesFromCsv - pasted spreadsheet columns', () => {
  it('reads tab-separated text', () => {
    const r = importEmployeesFromCsv(
      'employee_id\tgrade\tbase_salary\tperformance_rating\nE1\tG1\t95000\tMeets',
    )
    expect(r.errors).toHaveLength(0)
    expect(r.employees[0].baseSalary).toBe(95_000)
  })

  it('handles a quoted field containing a comma', () => {
    const r = importEmployeesFromCsv(
      'employee_id,grade,base_salary,performance_rating,department\n' +
        'E1,G1,95000,Meets,"Finance, Group"',
    )
    expect(r.employees[0].attributes?.department).toBe('Finance, Group')
  })

  it('handles Windows line endings and a trailing newline', () => {
    const r = importEmployeesFromCsv(`${HEADER}\r\n${ROW_A}\r\n${ROW_B}\r\n`)
    expect(r.employees).toHaveLength(2)
  })
})

describe('importEmployeesFromCsv - whole-file sanity checks', () => {
  it('warns when the salaries look like hourly rates', () => {
    const r = importEmployeesFromCsv(
      csv(
        'E1,G1,42.50,Meets,1,Y,2020-01-01',
        'E2,G1,38.00,Meets,1,Y,2020-01-01',
        'E3,G1,51.25,Meets,1,Y,2020-01-01',
      ),
    )
    expect(r.employees).toHaveLength(3)
    expect(r.warnings.some((w) => w.message.includes('hourly or monthly'))).toBe(true)
  })

  it('does not warn on a normal annual file', () => {
    const r = importEmployeesFromCsv(csv(ROW_A, ROW_B))
    expect(r.warnings).toHaveLength(0)
  })

  it('reports an empty paste', () => {
    const r = importEmployeesFromCsv('')
    expect(r.errors[0].message).toContain('empty')
  })
})
