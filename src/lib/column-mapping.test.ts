import { describe, it, expect } from 'vitest'
import { parseDelimitedText } from './csv'
import {
  proposeMapping,
  setMappedColumn,
  attributeColumns,
  profileColumn,
  profileColumns,
  checkMapping,
  mappingPreview,
} from './column-mapping'

describe('proposeMapping - a clean file', () => {
  const mapping = proposeMapping([
    'employee_id',
    'grade',
    'base_salary',
    'performance_rating',
  ])

  it('finds every required field at its own column', () => {
    expect(mapping.columns.id).toBe(0)
    expect(mapping.columns.gradeId).toBe(1)
    expect(mapping.columns.baseSalary).toBe(2)
    expect(mapping.columns.performanceRating).toBe(3)
  })

  it('reports the optional fields as absent rather than guessing', () => {
    expect(mapping.columns.fte).toBeNull()
    expect(mapping.columns.eligible).toBeNull()
    expect(mapping.columns.hireDate).toBeNull()
  })

  it('marks canonical spellings as exact', () => {
    // "employee_id" normalises to "employeeid", which is not the canonical
    // "id", so it is a strong alias rather than an exact one. "grade" is the
    // canonical spelling of its field.
    expect(mapping.quality.gradeId).toBe('exact')
    expect(mapping.quality.id).toBe('strong')
  })
})

describe('proposeMapping - a real HRIS export', () => {
  // The columns an extract actually arrives with. Nothing here spells "base
  // salary", which is the case this whole module exists for.
  const headers = [
    'Worker ID',
    'Position_Grade_Cd',
    'Curr_Ann_Base_Amt',
    'Prev_Ann_Base_Amt',
    'Perf_Result',
    'Cost_Center',
  ]
  const mapping = proposeMapping(headers)

  it('finds the id from "Worker ID"', () => {
    expect(mapping.columns.id).toBe(0)
  })

  it('finds nothing for salary, rather than taking the wrong column', () => {
    // Both salary columns are unrecognisable, and guessing between current and
    // previous pay is exactly the mistake that produces a plausible wrong
    // budget.
    expect(mapping.columns.baseSalary).toBeNull()
  })

  it('leaves the unmatched columns as grouping attributes', () => {
    expect(attributeColumns(mapping, headers).map((c) => c.header)).toEqual([
      'Position_Grade_Cd',
      'Curr_Ann_Base_Amt',
      'Prev_Ann_Base_Amt',
      'Perf_Result',
      'Cost_Center',
    ])
  })
})

describe('proposeMapping - loose matches', () => {
  it('flags "Level" as a loose match for grade', () => {
    // A column called Level is as likely to be a job architecture level as a
    // pay grade. It still matches, because refusing it means the file will not
    // import at all, but it is surfaced for confirmation.
    const mapping = proposeMapping(['id', 'Level', 'salary', 'rating'])
    expect(mapping.columns.gradeId).toBe(1)
    expect(mapping.quality.gradeId).toBe('loose')
  })

  it('flags "Pay" as a loose match for base salary', () => {
    const mapping = proposeMapping(['id', 'grade', 'Pay', 'rating'])
    expect(mapping.columns.baseSalary).toBe(2)
    expect(mapping.quality.baseSalary).toBe('loose')
  })

  it('does not flag an unambiguous spelling', () => {
    const mapping = proposeMapping(['id', 'grade', 'annual_base_salary', 'rating'])
    expect(mapping.quality.baseSalary).toBe('strong')
  })
})

describe('proposeMapping - a field takes only its first match', () => {
  it('keeps the earlier of two salary columns', () => {
    const mapping = proposeMapping(['id', 'grade', 'salary', 'base_pay', 'rating'])
    expect(mapping.columns.baseSalary).toBe(2)
  })

  it('leaves the later one available as an attribute', () => {
    const headers = ['id', 'grade', 'salary', 'base_pay', 'rating']
    const mapping = proposeMapping(headers)
    expect(attributeColumns(mapping, headers).map((c) => c.header)).toEqual(['base_pay'])
  })
})

