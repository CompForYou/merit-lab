import { describe, it, expect } from 'vitest'
import { findInversions } from './inversions'
import type { EmployeeMeritResult } from './merit-increase'

const RATINGS = ['Exceeds', 'Meets', 'Below']

/**
 * A costed employee. Only the fields the inversion finder reads are meaningful;
 * the rest are filled with a coherent default so a fixture cannot accidentally
 * describe an impossible person.
 */
function person(over: Partial<EmployeeMeritResult>): EmployeeMeritResult {
  const baseSalary = over.baseSalary ?? 100_000
  const matrixPercent = over.matrixPercent ?? 0.03
  const increaseAmount = over.increaseAmount ?? baseSalary * matrixPercent

  return {
    employeeId: 'E',
    gradeId: 'G1',
    fte: 1,
    performanceRating: 'Meets',
    eligible: true,
    excluded: false,
    exclusionReason: null,
    compaRatio: 1,
    bandId: 'band',
    prorationFactor: 1,
    uncappedIncreaseAmount: increaseAmount,
    lumpSumAmount: 0,
    reducedByCap: 0,
    newSalary: baseSalary + increaseAmount,
    newCompaRatio: 1,
    wasOverMaximumBefore: false,
    isOverMaximumAfter: false,
    crossedMaximum: false,
    wasBelowMinimumBefore: false,
    isBelowMinimumAfter: false,
    ...over,
    baseSalary,
    matrixPercent,
    increaseAmount,
  }
}

describe('findInversions - the basic case', () => {
  /**
   * 5% of 60,000 is 3,000.
   * 3% of 110,000 is 3,300.
   *
   * The Exceeds employee receives 300 dollars less than the Meets employee, in
   * the same grade, because the matrix pays a percentage and 110,000 is a much
   * larger base than 60,000.
   */
  const results = [
    person({ employeeId: 'TOP', performanceRating: 'Exceeds', baseSalary: 60_000, matrixPercent: 0.05 }),
    person({ employeeId: 'MID', performanceRating: 'Meets', baseSalary: 110_000, matrixPercent: 0.03 }),
  ]
  const found = findInversions(results, RATINGS)

  it('finds the pair', () => {
    expect(found.pairCount).toBe(1)
    expect(found.affectedCount).toBe(1)
  })

  it('reports the gap in dollars', () => {
    expect(found.examples[0].dollarGap).toBe(300)
  })

  it('names who is on each side', () => {
    expect(found.examples[0].better.employeeId).toBe('TOP')
    expect(found.examples[0].worse.employeeId).toBe('MID')
  })

  it('carries the arithmetic that produced it', () => {
    const [example] = found.examples
    expect(example.better).toMatchObject({ baseSalary: 60_000, matrixPercent: 0.05, increaseAmount: 3_000 })
    expect(example.worse).toMatchObject({ baseSalary: 110_000, matrixPercent: 0.03, increaseAmount: 3_300 })
  })
})

describe('findInversions - when there is nothing wrong', () => {
  it('finds nothing when the better rating is paid more', () => {
    // 5% of 100,000 is 5,000; 3% of 110,000 is 3,300. The order holds.
    const found = findInversions(
      [
        person({ employeeId: 'TOP', performanceRating: 'Exceeds', baseSalary: 100_000, matrixPercent: 0.05 }),
        person({ employeeId: 'MID', performanceRating: 'Meets', baseSalary: 110_000, matrixPercent: 0.03 }),
      ],
      RATINGS,
    )
    expect(found.pairCount).toBe(0)
    expect(found.examples).toEqual([])
  })

  it('does not flag an exact tie', () => {
    // 5% of 60,000 and 3% of 100,000 are both 3,000. Equal is not inverted, and
    // flagging it would report a rounding artefact as a finding.
    const found = findInversions(
      [
        person({ employeeId: 'TOP', performanceRating: 'Exceeds', baseSalary: 60_000, matrixPercent: 0.05 }),
        person({ employeeId: 'MID', performanceRating: 'Meets', baseSalary: 100_000, matrixPercent: 0.03 }),
      ],
      RATINGS,
    )
    expect(found.pairCount).toBe(0)
  })

  it('does not compare employees in different grades', () => {
    // Across grades this is trivially true and means nothing: a junior top
    // performer will always receive fewer dollars than a senior average one,
    // and that is the structure working rather than a defect.
    const found = findInversions(
      [
        person({ employeeId: 'TOP', gradeId: 'G1', performanceRating: 'Exceeds', baseSalary: 60_000, matrixPercent: 0.05 }),
        person({ employeeId: 'SENIOR', gradeId: 'G8', performanceRating: 'Meets', baseSalary: 110_000, matrixPercent: 0.03 }),
      ],
      RATINGS,
    )
    expect(found.pairCount).toBe(0)
  })
})

