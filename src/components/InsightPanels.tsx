import type { ScenarioResults } from '../lib/run-scenario'
import type { Grade } from '../types/domain'
import {
  increaseDistribution,
  topCostDrivers,
  bandMovement,
  costPerCompaRatioPoint,
  structureRows,
} from '../lib/insights'
import {
  formatCompaRatio,
  formatCount,
  formatCurrency,
  formatCurrencyCompact,
  formatPercent,
  pluralize,
} from '../lib/format'
import { Explain } from './Explain'

/**
 * What individuals actually receive.
 *
 * A spend percentage is a weighted average and hides its own shape. A 3.25%
 * budget can mean everyone getting 3.25%, or half the population getting
 * nothing while the rest get 6.5%. Those are different plans to defend, and the
 * headline cannot tell them apart.
 */
export function IncreaseDistribution({ scenario }: { scenario: ScenarioResults }) {
  const buckets = increaseDistribution(scenario.results)
  if (buckets.length === 0) {
    return <p className="text-xs text-zinc-400">Nobody has been costed yet.</p>
  }

  const widest = Math.max(...buckets.map((b) => b.count), 1)
  const total = buckets.reduce((n, b) => n + b.count, 0)

  return (
    <div>
      <div className="space-y-1">
        {buckets.map((bucket) => (
          <div key={bucket.label} className="flex items-center gap-3 text-xs">
            <div
              className={`w-20 shrink-0 text-right tabular-nums ${
                bucket.label === 'Nothing' ? 'text-amber-700' : 'text-zinc-600'
              }`}
            >
              {bucket.label}
            </div>
            <div className="h-3.5 flex-1 bg-zinc-100">
              <div
                className={`h-full ${
                  bucket.label === 'Nothing' ? 'bg-amber-400' : 'bg-zinc-400'
                }`}
                style={{ width: `${(bucket.count / widest) * 100}%` }}
              />
            </div>
            <div className="w-9 shrink-0 text-right tabular-nums text-zinc-900">
              {formatCount(bucket.count)}
            </div>
            <div className="w-11 shrink-0 text-right tabular-nums text-zinc-400">
              {formatPercent(total > 0 ? bucket.count / total : null, 0)}
            </div>
            <div className="w-14 shrink-0 text-right tabular-nums text-zinc-500">
              {bucket.cost > 0 ? formatCurrencyCompact(bucket.cost) : '·'}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
        What one person receives, not what the plan costs. Columns are headcount,
        share of the eligible population, and the money that bucket carries.
      </p>
    </div>
  )
}

/**
 * Where the money actually goes, ranked.
 *
 * Almost never where a practitioner expects. The generous cell paid to a few
 * top performers routinely costs less than the modest one paid to the large
 * middle, and a ranking makes that impossible to miss.
 */
export function CostDrivers({
  scenario,
  bandLabel,
}: {
  scenario: ScenarioResults
  bandLabel: (bandId: string) => string
}) {
  const drivers = topCostDrivers(scenario.matrixCells, 6)
  if (drivers.length === 0) {
    return <p className="text-xs text-zinc-400">This matrix spends nothing.</p>
  }

  const widest = Math.max(...drivers.map((d) => d.cost), 1)

  return (
    <div>
      <div className="space-y-1">
        {drivers.map((cell) => (
          <div
            key={`${cell.performanceRating}-${cell.bandId}`}
            className="flex items-center gap-3 text-xs"
          >
            <div className="w-44 shrink-0 truncate text-zinc-600">
              {cell.performanceRating}
              <span className="text-zinc-300"> · </span>
              {bandLabel(cell.bandId)}
            </div>
            <div className="h-3.5 flex-1 bg-zinc-100">
              <div
                className="h-full bg-zinc-400"
                style={{ width: `${(cell.cost / widest) * 100}%` }}
              />
            </div>
            <div className="w-10 shrink-0 text-right tabular-nums text-zinc-500">
              {formatPercent(cell.increasePercent, 1)}
            </div>
            <div className="w-8 shrink-0 text-right tabular-nums text-zinc-400">
              {formatCount(cell.headcount)}
            </div>
            <div className="w-14 shrink-0 text-right tabular-nums text-zinc-900">
              {formatCurrencyCompact(cell.cost)}
            </div>
            <div className="w-10 shrink-0 text-right tabular-nums text-zinc-400">
              {formatPercent(cell.shareOfTotal, 0)}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
        Columns are the cell percentage, its headcount, its cost, and its share of
        total spend. A cell high on this list is expensive because of how many
        people are in it, not because of how generous it is.
      </p>
    </div>
  )
}

/** What the spend bought, rather than what it cost. */
export function MovementSummary({
  scenario,
  bands,
}: {
  scenario: ScenarioResults
  bands: { id: string; label: string }[]
}) {
  const moved = bandMovement(scenario.results, bands as never)
  const perPoint = costPerCompaRatioPoint(scenario.budget, scenario.distribution)
  const shift = scenario.distribution.medianShift

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
      <Figure
        label="Median moved"
        value={shift === null ? '—' : `${shift > 0 ? '+' : ''}${(shift * 100).toFixed(1)} pts`}
        detail={`${formatCompaRatio(scenario.distribution.medianCompaRatioBefore)} → ${formatCompaRatio(scenario.distribution.medianCompaRatioAfter)}`}
      />
      <Figure
        label="Cost per point"
        term="cost-per-point"
        value={perPoint === null ? '—' : formatCurrencyCompact(perPoint)}
        detail="to move the median 0.01"
      />
      <Figure
        label="Moved up a band"
        value={formatCount(moved.movedUp)}
        detail={`${formatCount(moved.stayed)} stayed in theirs`}
      />
      <Figure
        label="Crossed the maximum"
        value={formatCount(scenario.distribution.countCrossedMaximum)}
        detail={
          scenario.budget.reducedByCap > 0
            ? `${formatCurrency(scenario.budget.reducedByCap)} withheld`
            : 'nothing withheld'
        }
      />
    </div>
  )
}

/**
 * The structure itself, including range penetration.
 *
 * Penetration has been calculated since the maths library was written and shown
 * nowhere until now. It answers a question compa-ratio cannot: two grades whose
 * people sit at the same compa-ratio can be at the floor of one range and two
 * thirds up another, because the ranges are different widths.
 */
export function StructureTable({
  grades,
  scenario,
}: {
  grades: Grade[]
  scenario: ScenarioResults
}) {
  const rows = structureRows(grades, scenario.results)

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="text-[11px] uppercase tracking-[0.08em] text-zinc-400">
            <th className="pb-2 pr-3 text-left font-medium">Grade</th>
            <th className="px-2 pb-2 text-right font-medium">Min</th>
            <th className="px-2 pb-2 text-right font-medium">Mid</th>
            <th className="px-2 pb-2 text-right font-medium">Max</th>
            <th className="px-2 pb-2 text-right font-medium">
              Spread<Explain term="range-spread" />
            </th>
            <th className="px-2 pb-2 text-right font-medium">
              Step<Explain term="midpoint-progression" />
            </th>
            <th className="px-2 pb-2 text-right font-medium">
              Med pen<Explain term="range-penetration" />
            </th>
            <th className="pb-2 pl-2 text-right font-medium">
              Overlap<Explain term="grade-overlap" />
            </th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {rows.map((row) => (
            <tr key={row.gradeId} className="border-t border-zinc-200">
              <td className="py-1.5 pr-3 text-zinc-900">
                {row.gradeName}
                <span className="ml-1.5 text-[10px] text-zinc-400">
                  {formatCount(row.headcount)}
                </span>
              </td>
              <td className="px-2 py-1.5 text-right text-zinc-500">
                {formatCurrency(row.min)}
              </td>
              <td className="px-2 py-1.5 text-right">{formatCurrency(row.mid)}</td>
              <td className="px-2 py-1.5 text-right text-zinc-500">
                {formatCurrency(row.max)}
              </td>
              <td className="px-2 py-1.5 text-right">{formatPercent(row.spread, 0)}</td>
              <td className="px-2 py-1.5 text-right text-zinc-500">
                {row.progressionFromBelow === null
                  ? '—'
                  : formatPercent(row.progressionFromBelow, 1)}
              </td>
              <td className="px-2 py-1.5 text-right">
                {row.medianPenetrationAfter === null
                  ? '—'
                  : formatPercent(row.medianPenetrationAfter, 0)}
              </td>
              <td className="py-1.5 pl-2 text-right text-zinc-500">
                {row.overlapWithBelow === null
                  ? '—'
                  : formatPercent(row.overlapWithBelow, 0)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
        Med pen is where this grade's people sit across the whole width of their
        range after the cycle: 0% is the minimum, 100% the maximum. It answers a
        question compa-ratio cannot, because a wide range and a narrow one can
        hold the same compa-ratio at very different positions. Overlap is how far
        this grade reaches back into the one below it.
      </p>
    </div>
  )
}

function Figure({
  label,
  value,
  detail,
  term,
}: {
  label: string
  value: string
  detail?: string
  term?: Parameters<typeof Explain>[0]['term']
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.08em] text-zinc-400">
        {label}
        {term ? <Explain term={term} /> : null}
      </div>
      <div className="mt-1 text-2xl font-medium tabular-nums">{value}</div>
      {detail ? (
        <div className="mt-0.5 text-xs tabular-nums text-zinc-500">{detail}</div>
      ) : null}
    </div>
  )
}

/** Small helper so panels can say what question they answer. */
export function PanelIntro({ children }: { children: string }) {
  return <p className="mb-2.5 text-[11px] leading-relaxed text-zinc-500">{children}</p>
}

export { pluralize }
