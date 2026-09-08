import type { SensitivityRow } from '../lib/sensitivity'
import type { InversionSummary } from '../lib/inversions'
import type { RatingGovernance } from '../lib/rating-governance'
import {
  formatCount,
  formatCurrency,
  formatCurrencyCompact,
  formatPercent,
  formatPercentSigned,
  formatCompaRatio,
  pluralize,
} from '../lib/format'

/**
 * The three questions that get asked out loud.
 *
 * Everything else in the consequences column answers "what does this plan do".
 * These answer "defend it": what a different budget would look like, why a top
 * performer received less than the person beside them, and whether one team
 * rated its people far more generously than the rest. All three arrive live, in
 * a room, with people waiting, and none of them was answerable before.
 */

/** What other budgets would cost, and what they would cost you. */
export function SensitivityTable({
  rows,
  currentTarget,
}: {
  rows: SensitivityRow[]
  currentTarget: number
}) {
  if (rows.length === 0) {
    return <p className="text-xs text-zinc-400">Nothing to cost yet.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="text-[11px] uppercase tracking-[0.08em] text-zinc-400">
            <th className="pb-2 pr-3 text-left font-medium">Budget</th>
            <th className="px-2 pb-2 text-right font-medium">Cost</th>
            <th className="px-2 pb-2 text-right font-medium">Matrix</th>
            <th className="px-2 pb-2 text-right font-medium">Median</th>
            <th className="px-2 pb-2 text-right font-medium">Capped</th>
            <th className="px-2 pb-2 text-right font-medium">Zero</th>
            <th className="pb-2 pl-2 text-right font-medium">Below min</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {rows.map((row) => {
            const isCurrent = Math.abs(row.targetPercent - currentTarget) < 1e-9
            return (
              <tr
                key={row.targetPercent}
                className={`border-t border-zinc-200 ${
                  isCurrent ? 'bg-zinc-50 font-medium text-zinc-900' : 'text-zinc-600'
                }`}
              >
                <td className="py-1.5 pr-3">
                  {formatPercent(row.targetPercent, 2)}
                  {isCurrent ? (
                    <span className="ml-1.5 text-[10px] font-normal text-zinc-400">
                      now
                    </span>
                  ) : null}
                  {!row.reachable ? (
                    <span className="ml-1.5 text-[10px] font-normal text-amber-700">
                      lands at {formatPercent(row.achievedPercent, 2)}
                    </span>
                  ) : null}
                </td>
                <td className="px-2 py-1.5 text-right text-zinc-900">
                  {formatCurrencyCompact(row.totalSpend)}
                </td>
                <td className="px-2 py-1.5 text-right text-zinc-500">
                  {row.scaleFactor === null ? '—' : `×${row.scaleFactor.toFixed(3)}`}
                </td>
                <td className="px-2 py-1.5 text-right">
                  {row.medianShift === null
                    ? '—'
                    : `${row.medianShift > 0 ? '+' : ''}${(row.medianShift * 100).toFixed(1)}`}
                </td>
                <td className="px-2 py-1.5 text-right text-zinc-500">
                  {row.cappedHeadcount > 0 ? formatCount(row.cappedHeadcount) : '·'}
                </td>
                <td className="px-2 py-1.5 text-right text-zinc-500">
                  {row.zeroIncreaseCount > 0 ? formatCount(row.zeroIncreaseCount) : '·'}
                </td>
                <td className="py-1.5 pl-2 text-right text-zinc-500">
                  {row.belowMinimumAfter > 0 ? formatCount(row.belowMinimumAfter) : '·'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
        Every row scales this matrix rather than designing a new one, so the shape
        of your plan survives and only its size changes. Median is the compa-ratio
        movement in points. A row marked <span className="text-amber-700">lands
        at</span> cannot be reached: under capping the population physically
        cannot absorb the money, and no larger matrix will change that.
      </p>
    </div>
  )
}

/** Where a better rating received fewer dollars. */
export function InversionList({ summary }: { summary: InversionSummary }) {
  if (summary.affectedCount === 0) {
    return (
      <p className="text-xs text-zinc-500">
        Nobody is out-earned by a colleague with a worse rating in the same grade.
      </p>
    )
  }

  return (
    <div>
      <p className="mb-2.5 text-xs text-zinc-700">
        {pluralize(summary.affectedCount, 'employee')} receive less money than
        somebody in the same grade with a worse rating.
      </p>

      <div className="space-y-2">
        {summary.examples.map((inversion) => (
          <div
            key={`${inversion.better.employeeId}-${inversion.worse.employeeId}`}
            className="border-t border-zinc-100 pt-2 text-xs"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-zinc-900">
                {inversion.better.employeeId}
                <span className="text-zinc-400"> · </span>
                {inversion.better.performanceRating}
              </span>
              <span className="tabular-nums text-amber-800">
                {formatCurrency(inversion.dollarGap)} less
              </span>
            </div>
            <div className="mt-0.5 tabular-nums text-[11px] leading-relaxed text-zinc-500">
              {formatPercent(inversion.better.matrixPercent, 1)} of{' '}
              {formatCurrency(inversion.better.baseSalary)} ={' '}
              {formatCurrency(inversion.better.increaseAmount)}
              <span className="text-zinc-300"> · versus · </span>
              {inversion.worse.employeeId} ({inversion.worse.performanceRating}){' '}
              {formatPercent(inversion.worse.matrixPercent, 1)} of{' '}
              {formatCurrency(inversion.worse.baseSalary)} ={' '}
              {formatCurrency(inversion.worse.increaseAmount)}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-2.5 text-[11px] leading-relaxed text-zinc-400">
        A matrix pays a percentage, and a percentage of a larger salary is more
        money. Within a grade that can reverse the order the ratings intended.
        Comparisons are within a grade only: across grades this is the structure
        working, not a defect. It is not necessarily wrong — but it is what the
        manager will ask about, and it is better to know first.
        {summary.excludedPartTime > 0 ? (
          <>
            {' '}
            {pluralize(summary.excludedPartTime, 'part-time employee')}{' '}
            {summary.excludedPartTime === 1 ? 'is' : 'are'} left out: they receive
            a share of a full increase, so comparing their dollars against a
            full-timer's is not like for like.
          </>
        ) : null}
      </p>
    </div>
  )
}

/** Who rated generously, and whether the good ratings sit on the best-paid people. */
export function RatingGovernanceTable({
  report,
  payPosition,
  groupLabel,
}: {
  report: RatingGovernance
  payPosition: { topBoxMedian: number | null; othersMedian: number | null; gap: number | null }
  groupLabel: string
}) {
  if (report.rows.length === 0) {
    return <p className="text-xs text-zinc-400">Nothing rated yet.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="text-[11px] uppercase tracking-[0.08em] text-zinc-400">
            <th className="pb-2 pr-3 text-left font-medium">{groupLabel}</th>
            <th className="px-2 pb-2 text-right font-medium">People</th>
            {report.overall.map((share) => (
              <th key={share.rating} className="px-2 pb-2 text-right font-medium">
                {share.rating}
              </th>
            ))}
            <th className="pb-2 pl-2 text-right font-medium">Top box</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {report.rows.map((row) => (
            <tr key={row.key} className="border-t border-zinc-200 text-zinc-600">
              <td className="py-1.5 pr-3 text-zinc-900">
                {row.label}
                {row.suppressed ? (
                  <span className="ml-1.5 text-[10px] text-zinc-400">too few</span>
                ) : null}
              </td>
              <td className="px-2 py-1.5 text-right text-zinc-500">
                {formatCount(row.ratedHeadcount)}
              </td>
              {row.shares.map((share) => (
                <td key={share.rating} className="px-2 py-1.5 text-right">
                  {share.share === null ? (
                    <span className="text-zinc-300">{formatCount(share.count)}</span>
                  ) : (
                    formatPercent(share.share, 0)
                  )}
                </td>
              ))}
              <td
                className={`py-1.5 pl-2 text-right ${
                  row.topBoxGap !== null && Math.abs(row.topBoxGap) >= 0.1
                    ? 'text-amber-800'
                    : 'text-zinc-500'
                }`}
              >
                {row.topBoxShare === null ? (
                  '—'
                ) : (
                  <>
                    {formatPercent(row.topBoxShare, 0)}
                    <span className="ml-1 text-[10px] text-zinc-400">
                      {formatPercentSigned(row.topBoxGap, 0)}
                    </span>
                  </>
                )}
              </td>
            </tr>
          ))}
          <tr className="border-t-2 border-zinc-300 font-medium text-zinc-900">
            <td className="py-1.5 pr-3">Company</td>
            <td className="px-2 py-1.5 text-right">
              {formatCount(report.overall.reduce((n, s) => n + s.count, 0))}
            </td>
            {report.overall.map((share) => (
              <td key={share.rating} className="px-2 py-1.5 text-right">
                {formatPercent(share.share, 0)}
              </td>
            ))}
            <td className="py-1.5 pl-2 text-right">
              {formatPercent(report.overallTopBoxShare, 0)}
            </td>
          </tr>
        </tbody>
      </table>

      {payPosition.gap !== null ? (
        <p className="mt-2.5 border-t border-zinc-100 pt-2.5 text-xs leading-relaxed text-zinc-600">
          Employees in the top box sit at a median compa-ratio of{' '}
          <span className="tabular-nums text-zinc-900">
            {formatCompaRatio(payPosition.topBoxMedian)}
          </span>
          , against{' '}
          <span className="tabular-nums text-zinc-900">
            {formatCompaRatio(payPosition.othersMedian)}
          </span>{' '}
          for everybody else
          {Math.abs(payPosition.gap) >= 0.02 ? (
            <>
              {' '}
              — a gap of{' '}
              <span className="tabular-nums">
                {formatPercentSigned(payPosition.gap, 1)}
              </span>
              .{' '}
              {payPosition.gap > 0
                ? 'The best ratings are landing on people who are already the better paid, so the rating dimension of your matrix is pulling against the compa-ratio dimension.'
                : 'The best ratings are landing on people who are paid below their peers, so the two dimensions of your matrix are pulling the same way.'}
            </>
          ) : (
            '. The two are close enough that ratings are not tracking pay position.'
          )}
        </p>
      ) : null}

      <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
        Top box is the best {report.topBoxRatings.length === 1 ? 'rating' : 'two ratings'} (
        {report.topBoxRatings.join(', ')}), with each group's distance from the
        company figure beside it. Groups under five people show counts but not
        shares. This describes what managers did; it is not evidence that anybody
        did anything wrong, and a genuinely stronger team should rate higher.
      </p>
    </div>
  )
}