describe('findInversions - counting', () => {
  it('counts affected people, not pairs', () => {
    // One underpaid top performer out-earned by three average colleagues is one
    // problem, not three. Pairs grow quadratically and would overstate it.
    const found = findInversions(
      [
        person({ employeeId: 'TOP', performanceRating: 'Exceeds', baseSalary: 60_000, matrixPercent: 0.05 }),
        person({ employeeId: 'M1', performanceRating: 'Meets', baseSalary: 110_000, matrixPercent: 0.03 }),
        person({ employeeId: 'M2', performanceRating: 'Meets', baseSalary: 120_000, matrixPercent: 0.03 }),
        person({ employeeId: 'M3', performanceRating: 'Meets', baseSalary: 130_000, matrixPercent: 0.03 }),
      ],
      RATINGS,
    )
    expect(found.pairCount).toBe(3)
    expect(found.affectedCount).toBe(1)
  })

  it('gives one example per out-earned person, keeping their worst', () => {
    // 3% of 130,000 is 3,900 against TOP's 3,000: a gap of 900, the largest of
    // the three, and the only one worth a reader's attention.
    const found = findInversions(
      [
        person({ employeeId: 'TOP', performanceRating: 'Exceeds', baseSalary: 60_000, matrixPercent: 0.05 }),
        person({ employeeId: 'M1', performanceRating: 'Meets', baseSalary: 110_000, matrixPercent: 0.03 }),
        person({ employeeId: 'M2', performanceRating: 'Meets', baseSalary: 120_000, matrixPercent: 0.03 }),
        person({ employeeId: 'M3', performanceRating: 'Meets', baseSalary: 130_000, matrixPercent: 0.03 }),
      ],
      RATINGS,
    )
    expect(found.examples).toHaveLength(1)
    expect(found.examples[0].worse.employeeId).toBe('M3')
    expect(found.examples[0].dollarGap).toBe(900)
  })

  it('ranks examples worst gap first', () => {
    const found = findInversions(
      [
        person({ employeeId: 'TOP_A', gradeId: 'G1', performanceRating: 'Exceeds', baseSalary: 60_000, matrixPercent: 0.05 }),
        person({ employeeId: 'MID_A', gradeId: 'G1', performanceRating: 'Meets', baseSalary: 110_000, matrixPercent: 0.03 }),
        person({ employeeId: 'TOP_B', gradeId: 'G2', performanceRating: 'Exceeds', baseSalary: 50_000, matrixPercent: 0.05 }),
        person({ employeeId: 'MID_B', gradeId: 'G2', performanceRating: 'Meets', baseSalary: 150_000, matrixPercent: 0.03 }),
      ],
      RATINGS,
    )
    // Grade 2: 4,500 against 2,500 is a 2,000 gap. Grade 1's is 300.
    expect(found.examples.map((e) => e.better.employeeId)).toEqual(['TOP_B', 'TOP_A'])
  })

  it('honours the example limit', () => {
    const people = [
      person({ employeeId: 'BIG', performanceRating: 'Meets', baseSalary: 500_000, matrixPercent: 0.03 }),
      ...[1, 2, 3, 4].map((n) =>
        person({
          employeeId: `TOP${n}`,
          performanceRating: 'Exceeds',
          baseSalary: 60_000 + n,
          matrixPercent: 0.05,
        }),
      ),
    ]
    expect(findInversions(people, RATINGS, 2).examples).toHaveLength(2)
    expect(findInversions(people, RATINGS).affectedCount).toBe(4)
  })
})

