import type { BudgetSummary } from '../lib/budget'
import type { OverMaxMode } from '../types/domain'
import {
  formatCurrency,
  formatCurrencyCompact,
  formatCurrencySigned,
  formatPercent,
  formatPercentSigned,
  pluralize,
} from '../lib/format'

const MODE_LABEL: Record<OverMaxMode, string> = {
  capAtMax: 'Capped at maximum',
  allowOverMax: 'Allowed over maximum',
  lumpSum: 'Lump sum over maximum',
}

/**
 * The headline cost figures.
 *
 * Spend is measured on total cash, because merit budgets are approved as cash.
 * Base build sits underneath it, because that is the number that compounds into
 * next year's payroll. They diverge only in lump sum mode, which is exactly
 * where a single cost figure would mislead.
 */
export function CostPanel({
  budget,
  overMaxMode,
  cappedCount,
}: {
  budget: BudgetSummary
  overMaxMode: OverMaxMode
  cappedCount: number
}) {
  const overBudget =
    budget.varianceToTargetDollars !== null && budget.varianceToTargetDollars > 0
  const varianceTone = overBudget ? 'text-rose-700' : 'text-zinc-900'

  return (
    <div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
        <figure>
          <figcaption className="text-[11px] uppercase tracking-[0.08em] text-zinc-400">
            Spend
          </figcaption>
          <div className="mt-1 text-3xl font-medium tabular-nums">
            {formatPercent(budget.budgetSpendPercent)}
          </div>
          <div className="mt-0.5 text-xs text-zinc-500 tabular-nums">
            target {formatPercent(budget.targetBudgetPercent)}
          </div>
        </figure>

        <figure>
          <figcaption className="text-[11px] uppercase tracking-[0.08em] text-zinc-400">
            Cost
          </figcaption>
          <div className="mt-1 text-3xl font-medium tabular-nums">
            {formatCurrencyCompact(budget.totalSpend)}
          </div>
          <div className="mt-0.5 text-xs text-zinc-500 tabular-nums">
            {budget.lumpSumCost > 0
              ? `${formatCurrencyCompact(budget.baseBuildCost)} to base`
              : formatCurrency(budget.totalSpend)}
          </div>
        </figure>

        <figure>
          <figcaption className="text-[11px] uppercase tracking-[0.08em] text-zinc-400">
            Variance
          </figcaption>
          <div className={`mt-1 text-3xl font-medium tabular-nums ${varianceTone}`}>
            {formatCurrencySigned(budget.varianceToTargetDollars)}
          </div>
          <div className={`mt-0.5 text-xs tabular-nums ${overBudget ? 'text-rose-600' : 'text-zinc-500'}`}>
            {formatPercentSigned(budget.varianceToTargetPercent)} against target
          </div>
        </figure>

        <figure>
          <figcaption className="text-[11px] uppercase tracking-[0.08em] text-zinc-400">
            Eligible payroll
          </figcaption>
          <div className="mt-1 text-3xl font-medium tabular-nums">
            {formatCurrencyCompact(budget.eligiblePayroll)}
          </div>
          <div className="mt-0.5 text-xs text-zinc-500 tabular-nums">
            {pluralize(budget.eligibleHeadcount, 'employee')}
          </div>
        </figure>
      </div>

      {/* What the over-maximum mode did, rather than merely which one is on. */}
      <div className="mt-5 flex flex-wrap items-baseline gap-x-6 gap-y-1 border-t border-zinc-200 pt-3 text-xs">
        <span className="text-zinc-400">{MODE_LABEL[overMaxMode]}</span>

        {budget.reducedByCap > 0 ? (
          <span className="text-amber-700">
            {formatCurrency(budget.reducedByCap)} withheld at the maximum
            {cappedCount > 0 ? `, affecting ${pluralize(cappedCount, 'employee')}` : ''}
          </span>
        ) : (
          <span className="text-zinc-400">nothing withheld at the maximum</span>
        )}

        {budget.lumpSumCost > 0 ? (
          <span className="text-zinc-600">
            {formatCurrency(budget.lumpSumCost)} paid as lump sums, not built into base
          </span>
        ) : null}

        {budget.ineligibleHeadcount > 0 ? (
          <span className="text-zinc-400">
            {pluralize(budget.ineligibleHeadcount, 'employee')} ineligible
          </span>
        ) : null}

        {budget.excludedHeadcount > 0 ? (
          <span className="text-amber-700">
            {pluralize(budget.excludedHeadcount, 'employee')} could not be costed
          </span>
        ) : null}
      </div>
    </div>
  )
}
