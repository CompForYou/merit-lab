import type { CompressionPair } from '../lib/compression'
import { MIN_HEADCOUNT_FOR_COMPRESSION_FLAG } from '../lib/compression'
import { formatCount, formatCurrency, formatPercent } from '../lib/format'
import { Explain } from './Explain'

/**
 * The compression indicator.
 *
 * An INDICATOR, not an analysis, and the wording on screen says so. It reports
 * that the median gap between two adjacent grades narrowed. It does not say why,
 * and it cannot: real compression work needs manager, tenure and hire-date
 * context this tool does not take. Overstating it here would be the fastest way
 * to lose a practitioner's trust in everything else on the page.
 */
export function CompressionTable({ pairs }: { pairs: CompressionPair[] }) {
  if (pairs.length === 0) {
    return (
      <p className="text-xs text-zinc-400">
        At least two grades are needed to compare differentials.
      </p>
    )
  }

  const flagged = pairs.filter((p) => p.flagged)

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="text-[11px] uppercase tracking-[0.08em] text-zinc-400">
              <th className="pb-2 pr-3 text-left font-medium">
                Grade step<Explain term="midpoint-progression" />
              </th>
              <th className="px-2 pb-2 text-right font-medium">N</th>
              <th className="px-2 pb-2 text-right font-medium">Before</th>
              <th className="px-2 pb-2 text-right font-medium">After</th>
              <th className="pb-2 pl-2 text-right font-medium">
                Change<Explain term="compression-differential" />
              </th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {pairs.map((pair) => {
              const narrowed =
                pair.differentialChange !== null && pair.differentialChange < 0
              return (
                <tr
                  key={`${pair.lowerGradeId}-${pair.higherGradeId}`}
                  className="border-t border-zinc-200"
                >
                  <td className="py-1.5 pr-3">
                    <span className="text-zinc-900">{pair.lowerGradeName}</span>
                    <span className="text-zinc-300"> → </span>
                    <span className="text-zinc-900">{pair.higherGradeName}</span>
                    {pair.flagged ? (
                      <span
                        className="ml-1.5 text-rose-600"
                        title="Narrowed by more than the threshold"
                      >
                        ●
                      </span>
                    ) : null}
                  </td>
                  <td
                    className={`px-2 py-1.5 text-right ${
                      pair.belowHeadcountThreshold ? 'text-amber-700' : 'text-zinc-500'
                    }`}
                    title={
                      pair.belowHeadcountThreshold
                        ? `Fewer than ${MIN_HEADCOUNT_FOR_COMPRESSION_FLAG} employees in one of these grades, so this pair is reported but never flagged`
                        : undefined
                    }
                  >
                    {formatCount(pair.lowerHeadcount)}/{formatCount(pair.higherHeadcount)}
                  </td>
                  <td className="px-2 py-1.5 text-right text-zinc-500">
                    {formatPercent(pair.differentialBefore, 1)}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {formatPercent(pair.differentialAfter, 1)}
                  </td>
                  <td
                    className={`py-1.5 pl-2 text-right ${
                      pair.flagged
                        ? 'text-rose-700'
                        : narrowed
                          ? 'text-amber-700'
                          : 'text-zinc-400'
                    }`}
                  >
                    {pair.differentialChange === null
                      ? '—'
                      : `${pair.differentialChange > 0 ? '+' : ''}${(pair.differentialChange * 100).toFixed(2)} pts`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
        The differential is the gap between the median full-time salary of each
        grade, as a percentage of the lower one. A uniform percentage increase
        leaves it unchanged; compression comes from uneven increases, not from
        spending money. Pairs with fewer than {MIN_HEADCOUNT_FOR_COMPRESSION_FLAG}{' '}
        employees on either side are shown but never flagged, because a median
        over that few people moves too easily to trust.
      </p>

      <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
        This is an indicator, not a compression analysis.{' '}
        {flagged.length > 0
          ? `${flagged.length === 1 ? 'One step' : `${flagged.length} steps`} narrowed enough to look at. `
          : 'No step narrowed enough to flag. '}
        Deciding whether a narrowing differential is actually a problem needs
        tenure, manager and hire-date context Merit Lab does not take.
      </p>
    </div>
  )
}

/** Total dollars withheld, shown alongside the crossings it prevented. */
export function CappedNote({
  reducedByCap,
  cappedCount,
}: {
  reducedByCap: number
  cappedCount: number
}) {
  if (reducedByCap <= 0) return null
  return (
    <p className="mt-3 text-xs text-amber-800">
      {formatCurrency(reducedByCap)} of increase was withheld at the range maximum
      across {formatCount(cappedCount)}{' '}
      {cappedCount === 1 ? 'employee' : 'employees'}. Switching the over-maximum
      mode changes this number and the cost with it.
    </p>
  )
}
