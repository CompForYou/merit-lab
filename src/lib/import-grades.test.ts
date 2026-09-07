import { describe, it, expect } from 'vitest'
import { importGradesFromCsv } from './import-grades'

describe('importGradesFromCsv - a clean structure', () => {
  const r = importGradesFromCsv(
    'grade,name,order,min,mid,max\n' +
      'G1,Analyst,1,51000,60000,69000\n' +
      'G2,Senior Analyst,2,56500,67000,77500',
  )

  it('imports every grade', () => {
    expect(r.grades).toHaveLength(2)
    expect(r.errors).toHaveLength(0)
    expect(r.warnings).toHaveLength(0)
  })

  it('reads each field', () => {
    expect(r.grades[0]).toEqual({
      id: 'G1',
      name: 'Analyst',
      order: 1,
      min: 51_000,
      mid: 60_000,
      max: 69_000,
    })
  })

  it('strips currency formatting from the range points', () => {
    const formatted = importGradesFromCsv(
      'grade,min,mid,max\nG1,"$51,000","$60,000","$69,000"',
    )
    expect(formatted.grades[0].min).toBe(51_000)
    expect(formatted.grades[0].max).toBe(69_000)
  })
})

describe('importGradesFromCsv - header spellings', () => {
  it('accepts alternative names for the range points', () => {
    const r = importGradesFromCsv(
      'Pay Grade,Range Minimum,Range Midpoint,Range Maximum\nG1,51000,60000,69000',
    )
    expect(r.errors).toHaveLength(0)
    expect(r.grades[0].mid).toBe(60_000)
  })

  it('reports which required column is missing', () => {
    const r = importGradesFromCsv('grade,mid\nG1,60000')
    expect(r.grades).toHaveLength(0)
    expect(r.errors[0].message).toContain('min')
    expect(r.errors[0].message).toContain('max')
  })

  it('falls back to the grade code when there is no name', () => {
    const r = importGradesFromCsv('grade,min,max\nG1,51000,69000')
    expect(r.grades[0].name).toBe('G1')
  })
})

describe('importGradesFromCsv - a missing midpoint', () => {
  it('derives the midpoint as the middle of the range and says so', () => {
    // (51,000 + 69,000) / 2 = 60,000
    const r = importGradesFromCsv('grade,min,max\nG1,51000,69000')
    expect(r.grades[0].mid).toBe(60_000)
    expect(r.warnings.some((w) => w.message.includes('middle of the range'))).toBe(true)
  })

  it('rejects a midpoint that is present but unreadable', () => {
    const r = importGradesFromCsv('grade,min,mid,max\nG1,51000,about sixty,69000')
    expect(r.grades).toHaveLength(0)
    expect(r.errors[0].message).toContain('midpoint that is not a number')
  })

  it('warns when a supplied midpoint sits outside its own range', () => {
    const r = importGradesFromCsv('grade,min,mid,max\nG1,51000,80000,69000')
    expect(r.grades).toHaveLength(1)
    expect(r.warnings.some((w) => w.message.includes('outside its own range'))).toBe(true)
  })
})

describe('importGradesFromCsv - the order fallback', () => {
  it('derives order from ascending midpoint when there is no order column', () => {
    const r = importGradesFromCsv(
      'grade,min,mid,max\n' +
        'G3,63000,76000,89000\n' +
        'G1,51000,60000,69000\n' +
        'G2,56500,67000,77500',
    )
    expect(r.grades.map((g) => g.id)).toEqual(['G1', 'G2', 'G3'])
    expect(r.grades.map((g) => g.order)).toEqual([1, 2, 3])
  })

  it('states plainly that it inferred the order', () => {
    // Never silent. Midpoint order is wrong for parallel job families and only
    // the user can tell whether that applies to their structure.
    const r = importGradesFromCsv('grade,min,mid,max\nG1,51000,60000,69000\nG2,56500,67000,77500')
    const warning = r.warnings.find((w) => w.column === 'order')
    expect(warning?.message).toContain('ordered by ascending midpoint')
    expect(warning?.message).toContain('parallel job families')
  })

  it('does not infer when the order column is present', () => {
    // Declared order wins even where it disagrees with midpoint sequence.
    const r = importGradesFromCsv(
      'grade,order,min,mid,max\nLower,1,80000,100000,120000\nHigher,2,76000,95000,114000',
    )
    expect(r.grades.map((g) => g.id)).toEqual(['Lower', 'Higher'])
    expect(r.warnings.some((w) => w.message.includes('ascending midpoint'))).toBe(false)
  })

  it('sorts the result by order regardless of paste sequence', () => {
    const r = importGradesFromCsv(
      'grade,order,min,mid,max\nG3,3,63000,76000,89000\nG1,1,51000,60000,69000\nG2,2,56500,67000,77500',
    )
    expect(r.grades.map((g) => g.id)).toEqual(['G1', 'G2', 'G3'])
  })

  it('warns when two grades share an order', () => {
    const r = importGradesFromCsv(
      'grade,order,min,mid,max\nG1,1,51000,60000,69000\nG2,1,56500,67000,77500',
    )
    expect(r.warnings.some((w) => w.message.includes('shares order'))).toBe(true)
  })
})

describe('importGradesFromCsv - invalid ranges', () => {
  it('rejects a maximum at or below the minimum', () => {
    const r = importGradesFromCsv('grade,min,mid,max\nG1,69000,60000,51000')
    expect(r.grades).toHaveLength(0)
    expect(r.errors[0].message).toContain('at or below its minimum')
  })

  it('rejects a zero or negative minimum', () => {
    const r = importGradesFromCsv('grade,min,mid,max\nG1,0,60000,69000')
    expect(r.errors[0].message).toContain('greater than zero')
  })

  it('rejects a bound that is not a number', () => {
    const r = importGradesFromCsv('grade,min,mid,max\nG1,fifty,60000,69000')
    expect(r.errors[0].message).toContain('not a number')
  })

  it('rejects a blank grade code', () => {
    const r = importGradesFromCsv('grade,min,mid,max\n,51000,60000,69000')
    expect(r.errors[0].message).toContain('blank')
  })

  it('keeps the first of a duplicated grade code', () => {
    const r = importGradesFromCsv(
      'grade,min,mid,max\nG1,51000,60000,69000\nG1,90000,100000,110000',
    )
    expect(r.grades).toHaveLength(1)
    expect(r.grades[0].min).toBe(51_000)
    expect(r.errors[0].message).toContain('Duplicate grade')
  })

  it('imports the good grades and reports only the bad one', () => {
    const r = importGradesFromCsv(
      'grade,min,mid,max\n' +
        'G1,51000,60000,69000\n' +
        'G2,oops,67000,77500\n' +
        'G3,63000,76000,89000',
    )
    expect(r.grades.map((g) => g.id)).toEqual(['G1', 'G3'])
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0].row).toBe(3)
  })
})
