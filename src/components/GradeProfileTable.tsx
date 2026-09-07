import type { PopulationProfile } from '../lib/population-profile'
import type { Grade } from '../types/domain'
import {
  formatCompaRatio,
  formatCount,
  formatCurrency,
  formatCurrencyCompact,
  formatPercent,
} from '../lib/format'
import { calculateRangeSpread } from '../lib/range-spread'

/**
 * The population laid against the structure, one row per grade.
 *
 * This is the table a practitioner reads before trusting anything downstream:
 * if the headcounts or the medians look wrong here, the data is wrong, and no
 * merit modelling built on top of it is worth reading.
 */
export function GradeProfileTable({
  profile,
  grades,
}: {
  profile: PopulationProfile
  grades: Grade[]
}) {
  const gradeById = new Map(grades.map((g) => [g.id, g]))

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="text-zinc-400 text-[11px] uppercase tracking-[0.08em]">
            <th className="text-left font-medium pb-2 pr-3">Grade</th>
            <th className="text-right font-medium pb-2 px-2">N</th>
            <th className="text-right font-medium pb-2 px-2">Min</th>
            <th className="text-right font-medium pb-2 px-2">Mid</th>
            <th className="text-right font-medium pb-2 px-2">Max</th>
            <th className="text-right font-medium pb-2 px-2">Spread</th>
            <th className="text-right font-medium pb-2 px-2">Med CR</th>
            <th className="text-right font-medium pb-2 px-2">Payroll</th>
            <th className="text-right font-medium pb-2 pl-2">Out</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {profile.byGrade.map((row) => {
            const grade = gradeById.get(row.gradeId)
            const outOfRange = row.belowMinimum + row.aboveMaximum
            return (
              <tr key={row.gradeId} className="border-t border-zinc-200">
                <td className="py-1.5 pr-3 text-zinc-900">{row.gradeName}</td>
                <td className="py-1.5 px-2 text-right">{formatCount(row.headcount)}</td>
                <td className="py-1.5 px-2 text-right text-zinc-500">
                  {formatCurrency(grade?.min)}
                </td>
                <td className="py-1.5 px-2 text-right">{formatCurrency(grade?.mid)}</td>
                <td className="py-1.5 px-2 text-right text-zinc-500">
                  {formatCurrency(grade?.max)}
                </td>
                <td className="py-1.5 px-2 text-right text-zinc-500">
                  {formatPercent(
                    grade ? calculateRangeSpread(grade.min, grade.max) : null,
                    0,
                  )}
                </td>
                <td className="py-1.5 px-2 text-right">
                  {formatCompaRatio(row.medianCompaRatio)}
                </td>
                <td className="py-1.5 px-2 text-right text-zinc-500">
                  {formatCurrencyCompact(row.payroll)}
                </td>
                <td
                  className={`py-1.5 pl-2 text-right ${
                    outOfRange > 0 ? 'text-amber-700' : 'text-zinc-300'
                  }`}
                  title={
                    outOfRange > 0
                      ? `${row.belowMinimum} below minimum, ${row.aboveMaximum} above maximum`
                      : undefined
                  }
                >
                  {outOfRange > 0 ? formatCount(outOfRange) : '·'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-zinc-400">
        Med CR is the median compa-ratio, on full-time equivalent salary. Payroll
        is actual pay. Out counts employees outside their own range in either
        direction.
      </p>
    </div>
  )
}