describe('setMappedColumn', () => {
  const headers = ['Worker ID', 'Position_Grade_Cd', 'Curr_Ann_Base_Amt', 'Perf_Result']
  const proposed = proposeMapping(headers)

  it('points a field at a column the user chose', () => {
    const fixed = setMappedColumn(proposed, 'baseSalary', 2)
    expect(fixed.columns.baseSalary).toBe(2)
    expect(fixed.quality.baseSalary).toBe('chosen')
  })

  it('takes the column away from whichever field already held it', () => {
    // "Worker ID" is proposed as the employee id. Assigning column 0 to grade
    // must leave id empty rather than pointing both fields at one column.
    const moved = setMappedColumn(proposed, 'gradeId', 0)
    expect(moved.columns.gradeId).toBe(0)
    expect(moved.columns.id).toBeNull()
    expect(moved.quality.id).toBe('none')
  })

  it('clears a field when set to nothing', () => {
    const cleared = setMappedColumn(proposed, 'id', null)
    expect(cleared.columns.id).toBeNull()
    expect(cleared.quality.id).toBe('none')
  })

  it('returns the columns it did not touch unchanged', () => {
    const fixed = setMappedColumn(proposed, 'baseSalary', 2)
    expect(fixed.columns.id).toBe(proposed.columns.id)
  })
})

describe('profileColumn', () => {
  it('reads money as numbers, currency symbols and all', () => {
    const p = profileColumn('salary', 0, ['$95,000', '88000', '$102,500.50'])
    expect(p.kind).toBe('number')
  })

  it('reads dates as dates', () => {
    const p = profileColumn('hired', 0, ['2020-03-15', '15/07/2018', '2021-01-02'])
    expect(p.kind).toBe('date')
  })

  it('reads a handful of repeated words as a category', () => {
    // Six values, four of them distinct. Four is under the ceiling of twenty and
    // fewer than the six values present, so something repeats and this is a
    // category rather than free text.
    const values = ['Meets', 'Exceeds', 'Meets', 'Below', 'Meets', 'Outstanding']
    const p = profileColumn('rating', 0, values)
    expect(p.kind).toBe('category')
    expect(p.distinctCount).toBe(4)
  })

  it('reads mostly-unique words as free text', () => {
    const names = Array.from({ length: 40 }, (_, i) => `Person Number ${i}`)
    expect(profileColumn('name', 0, names).kind).toBe('text')
  })

  it('reads an all-blank column as empty', () => {
    expect(profileColumn('spare', 0, ['', '  ', '']).kind).toBe('empty')
  })

  it('counts blanks and distinct values separately', () => {
    const p = profileColumn('dept', 0, ['Sales', 'Sales', '', 'Ops'])
    expect(p.totalCount).toBe(4)
    expect(p.blankCount).toBe(1)
    expect(p.distinctCount).toBe(2)
  })

  it('tolerates a column that is numeric apart from one bad cell', () => {
    // Nine numbers and one "n/a" is 90%, which is the threshold exactly.
    const values = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'n/a']
    expect(profileColumn('salary', 0, values).kind).toBe('number')
  })
})

