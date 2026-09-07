import type { BudgetSummary } from '../lib/budget'
import type { OverMaxMode } from '../types/domain'
import {
  formatCurrencyCompact,
  formatCurrencySigned,
  formatPercent,
  formatPercentSigned,
} from '../lib/format'

const MODE_LABEL: Record<OverMaxMode, string> = {
  capAtMax: 'capped at max',
  allowOverMax: 'allowed over max',
  lumpSum: 'lump sum over max',
}

/**
 * The four figures that must never leave the screen.
 *
 * The spec's governing rule is that a user should never have to switch views to
 * see what their change did. The consequences column is taller than a viewport,
 * so scrolling to read compression would otherwise carry the cost away with it.
 * This strip is pinned to the top and answers "what is this costing" from any
 * scroll position, including the narrow layout where the sticky control column
 * cannot help.
 */
export function HeadlineStrip({
  budget,
  overMaxMode,
  planName,
}: {
  budget: BudgetSummary
  overMaxMode: OverMaxMode
  planName: string
}) {
  const overBudget =
    budget.varianceToTargetDollars !== null && budget.varianceToTargetDollars > 0

  return (
    <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-xs tabular-nums">
      <Figure
        label="Spend"
        value={formatPercent(budget.budgetSpendPercent)}
        detail={`target ${formatPercent(budget.targetBudgetPercent)}`}
      />
      <Figure label="Cost" value={formatCurrencyCompact(budget.totalSpend)} />
      <Figure
        label="Variance"
        value={formatCurrencySigned(budget.varianceToTargetDollars)}
        detail={formatPercentSigned(budget.varianceToTargetPercent)}
        tone={overBudget ? 'over' : 'neutral'}
      />
      <span className="text-zinc-400">
        {planName} · {MODE_LABEL[overMaxMode]}
      </span>
    </div>
  )
}

function Figure({
  label,
  value,
  detail,
  tone = 'neutral',
}: {
  label: string
  value: string
  detail?: string
  tone?: 'neutral' | 'over'
}) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-[10px] uppercase tracking-[0.08em] text-zinc-400">
        {label}
      </span>
      <span
        className={`text-sm font-medium ${
          tone === 'over' ? 'text-rose-700' : 'text-zinc-900'
        }`}
      >
        {value}
      </span>
      {detail ? <span className="text-[10px] text-zinc-400">{detail}</span> : null}
    </span>
  )
}
