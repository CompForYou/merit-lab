import type { EmployeeMeritResult } from './merit-increase'
import type { Grade } from '../types/domain'

/** One employee, as a dot. */
export interface Dot {
  employeeId: string
  performanceRating: string
  bandId: string | null
  /** Compa-ratio before the cycle. The grey dot. */
  before: number
  /** Compa-ratio after the cycle. The dot that moves. */
  after: number
  /**
   * Vertical slot, symmetric around zero: 0, +1, -1, +2, -2. Derived from the
   * BEFORE position and then fixed, so a dot keeps its row when it moves and the
   * eye can follow it sideways.
   */
  row: number
  eligible: boolean
  isOverMaximumAfter: boolean
  isBelowMinimumAfter: boolean
  crossedMaximum: boolean
}

export interface DotLayout {
  dots: Dot[]
  /** How far the stack reaches from the centre line, in rows. */
  maxRow: number
  /** [low, high] compa-ratio covered, padded so no dot sits on the edge. */
  domain: [number, number]
  /** Employees with no compa-ratio, and so no dot. Reported, never hidden. */
  omitted: number
}

/** Dots are binned at this compa-ratio resolution before stacking. */
export const DEFAULT_BIN_WIDTH = 0.01

/**
 * Lay a population out as dots, one per employee.
 *
 * Not a histogram. A bar chart shows a distribution; dots show people, and the
 * point of the exercise is watching individuals move rather than watching a
 * shape change.
 *
 * Dots at a similar compa-ratio would sit on top of each other, so they are
 * binned and stacked symmetrically around a centre line. The stack position is
 * computed from the BEFORE compa-ratio and then held constant, which is what
 * makes the movement legible: every dot travels horizontally along its own row
 * instead of jumping rows mid-flight.
 *
 * Employees who could not be placed have no compa-ratio and therefore no dot.
 * They are counted in `omitted` so the interface can say so rather than quietly
 * drawing a smaller population than the user pasted in.
 */
export function layoutDots(
  results: EmployeeMeritResult[],
  binWidth: number = DEFAULT_BIN_WIDTH,
): DotLayout {
  const width = binWidth > 0 ? binWidth : DEFAULT_BIN_WIDTH

  const placeable = results.filter(
    (r) => r.compaRatio !== null && r.newCompaRatio !== null,
  )
  const omitted = results.length - placeable.length

  // Sorting before binning makes the stack order deterministic, so the same
  // population always draws the same picture.
  const sorted = [...placeable].sort(
    (a, b) => a.compaRatio! - b.compaRatio! || a.employeeId.localeCompare(b.employeeId),
  )

  const binCounts = new Map<number, number>()
  let maxRow = 0

  const dots: Dot[] = sorted.map((r) => {
    const before = r.compaRatio!
    const bin = Math.round(before / width)
    const indexInBin = binCounts.get(bin) ?? 0
    binCounts.set(bin, indexInBin + 1)

    const row = symmetricRow(indexInBin)
    if (Math.abs(row) > maxRow) maxRow = Math.abs(row)

    return {
      employeeId: r.employeeId,
      performanceRating: r.performanceRating,
      bandId: r.bandId,
      before,
      after: r.newCompaRatio!,
      row,
      eligible: r.eligible,
      isOverMaximumAfter: r.isOverMaximumAfter,
      isBelowMinimumAfter: r.isBelowMinimumAfter,
      crossedMaximum: r.crossedMaximum,
    }
  })

  return { dots, maxRow, domain: computeDomain(dots), omitted }
}

/** One grade's band of the plot, with its own range bounds in compa-ratio terms. */
export interface DotGradeGroup {
  gradeId: string
  gradeName: string
  order: number
  dots: Dot[]
  /** How far this group's stack reaches from its own centre line. */
  maxRow: number
  /**
   * The grade minimum and maximum expressed as compa-ratios, so they can be
   * drawn on this row.
   *
   * This is the reason the grouped view exists. On one shared axis the range
   * bounds cannot be drawn at all: a minimum sits at 0.85 compa-ratio in one
   * grade and 0.76 in another, so there is no single place to put the line.
   * Split by grade, each row has exactly one answer.
   */
  minCompaRatio: number | null
  maxCompaRatio: number | null
}

