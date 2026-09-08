import { useRef } from 'react'
import type { BudgetSummary } from '../lib/budget'
import {
  formatCurrencyCompact,
  formatCurrencySigned,
  formatPercent,
  formatPercentSigned,
} from '../lib/format'
import { ActionButton } from './PasteArea'

export interface PlanSlot {
  name: string
  budget: BudgetSummary | null
}

/**
 * Two plans, held at once, swapped in place.
 *
 * Flicking between two states in the same position reads better than two panels
 * side by side, because the eye detects change far better than it compares. The
 * numbers stay where they are; only their values move.
 */
export function ScenarioBar({
  slots,
  activeIndex,
  onSelect,
  onRename,
  onCopyToOther,
  onExportScenario,
  onExportCsv,
  onExportBrief,
  onImportScenario,
  canExport,
}: {
  slots: [PlanSlot, PlanSlot]
  activeIndex: 0 | 1
  onSelect: (index: 0 | 1) => void
  onRename: (index: 0 | 1, name: string) => void
  onCopyToOther: () => void
  onExportScenario: () => void
  onExportCsv: () => void
  onExportBrief: () => void
  onImportScenario: (file: File) => void
  canExport: boolean
}) {
  const fileRef = useRef<HTMLInputElement>(null)

  const other = slots[activeIndex === 0 ? 1 : 0]
  const active = slots[activeIndex]
  const delta =
    active.budget && other.budget
      ? {
          dollars: active.budget.totalSpend - other.budget.totalSpend,
          points:
            (active.budget.budgetSpendPercent ?? 0) -
            (other.budget.budgetSpendPercent ?? 0),
        }
      : null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-stretch gap-2">
        {slots.map((slot, index) => {
          const isActive = index === activeIndex
          return (
            <button
              key={index}
              type="button"
              onClick={() => onSelect(index as 0 | 1)}
              className={`flex-1 rounded border px-3 py-2 text-left transition ${
                isActive
                  ? 'border-zinc-800 bg-white'
                  : 'border-zinc-200 bg-transparent hover:border-zinc-300'
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className={`text-[11px] uppercase tracking-[0.08em] ${
                    isActive ? 'text-zinc-900' : 'text-zinc-400'
                  }`}
                >
                  {index === 0 ? 'A' : 'B'} · {slot.name}
                </span>
              </div>
              <div
                className={`mt-0.5 text-lg tabular-nums ${
                  isActive ? 'text-zinc-900' : 'text-zinc-400'
                }`}
              >
                {slot.budget ? formatPercent(slot.budget.budgetSpendPercent) : '—'}
              </div>
              <div className="text-[11px] tabular-nums text-zinc-400">
                {slot.budget ? formatCurrencyCompact(slot.budget.totalSpend) : ''}
              </div>
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px]">
        <span className="text-zinc-400">
          Press <kbd className="rounded border border-zinc-300 px-1 font-mono">`</kbd> to
          swap
        </span>
        {delta && (delta.dollars !== 0 || delta.points !== 0) ? (
          <span className="tabular-nums text-zinc-600">
            {slots[activeIndex].name} costs{' '}
            <span className="text-zinc-900">
              {formatCurrencySigned(delta.dollars)}
            </span>{' '}
            ({formatPercentSigned(delta.points)}) against {other.name}
          </span>
        ) : delta ? (
          <span className="text-zinc-400">both plans cost the same</span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-[11px] text-zinc-400">
          Name
          <input
            type="text"
            value={active.name}
            onChange={(e) => onRename(activeIndex, e.target.value)}
            aria-label="Scenario name"
            className="w-36 rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-800 focus:border-zinc-500 focus:outline-none"
          />
        </label>
        <ActionButton onClick={onCopyToOther}>
          {`Copy to ${activeIndex === 0 ? 'B' : 'A'}`}
        </ActionButton>
        <ActionButton onClick={onExportScenario} disabled={!canExport}>
          Save scenario
        </ActionButton>
        <ActionButton onClick={onExportCsv} disabled={!canExport}>
          Export results
        </ActionButton>
        <ActionButton onClick={onExportBrief} disabled={!canExport}>
          One-page brief
        </ActionButton>
        <ActionButton onClick={() => fileRef.current?.click()}>
          Load scenario
        </ActionButton>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-label="Load a scenario file"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onImportScenario(file)
            e.target.value = ''
          }}
        />
      </div>

      <p className="text-[11px] leading-relaxed text-zinc-500">
        A saved scenario contains your population: salaries, ratings and
        identifiers. It is written straight to this device and is never uploaded.
        Treat the file the way you would treat the spreadsheet it came from.
      </p>
    </div>
  )
}
