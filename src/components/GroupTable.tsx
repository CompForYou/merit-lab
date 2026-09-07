import { useState } from 'react'
import type { GroupRow } from '../lib/grouping'
import { MIN_GROUP_SIZE } from '../lib/grouping'
import {
  formatCompaRatio,
  formatCount,
  formatCurrencyCompact,
  formatPercent,
  NO_VALUE,
} from '../lib/format'

type SortKey =
  | 'label'
  | 'headcount'
  | 'eligiblePayroll'
  | 'totalSpend'
  | 'spendPercent'
  | 'averageIncreasePercent'
  | 'medianCompaRatioAfter'

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: 'label', label: 'Group', numeric: false },
  { key: 'headcount', label: 'N', numeric: true },
  { key: 'eligiblePayroll', label: 'Payroll', numeric: true },
  { key: 'totalSpend', label: 'Cost', numeric: true },
  { key: 'spendPercent', label: 'Spend', numeric: true },
  { key: 'averageIncreasePercent', label: 'Avg increase', numeric: true },
  { key: 'medianCompaRatioAfter', label: 'Med CR after', numeric: true },
]

/**
 * Spend broken down by whatever column the user grouped on.
 *
 * The first question after "what does this cost" is "who spent it", and until
 * now the tool could only answer that by grade. Any column in the pasted file
 * works here, which is what makes the answer useful: budgets are allocated to
 * departments and divisions, not to salary grades.
 */
export function GroupTable({
  rows,
  highlightedKey,
  onHighlight,
  isDemographic,
}: {
  rows: GroupRow[]
  highlightedKey: string | null
  onHighlight: (key: string | null) => void
  isDemographic: boolean
}) {
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({
    key: 'totalSpend',
    descending: true,
  })

  const sorted = [...rows].sort((a, b) => {
    const column = COLUMNS.find((c) => c.key === sort.key)!
    let comparison: number
    if (!column.numeric) {
      comparison = String(a[sort.key]).localeCompare(String(b[sort.key]))
    } else {
      // Suppressed values sort last in either direction: they are absent, not
      // small, and letting them sit at one end implies an ordering they do not
      // have.
      const av = a[sort.key] as number | null
      const bv = b[sort.key] as number | null
      if (av === null && bv === null) comparison = 0
      else if (av === null) return 1
      else if (bv === null) return -1
      else comparison = av - bv
    }
    return sort.descending ? -comparison : comparison
  })

  const suppressedCount = rows.filter((r) => r.suppressed).length

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="text-[11px] uppercase tracking-[0.08em] text-zinc-400">
              {COLUMNS.map((column) => (
                <th
                  key={column.key}
                  className={`pb-2 font-medium ${
                    column.numeric ? 'px-2 text-right' : 'pr-3 text-left'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setSort((current) =>
                        current.key === column.key
                          ? { key: column.key, descending: !current.descending }
                          : { key: column.key, descending: column.numeric },
                      )
                    }
                    className="uppercase tracking-[0.08em] hover:text-zinc-700"
                  >
                    {column.label}
                    {sort.key === column.key ? (
                      <span className="ml-0.5 text-zinc-500">
                        {sort.descending ? '↓' : '↑'}
                      </span>
                    ) : null}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {sorted.map((row) => {
              const highlighted = row.key === highlightedKey
              return (
                <tr
                  key={row.key}
                  onMouseEnter={() => onHighlight(row.key)}
                  onMouseLeave={() => onHighlight(null)}
                  className={`cursor-default border-t border-zinc-200 ${
                    highlighted ? 'bg-zinc-100' : ''
                  }`}
                >
                  <td className="py-1.5 pr-3 text-zinc-900">
                    {row.label}
                    {row.suppressed ? (
                      <span
                        className="ml-1.5 text-[10px] text-amber-700"
                        title={`Fewer than ${MIN_GROUP_SIZE} costed employees, so averages are withheld`}
                      >
                        withheld
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 py-1.5 text-right">{formatCount(row.headcount)}</td>
                  <td className="px-2 py-1.5 text-right text-zinc-500">
                    {formatCurrencyCompact(row.eligiblePayroll)}
                  </td>
                  <td className="px-2 py-1.5 text-right text-zinc-900">
                    {formatCurrencyCompact(row.totalSpend)}
                  </td>
                  <td className="px-2 py-1.5 text-right text-zinc-500">
                    {formatPercent(row.spendPercent)}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {row.averageIncreasePercent === null
                      ? NO_VALUE
                      : formatPercent(row.averageIncreasePercent)}
                  </td>
                  <td className="px-2 py-1.5 text-right text-zinc-500">
                    {formatCompaRatio(row.medianCompaRatioAfter)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
        Spend is this group's cost over its own eligible payroll, so it is
        salary-weighted. Avg increase is the unweighted mean of what an individual
        received, which is the figure that answers "what did a person here
        typically get". Hovering a row highlights that group in the plot above.
        {suppressedCount > 0 ? (
          <>
            {' '}
            {suppressedCount === 1 ? 'One group has' : `${suppressedCount} groups have`}{' '}
            fewer than {MIN_GROUP_SIZE} costed employees; counts are shown but averages
            are withheld, because an average over that few people is unstable and can
            expose an individual.
          </>
        ) : null}
      </p>

      {isDemographic ? (
        <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-900">
          This is a description of the data, not a finding. An unadjusted gap
          between groups is not evidence that anyone has been treated unfairly: it
          reflects whatever differences already exist in grade, role, tenure and
          rating. A defensible pay equity analysis controls for those, and Merit Lab
          does not. Use this to decide whether the question is worth asking
          properly, not to answer it.
        </p>
      ) : null}
    </div>
  )
}