export interface GroupedDotLayout {
  groups: DotGradeGroup[]
  domain: [number, number]
  omitted: number
}

/**
 * The same population, split into one band per grade.
 *
 * Ungrouped, the vertical axis is a stacking artifact carrying no meaning.
 * Grouped, it carries the structure, and each grade can show where its own
 * minimum and maximum fall relative to its own midpoint.
 */
export function layoutDotsByGrade(
  results: EmployeeMeritResult[],
  grades: Grade[],
  binWidth: number = DEFAULT_BIN_WIDTH,
): GroupedDotLayout {
  const flat = layoutDots(results, binWidth)
  const gradeOf = new Map(results.map((r) => [r.employeeId, r.gradeId]))
  const width = binWidth > 0 ? binWidth : DEFAULT_BIN_WIDTH

  const groups = [...grades]
    .sort((a, b) => a.order - b.order)
    .map((grade) => {
      const mine = flat.dots.filter((d) => gradeOf.get(d.employeeId) === grade.id)
      // Restacked within the group: a dot's row in the shared plot says nothing
      // about how it should sit among only its own grade.
      const { dots, maxRow } = restack(mine, width)

      return {
        gradeId: grade.id,
        gradeName: grade.name,
        order: grade.order,
        dots,
        maxRow,
        minCompaRatio: grade.mid > 0 ? grade.min / grade.mid : null,
        maxCompaRatio: grade.mid > 0 ? grade.max / grade.mid : null,
      }
    })

  return { groups, domain: flat.domain, omitted: flat.omitted }
}

/** Re-run the binning over a subset, so each grade stacks from its own centre. */
function restack(dots: Dot[], binWidth: number): { dots: Dot[]; maxRow: number } {
  const counts = new Map<number, number>()
  let maxRow = 0

  const sorted = [...dots].sort(
    (a, b) => a.before - b.before || a.employeeId.localeCompare(b.employeeId),
  )

  const placed = sorted.map((dot) => {
    const bin = Math.round(dot.before / binWidth)
    const index = counts.get(bin) ?? 0
    counts.set(bin, index + 1)
    const row = symmetricRow(index)
    if (Math.abs(row) > maxRow) maxRow = Math.abs(row)
    return { ...dot, row }
  })

  return { dots: placed, maxRow }
}

/**
 * 0, +1, -1, +2, -2 ... so the stack grows evenly either side of the centre.
 *
 * The zero case is written out rather than falling out of the arithmetic:
 * -1 * 0 is negative zero in JavaScript, which compares equal to 0 but is not
 * interchangeable with it everywhere, and there is no reason to let one loose.
 */
function symmetricRow(indexInBin: number): number {
  const magnitude = Math.ceil(indexInBin / 2)
  if (magnitude === 0) return 0
  return indexInBin % 2 === 1 ? magnitude : -magnitude
}

/**
 * The compa-ratio range to draw, covering both positions of every dot with a
 * little padding. Never clamped to 0.80-1.20: the outliers are the interesting
 * cases and cropping them off would hide exactly who the user is looking for.
 */
function computeDomain(dots: Dot[]): [number, number] {
  if (dots.length === 0) return [0.8, 1.2]

  let low = Infinity
  let high = -Infinity
  for (const dot of dots) {
    low = Math.min(low, dot.before, dot.after)
    high = Math.max(high, dot.before, dot.after)
  }

  // A minimum span, so a tightly clustered population does not get magnified
  // into looking wildly dispersed.
  const span = Math.max(high - low, 0.2)
  const centre = (low + high) / 2
  const padded = span * 1.08

  return [centre - padded / 2, centre + padded / 2]
}
