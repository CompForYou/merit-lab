import type { PopulationProfile } from '../lib/population-profile'
import type { BudgetSummary } from '../lib/budget'
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
 * Every grade: where its people sit in the range, and what the matrix spends
 * on them.
 *
 * Spend percentage per grade is the column worth reading. A matrix that pays
 * more at low compa-ratios spends unevenly by grade on purpose, and this is
 * where that shows up as money rather than as intent.
 */
export function GradeTable({
  profile,
  grades,
  byGrade,
}: {
  profile: PopulationProfile
  grades: Grade[]
  byGrade: Map<string, BudgetSummary>
}) {
  const gradeById = new Map(grades.map((g) => [g.id, g]))

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="text-[11px] uppercase tracking-[0.08em] text-zinc-400">
            <th className="pb-2 pr-3 text-left font-medium">Grade</th>
            <th className="px-2 pb-2 text-right font-medium">N</th>
            <th className="px-2 pb-2 text-right font-medium">Mid</th>
            <th className="px-2 pb-2 text-right font-medium">Med CR</th>
            <th className="px-2 pb-2 text-right font-medium">Payroll</th>
            <th className="px-2 pb-2 text-right font-medium">Cost</th>
            <th className="px-2 pb-2 text-right font-medium">Spend</th>
            <th className="pb-2 pl-2 text-right font-medium">Out</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {profile.byGrade.map((row) => {
            const grade = gradeById.get(row.gradeId)
            const budget = byGrade.get(row.gradeId)
            const outOfRange = row.belowMinimum + row.aboveMaximum
            const spread = grade ? calculateRangeSpread(grade.min, grade.max) : null

            return (
              <tr key={row.gradeId} className="border-t border-zinc-200">
                <td className="py-1.5 pr-3 text-zinc-900">{row.gradeName}</td>
                <td className="px-2 py-1.5 text-right">{formatCount(row.headcount)}</td>
                <td
                  className="px-2 py-1.5 text-right"
                  title={
                    grade
                      ? `${formatCurrency(grade.min)} to ${formatCurrency(grade.max)}, ${formatPercent(spread, 0)} spread`
                      : undefined
                  }
                >
                  {formatCurrency(grade?.mid)}
                </td>
                <td className="px-2 py-1.5 text-right">
                  {formatCompaRatio(row.medianCompaRatio)}
                </td>
                <td className="px-2 py-1.5 text-right text-zinc-500">
                  {formatCurrencyCompact(row.payroll)}
                </td>
                <td className="px-2 py-1.5 text-right text-zinc-900">
                  {budget && budget.totalSpend > 0
                    ? formatCurrencyCompact(budget.totalSpend)
                    : '·'}
                </td>
                <td className="px-2 py-1.5 text-right text-zinc-500">
                  {formatPercent(budget?.budgetSpendPercent ?? null)}
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
      <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
        Med CR is the median compa-ratio, on full-time equivalent salary. Payroll and
        cost are actual pay. Spend is cost as a percentage of that grade's eligible
        payroll, so it will not match the overall figure. Out counts employees
        outside their own range in either direction; hover for the split.
      </p>
    </div>
  )
}
