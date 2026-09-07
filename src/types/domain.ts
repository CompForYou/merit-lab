/**
 * Shared domain types. Vocabulary follows docs/SPEC.md section 5 exactly.
 */

/** A level in the salary structure. */
export interface Grade {
  id: string
  name: string
  /**
   * Position in the structure, 1 = lowest. Explicit rather than inferred from
   * midpoint: inference breaks on parallel job families with overlapping
   * midpoints, and an inferred hierarchy cannot be audited by a reader.
   *
   * When an imported structure has no order column, the importer derives one
   * from ascending midpoint and states on screen that it did so.
   */
  order: number
  min: number
  mid: number
  max: number
}

/** An employee in the population. */
export interface Employee {
  id: string
  gradeId: string
  /**
   * ACTUAL annualized base salary at this employee's FTE, in dollars.
   * A 0.5 FTE employee paid 47,500 has a baseSalary of 47,500, not 95,000.
   * Range placement grosses this up; cost calculations use it as-is.
   */
  baseSalary: number
  performanceRating: string
  /** 0 to 1. */
  fte: number
  eligible: boolean
  /** ISO date, yyyy-mm-dd. Used only for proration. */
  hireDate?: string
  /**
   * Unrecognised columns from an imported file, preserved so results can be
   * grouped by department, location, manager, or anything else the user supplies.
   */
  attributes?: Record<string, string>
}

/**
 * A compa-ratio band — one column of the merit matrix.
 *
 * Bounds are INCLUSIVE at the lower bound and EXCLUSIVE at the upper, so a
 * compa-ratio of exactly 0.90 falls in the 0.90-1.00 band, not the 0.80-0.90 one.
 * A null bound is unbounded in that direction.
 */
export interface CompaRatioBand {
  id: string
  label: string
  lowerBound: number | null
  upperBound: number | null
}

/**
 * The merit matrix. Rows are performance ratings, columns are compa-ratio bands,
 * cells hold increase percentages as decimals (0.035 is 3.5%).
 */
export interface MeritMatrix {
  /** Ordered, strongest performance first. */
  ratings: string[]
  /** Ordered, lowest compa-ratio first. */
  bands: CompaRatioBand[]
  /** cells[performanceRating][bandId] */
  cells: Record<string, Record<string, number>>
}

/**
 * How to handle an increase that would carry an employee above the range maximum.
 * See docs/SPEC.md section 6. This choice materially changes total cost.
 */
export type OverMaxMode = 'capAtMax' | 'allowOverMax' | 'lumpSum'

export interface ScenarioSettings {
  /** Merit budget as a decimal, e.g. 0.0325 for 3.25%. */
  targetBudgetPercent: number
  overMaxMode: OverMaxMode
  prorationEnabled: boolean
  /**
   * ISO date, yyyy-mm-dd. The performance period is the 12 months ending here.
   * Required only when prorationEnabled is true.
   */
  meritEffectiveDate?: string
  /**
   * Compression flag threshold in decimal percentage points, default 0.02
   * (2 percentage points).
   */
  compressionThreshold: number
  /**
   * Round each new base salary to a multiple of this, in whole currency units.
   * 0 means no rounding, which is the default: rounding CHANGES THE COST, so it
   * is never applied unless a user asks for it.
   */
  roundingIncrement?: number
  /** ISO 4217 code for display. The maths is unit-agnostic. */
  currency?: string
  /** BCP 47 locale for display. */
  locale?: string
}

/** Everything needed to reproduce a run. This is what export/import writes. */
export interface Scenario {
  name: string
  employees: Employee[]
  grades: Grade[]
  matrix: MeritMatrix
  settings: ScenarioSettings
}