describe('checkMapping', () => {
  const parse = (text: string) => {
    const rows = parseDelimitedText(text)
    return { rows, profiles: profileColumns(rows) }
  }

  it('blocks on every required field with no column, and only those', () => {
    // The id is found from "worker_id", so it must not appear. The other three
    // required fields have nothing to match and all three must be named: a user
    // told about one missing column at a time gives up on the second round.
    const { rows, profiles } = parse('worker_id,dept\nE1,Sales')
    const concerns = checkMapping(proposeMapping(rows[0]), profiles)
    const blocking = concerns.filter((c) => c.severity === 'blocking')
    expect(blocking.map((c) => c.field).sort()).toEqual([
      'baseSalary',
      'gradeId',
      'performanceRating',
    ])
  })

  it('is suspicious of a salary column full of words', () => {
    // The user has pointed base salary at the department column. Every row will
    // fail to parse, but the mapping check says so before a single one does.
    const text = [
      'id,grade,department,rating',
      'E1,G1,Sales,Meets',
      'E2,G1,Sales,Exceeds',
      'E3,G2,Operations,Meets',
    ].join('\n')
    const { rows, profiles } = parse(text)
    const mapping = setMappedColumn(proposeMapping(rows[0]), 'baseSalary', 2)
    const concern = checkMapping(mapping, profiles).find(
      (c) => c.field === 'baseSalary',
    )
    expect(concern?.severity).toBe('suspicious')
    expect(concern?.message).toContain('"department"')
  })

  it('is suspicious of an employee id that repeats', () => {
    // Column 0 holds M1, M1, M2 — a manager column, not an employee id.
    const text = [
      'manager,grade,salary,rating',
      'M1,G1,95000,Meets',
      'M1,G1,88000,Exceeds',
      'M2,G2,120000,Meets',
    ].join('\n')
    const { rows, profiles } = parse(text)
    const mapping = setMappedColumn(proposeMapping(rows[0]), 'id', 0)
    const concern = checkMapping(mapping, profiles).find((c) => c.field === 'id')
    expect(concern?.message).toContain('repeats')
  })

  it('is suspicious of an eligibility column with more than two values', () => {
    const text = [
      'id,grade,salary,rating,status',
      'E1,G1,95000,Meets,Active',
      'E2,G1,88000,Exceeds,Leave',
      'E3,G2,120000,Meets,Notice',
    ].join('\n')
    const { rows, profiles } = parse(text)
    const mapping = setMappedColumn(proposeMapping(rows[0]), 'eligible', 4)
    const concern = checkMapping(mapping, profiles).find((c) => c.field === 'eligible')
    expect(concern?.message).toContain('3 different values')
  })

  it('asks for confirmation of a loose match', () => {
    const text = ['id,Level,salary,rating', 'E1,G1,95000,Meets'].join('\n')
    const { rows, profiles } = parse(text)
    const concern = checkMapping(proposeMapping(rows[0]), profiles).find(
      (c) => c.field === 'gradeId',
    )
    expect(concern?.severity).toBe('suspicious')
    expect(concern?.message).toContain('Confirm')
  })

  it('raises nothing on a clean file', () => {
    const text = [
      'employee_id,grade,base_salary,performance_rating,fte,eligible,hire_date',
      'E1,G1,95000,Meets,1,Y,2020-03-15',
      'E2,G1,88000,Exceeds,1,Y,2018-07-01',
      'E3,G2,120000,Meets,1,N,2019-11-30',
    ].join('\n')
    const { rows, profiles } = parse(text)
    expect(checkMapping(proposeMapping(rows[0]), profiles)).toEqual([])
  })
})

describe('mappingPreview', () => {
  const text = [
    'employee_id,grade,base_salary,performance_rating,fte,eligible,hire_date',
    'E1,G1,"$95,000",Meets,50,Y,03/04/2024',
    'E2,G1,88000,Exceeds,1,N,2018-07-01',
  ].join('\n')
  const rows = parseDelimitedText(text)
  const preview = mappingPreview(rows, proposeMapping(rows[0]))

  it('shows what a formatted salary becomes', () => {
    // "$95,000" reads as 95000 and displays with a thousands separator.
    expect(preview.baseSalary[0]).toMatchObject({ raw: '$95,000', read: '95,000', ok: true })
  })

  it('shows an FTE of 50 read as half time', () => {
    // Anything above 1 is a percentage: 50 means 50%, which is 0.5 FTE. This is
    // the single most surprising interpretation in the importer, so it is shown
    // before the import rather than explained afterwards.
    expect(preview.fte[0].read).toBe('0.5')
  })

  it('shows the day-first reading of an ambiguous date', () => {
    // 03/04/2024 could be 3 April or 4 March. Both parts are valid months, so
    // day-first wins, and the preview says which was chosen.
    expect(preview.hireDate[0].read).toBe('2024-04-03')
  })

  it('shows eligibility as yes or no', () => {
    expect(preview.eligible[0].read).toBe('yes')
    expect(preview.eligible[1].read).toBe('no')
  })

  it('marks a cell the importer will reject', () => {
    const bad = parseDelimitedText(
      'employee_id,grade,base_salary,performance_rating\nE1,G1,not money,Meets',
    )
    const p = mappingPreview(bad, proposeMapping(bad[0]))
    expect(p.baseSalary[0]).toMatchObject({ read: 'not a number', ok: false })
  })

  it('returns nothing for a field with no column', () => {
    const bare = parseDelimitedText(
      'employee_id,grade,base_salary,performance_rating\nE1,G1,95000,Meets',
    )
    expect(mappingPreview(bare, proposeMapping(bare[0])).fte).toEqual([])
  })
})