describe('findInversions - who is compared at all', () => {
  const outEarner = person({
    employeeId: 'MID',
    performanceRating: 'Meets',
    baseSalary: 110_000,
    matrixPercent: 0.03,
  })

  it('skips an ineligible employee', () => {
    const found = findInversions(
      [
        person({ employeeId: 'TOP', performanceRating: 'Exceeds', baseSalary: 60_000, matrixPercent: 0.05, eligible: false }),
        outEarner,
      ],
      RATINGS,
    )
    expect(found.pairCount).toBe(0)
  })

  it('skips an employee who could not be costed', () => {
    // Their zero is an absence of a calculation, not a small increase, and
    // reading it as one would report an inversion that does not exist.
    const found = findInversions(
      [
        person({
          employeeId: 'TOP',
          performanceRating: 'Exceeds',
          baseSalary: 60_000,
          matrixPercent: null,
          increaseAmount: 0,
          excluded: true,
          exclusionReason: 'no-matrix-cell',
        }),
        outEarner,
      ],
      RATINGS,
    )
    expect(found.pairCount).toBe(0)
  })

  it('skips a rating the matrix has no row for, rather than guessing its rank', () => {
    const found = findInversions(
      [
        person({ employeeId: 'TOP', performanceRating: 'Outstanding', baseSalary: 60_000, matrixPercent: 0.05 }),
        outEarner,
      ],
      RATINGS,
    )
    expect(found.pairCount).toBe(0)
  })
})

describe('findInversions - part-time employees', () => {
  /**
   * A half-time employee receives roughly half the dollars of an identical
   * full-timer, so nearly every part-timer is "out-earned" by somebody. That is
   * hours working as intended, and reporting it buries the real findings.
   */
  it('leaves a part-time employee out of the comparison', () => {
    const found = findInversions(
      [
        person({
          employeeId: 'HALF',
          performanceRating: 'Exceeds',
          baseSalary: 32_350,
          matrixPercent: 0.05,
          fte: 0.5,
        }),
        person({ employeeId: 'FULL', performanceRating: 'Meets', baseSalary: 110_000, matrixPercent: 0.03 }),
      ],
      RATINGS,
    )
    expect(found.pairCount).toBe(0)
    expect(found.affectedCount).toBe(0)
  })

  it('says how many were left out rather than hiding it', () => {
    const found = findInversions(
      [
        person({ employeeId: 'H1', performanceRating: 'Exceeds', baseSalary: 32_350, fte: 0.5 }),
        person({ employeeId: 'H2', performanceRating: 'Meets', baseSalary: 40_000, fte: 0.8 }),
        person({ employeeId: 'FULL', performanceRating: 'Meets', baseSalary: 110_000 }),
      ],
      RATINGS,
    )
    expect(found.excludedPartTime).toBe(2)
  })

  it('still finds an inversion between two full-time employees', () => {
    const found = findInversions(
      [
        person({ employeeId: 'HALF', performanceRating: 'Exceeds', baseSalary: 32_350, fte: 0.5 }),
        person({ employeeId: 'TOP', performanceRating: 'Exceeds', baseSalary: 60_000, matrixPercent: 0.05 }),
        person({ employeeId: 'MID', performanceRating: 'Meets', baseSalary: 110_000, matrixPercent: 0.03 }),
      ],
      RATINGS,
    )
    expect(found.affectedCount).toBe(1)
    expect(found.examples[0].better.employeeId).toBe('TOP')
    expect(found.excludedPartTime).toBe(1)
  })
})

describe('findInversions - lump sum', () => {
  it('counts a lump sum as money received', () => {
    // Under lumpSum mode the money above the maximum is paid once rather than
    // built into base. It is still what the employee gets, so leaving it out
    // would invent an inversion that nobody experiences.
    const found = findInversions(
      [
        person({ employeeId: 'TOP', performanceRating: 'Exceeds', baseSalary: 60_000, matrixPercent: 0.05 }),
        person({
          employeeId: 'MID',
          performanceRating: 'Meets',
          baseSalary: 110_000,
          matrixPercent: 0.03,
          increaseAmount: 1_000,
          lumpSumAmount: 2_300,
        }),
      ],
      RATINGS,
    )
    // 1,000 built into base plus a 2,300 lump sum is 3,300 against TOP's 3,000.
    expect(found.pairCount).toBe(1)
    expect(found.examples[0].dollarGap).toBe(300)
  })
})
