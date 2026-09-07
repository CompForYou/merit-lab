import type { EmployeeMeritResult } from '../lib/merit-increase'
import type { Grade } from '../types/domain'
import type { TermId } from '../lib/glossary'
import {
  formatCompaRatio,
  formatCurrency,
  formatPercent,
  pluralize,
} from '../lib/format'
import { Explain } from './Explain'

/** How many rows to show before collapsing to a count. */
const VISIBLE_ROWS = 10

/**
 * The employees this cycle leaves outside their range.
 *
 * A list of people rather than a count, because the next thing a practitioner
 * does with this number is go and look at who is in it.
 */
export function OutOfRangeList({
  title,
  results,
  grades,
  emptyMessage,
  tone,
}: {
  title: string
  results: EmployeeMeritResult[]
  grades: Grade[]
  emptyMessage: string
  tone: 'over' | 'under'
}) {
  const gradeById = new Map(grades.map((g) => [g.id, g]))
  const accent = tone === 'over' ? 'text-rose-700' : 'text-amber-700'

  if (results.length === 0) {
    return <p className="text-xs text-zinc-400">{emptyMessage}</p>
  }

  const shown = results.slice(0, VISIBLE_ROWS)
  const remaining = results.length - shown.length

  return (
    <div>
      <p className={`mb-2 text-xs ${accent}`}>
        {pluralize(results.length, 'employee')} {title}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="text-[11px] uppercase tracking-[0.08em] text-zinc-400">
              <th className="pb-1.5 pr-3 text-left font-medium">Employee</th>
              <th className="px-2 pb-1.5 text-left font-medium">Grade</th>
              <th className="px-2 pb-1.5 text-right font-medium">Salary</th>
              <th className="px-2 pb-1.5 text-right font-medium">New</th>
              <th className="px-2 pb-1.5 text-right font-medium">Bound</th>
              <th className="pb-1.5 pl-2 text-right font-medium">CR</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {shown.map((r) => {
              const grade = gradeById.get(r.gradeId)
              const bound =
                tone === 'over' ? grade?.max : grade?.min
              return (
                <tr key={r.employeeId} className="border-t border-zinc-200">
                  <td className="py-1 pr-3 text-zinc-900">{r.employeeId}</td>
                  <td className="px-2 py-1 text-zinc-500">
                    {grade?.name ?? r.gradeId}
                  </td>
                  <td className="px-2 py-1 text-right text-zinc-500">
                    {formatCurrency(r.baseSalary / r.fte)}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {formatCurrency(r.newSalary / r.fte)}
                  </td>
                  <td className="px-2 py-1 text-right text-zinc-400">
                    {formatCurrency(bound)}
                  </td>
                  <td className={`py-1 pl-2 text-right ${accent}`}>
                    {formatCompaRatio(r.newCompaRatio)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {remaining > 0 ? (
        <p className="mt-1.5 text-[11px] text-zinc-400">and {remaining} more</p>
      ) : null}
      <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
        Salaries shown on a full-time equivalent basis, so they compare directly
        with the range bound.
        <Explain term="fte-handling" />
      </p>
    </div>
  )
}

/** The distribution shift: where the population was, and where it ends up. */
export function DistributionShift({
  medianBefore,
  medianAfter,
  meanBefore,
  meanAfter,
}: {
  medianBefore: number | null
  medianAfter: number | null
  meanBefore: number | null
  meanAfter: number | null
}) {
  const shift =
    medianBefore !== null && medianAfter !== null ? medianAfter - medianBefore : null

  return (
    <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3">
      <ShiftFigure
        label="Median compa-ratio"
        term="compa-ratio"
        before={medianBefore}
        after={medianAfter}
      />
      <ShiftFigure label="Mean compa-ratio" before={meanBefore} after={meanAfter} />
      <div>
        <div className="text-[11px] uppercase tracking-[0.08em] text-zinc-400">
          Median shift
        </div>
        <div className="mt-1 text-2xl font-medium tabular-nums">
          {shift === null
            ? '—'
            : `${shift > 0 ? '+' : ''}${shift.toFixed(3)}`}
        </div>
        <div className="mt-0.5 text-xs text-zinc-500">
          {shift === null ? '' : formatPercent(shift, 1) + ' of a midpoint'}
        </div>
      </div>
    </div>
  )
}

function ShiftFigure({
  label,
  term,
  before,
  after,
}: {
  label: string
  term?: TermId
  before: number | null
  after: number | null
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.08em] text-zinc-400">
        {label}
        {term ? <Explain term={term} /> : null}
      </div>
      <div className="mt-1 flex items-baseline gap-2 tabular-nums">
        <span className="text-lg text-zinc-400">{formatCompaRatio(before)}</span>
        <span className="text-zinc-300">→</span>
        <span className="text-2xl font-medium">{formatCompaRatio(after)}</span>
      </div>
    </div>
  )
}
