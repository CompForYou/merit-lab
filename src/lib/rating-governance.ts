import type { EmployeeMeritResult } from './merit-increase'
import { MIN_GROUP_SIZE } from './grouping'

/**
 * Who rates generously, and where the good ratings land.
 *
 * Two questions with the same table behind them, both asked out loud during a
 * merit cycle and neither answerable from anything the tool showed before.
 *
 * The first is governance: one department calling 40% of its people Exceeds
 * against a company figure of 18% is not a performance fact, it is a
 * calibration conversation, and it moves real money because the matrix pays on
 * the rating.
 *
 * The second is harder and more useful: whether the top ratings are landing on
 * people who are already well paid. If they are, the plan is widening a gap it
 * was probably meant to close, and the compa-ratio dimension of the matrix is
 * fighting the rating dimension.
 *
 * Descriptive throughout. A distribution that differs from the company average
 * is a description of what managers did, not evidence that anybody did anything
 * wrong: a genuinely stronger team should rate higher. The tool has no way to
 * tell those apart and does not pretend to.
 */

export interface RatingShare {
  rating: string
  count: number
  /** Of the group's rated headcount. Null when the group has nobody rated. */
  share: number | null
}

export interface RatingGovernanceRow {
  key: string
  label: string
  /** Employees carrying a rating the matrix knows about. */
  ratedHeadcount: number
  shares: RatingShare[]
  /**
   * The group's top-box share minus the whole population's.
   *
   * Positive means this group rated more generously than the company. In
   * decimal points: 0.12 is twelve percentage points above.
   */
  topBoxGap: number | null
  topBoxShare: number | null
  /** True when the group is too small for its shares to be reported. */
  suppressed: boolean
}

export interface RatingGovernance {
  overall: RatingShare[]
  overallTopBoxShare: number | null
  /** The ratings counted as top box, best first. */
  topBoxRatings: string[]
  rows: RatingGovernanceRow[]
}

/**
 * How many of the best ratings count as "top box".
 *
 * On a scale of four or more, the top two: a five-point scale usually reserves
 * its highest rating for a handful of people, and a share that small is too
 * unstable to compare between a team of nine and a team of ninety. On a shorter
 * scale, only the best one, because two of three ratings is most of the scale
 * and measures nothing.
 */
export function topBoxRatings(ratings: string[]): string[] {
  if (ratings.length === 0) return []
  return ratings.slice(0, ratings.length >= 4 ? 2 : 1)
}

/**
 * Rating distribution by group, against the whole population.
 *
 * `ratings` is the matrix's list, best first, and defines both the column order
 * and which ratings exist. An employee carrying a rating the matrix has no row
 * for is excluded here as elsewhere — they are already reported by name as
 * uncosted, and folding them into a denominator would understate every share.
 */
export function ratingGovernance(
  results: EmployeeMeritResult[],
  keyOf: (result: EmployeeMeritResult) => string,
  labelOf: (key: string) => string,
  ratings: string[],
  minGroupSize = MIN_GROUP_SIZE,
): RatingGovernance {
  const known = new Set(ratings)
  const rated = results.filter((r) => known.has(r.performanceRating))
  const topBox = topBoxRatings(ratings)

  const overall = sharesFor(rated, ratings)
  const overallTopBoxShare = topBoxShareOf(rated, topBox)

  const buckets = new Map<string, EmployeeMeritResult[]>()
  for (const result of rated) {
    const key = keyOf(result)
    const existing = buckets.get(key)
    if (existing) existing.push(result)
    else buckets.set(key, [result])
  }

  const rows: RatingGovernanceRow[] = []
  for (const [key, bucket] of buckets) {
    const suppressed = bucket.length < minGroupSize
    const share = topBoxShareOf(bucket, topBox)

    rows.push({
      key,
      label: labelOf(key),
      ratedHeadcount: bucket.length,
      // Counts are shown for a small group; shares are not. Knowing a team has
      // three people is useful and not disclosive. A percentage across three
      // people is neither: it is unstable enough to mislead, and small enough
      // that a reader who knows the team can back out an individual's rating.
      shares: sharesFor(bucket, ratings).map((s) =>
        suppressed ? { ...s, share: null } : s,
      ),
      topBoxShare: suppressed ? null : share,
      topBoxGap:
        suppressed || share === null || overallTopBoxShare === null
          ? null
          : share - overallTopBoxShare,
      suppressed,
    })
  }

  rows.sort((a, b) => {
    // Most generous first, with suppressed groups last: the row a director is
    // looking for is the outlier, and it should not be below eleven teams of
    // four.
    if (a.topBoxGap === null && b.topBoxGap === null) return b.ratedHeadcount - a.ratedHeadcount
    if (a.topBoxGap === null) return 1
    if (b.topBoxGap === null) return -1
    return b.topBoxGap - a.topBoxGap
  })

  return { overall, overallTopBoxShare, topBoxRatings: topBox, rows }
}

function sharesFor(
  results: EmployeeMeritResult[],
  ratings: string[],
): RatingShare[] {
  const total = results.length
  return ratings.map((rating) => {
    const count = results.filter((r) => r.performanceRating === rating).length
    return { rating, count, share: total > 0 ? count / total : null }
  })
}

function topBoxShareOf(
  results: EmployeeMeritResult[],
  topBox: string[],
): number | null {
  if (results.length === 0) return null
  const set = new Set(topBox)
  return results.filter((r) => set.has(r.performanceRating)).length / results.length
}

/**
 * Where the top ratings sit in the pay ranges.
 *
 * Answers whether the plan is rewarding people who are already ahead. Compares
 * the median compa-ratio of top-box employees against everybody else: a
 * meaningfully higher figure means the best ratings are concentrated among the
 * best paid, and a matrix that also pays more at low compa-ratios is pulling in
 * two directions at once.
 */
export function topBoxPayPosition(
  results: EmployeeMeritResult[],
  ratings: string[],
): { topBoxMedian: number | null; othersMedian: number | null; gap: number | null } {
  const topBox = new Set(topBoxRatings(ratings))
  const withRatio = results.filter(
    (r) => r.compaRatio !== null && ratings.includes(r.performanceRating),
  )

  const top = medianOf(
    withRatio.filter((r) => topBox.has(r.performanceRating)).map((r) => r.compaRatio!),
  )
  const rest = medianOf(
    withRatio.filter((r) => !topBox.has(r.performanceRating)).map((r) => r.compaRatio!),
  )

  return {
    topBoxMedian: top,
    othersMedian: rest,
    gap: top === null || rest === null ? null : top - rest,
  }
}

function medianOf(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}
