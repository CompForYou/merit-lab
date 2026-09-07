import { useState } from 'react'
import type { MeritMatrix } from '../types/domain'
import type { MatrixCellTotals } from '../lib/matrix-cells'
import { findCell } from '../lib/matrix-cells'
import { readMatrixCell } from '../lib/matrix-edit'
import { PercentInput } from './PercentInput'
import {
  formatCount,
  formatCurrency,
  formatCurrencyCompact,
  formatPercent,
  pluralize,
} from '../lib/format'
import { Explain } from './Explain'

/**
 * The merit matrix: rating rows, compa-ratio band columns, an increase
 * percentage in every cell.
 *
 * Each cell carries two numbers. The percentage is the one the user sets; the
 * dollar cost underneath is the one that changes their mind. A generous
 * percentage paid to a handful of top performers routinely costs less than a
 * modest one paid to the large middle of the population, and a matrix showing
 * only percentages hides that completely.
 *
 * Editing is inline. There are no dialogs, no Apply button, and no saving:
 * every keystroke reprices the population before the key is released.
 */
export function MeritMatrixGrid({
  matrix,
  totals,
  onCellChange,
  onBoundaryChange,
  onRemoveRating,
  onRenameRating,
  onSplitBand,
  onRemoveBand,
  hovered,
  onHoverChange,
}: {
  matrix: MeritMatrix
  totals: MatrixCellTotals
  onCellChange: (rating: string, bandId: string, percent: number) => void
  onBoundaryChange: (boundaryIndex: number, value: number) => void
  onRemoveRating: (rating: string) => void
  onRenameRating: (from: string, to: string) => void
  /** Split the band at this index in two, at the given compa-ratio. */
  onSplitBand: (index: number, value: number) => void
  onRemoveBand: (index: number) => void
  /** Lifted so the dot plot can dim everyone outside the hovered cell. */
  hovered: { rating: string; bandId: string } | null
  onHoverChange: (next: { rating: string; bandId: string } | null) => void
}) {
  const hoveredCell = hovered
    ? findCell(totals, hovered.rating, hovered.bandId)
    : undefined

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="w-32 pb-2 pr-2 text-left align-bottom text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">
                Rating
              </th>
              {matrix.bands.map((band, index) => (
                <th key={band.id} className="group/band px-1 pb-2 align-bottom">
                  <div className="flex items-center justify-center gap-0.5">
                    <span className="text-[11px] font-medium text-zinc-500">
                      {band.label}
                    </span>
                    <span className="flex opacity-0 transition group-hover/band:opacity-100">
                      <button
                        type="button"
                        aria-label={`Split the ${band.label} band`}
                        title="Split this band in two"
                        onClick={() => onSplitBand(index, splitPointFor(band))}
                        className="px-0.5 text-[10px] text-zinc-300 hover:text-zinc-700"
                      >
                        ÷
                      </button>
                      {matrix.bands.length > 1 ? (
                        <button
                          type="button"
                          aria-label={`Remove the ${band.label} band`}
                          title="Remove this band, merging it into its neighbour"
                          onClick={() => onRemoveBand(index)}
                          className="px-0.5 text-[10px] text-zinc-300 hover:text-rose-600"
                        >
                          ×
                        </button>
                      ) : null}
                    </span>
                  </div>
                  <BoundaryEditor
                    lowerBound={band.lowerBound}
                    onChange={(value) => onBoundaryChange(index, value)}
                    editable={index > 0}
                  />
                </th>
              ))}
              <th className="w-24 pb-2 pl-2 text-right align-bottom text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">
                Row cost<Explain term="cell-cost" />
              </th>
            </tr>
          </thead>

          <tbody>
            {matrix.ratings.map((rating) => (
              <tr key={rating} className="group border-t border-zinc-200">
                <td className="py-1 pr-2 align-middle">
                  <div className="flex items-center gap-1">
                    <RatingLabel
                      rating={rating}
                      onRename={(next) => onRenameRating(rating, next)}
                    />
                    <button
                      type="button"
                      onClick={() => onRemoveRating(rating)}
                      aria-label={`Remove the ${rating} row`}
                      title={`Remove the ${rating} row`}
                      className="ml-auto shrink-0 px-1 text-zinc-300 opacity-0 transition group-hover:opacity-100 hover:text-rose-600"
                    >
                      ×
                    </button>
                  </div>
                  <div className="text-[10px] text-zinc-400 tabular-nums">
                    {formatCount(totals.headcountByRating.get(rating) ?? 0)}
                  </div>
                </td>

                {matrix.bands.map((band) => {
                  const cell = findCell(totals, rating, band.id)
                  const isHovered =
                    hovered?.rating === rating && hovered?.bandId === band.id
                  return (
                    <td
                      key={band.id}
                      onMouseEnter={() => onHoverChange({ rating, bandId: band.id })}
                      onMouseLeave={() => onHoverChange(null)}
                      className={`border-l border-zinc-100 px-1 py-1 align-top ${
                        isHovered ? 'bg-zinc-100' : ''
                      }`}
                    >
                      <div className="flex items-baseline justify-end gap-0.5">
                        <PercentInput
                          label={`${rating}, ${band.label}`}
                          value={readMatrixCell(matrix, rating, band.id)}
                          onChange={(next) => onCellChange(rating, band.id, next)}
                          className="text-sm text-zinc-900"
                        />
                        <span className="text-[10px] text-zinc-400">%</span>
                      </div>
                      <div className="text-right text-[10px] tabular-nums text-zinc-400">
                        {cell && cell.headcount > 0
                          ? formatCurrencyCompact(cell.cost)
                          : '·'}
                      </div>
                    </td>
                  )
                })}

                <td className="border-l border-zinc-200 py-1 pl-2 text-right align-top">
                  <div className="text-sm tabular-nums text-zinc-700">
                    {formatCurrencyCompact(totals.byRating.get(rating) ?? 0)}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>

          <tfoot>
            <tr className="border-t-2 border-zinc-300">
              <td className="py-1.5 pr-2 text-[11px] uppercase tracking-[0.08em] text-zinc-400">
                Band cost<Explain term="compa-ratio-band" />
              </td>
              {matrix.bands.map((band) => (
                <td
                  key={band.id}
                  className="border-l border-zinc-100 px-1 py-1.5 text-right align-top"
                >
                  <div className="text-xs tabular-nums text-zinc-700">
                    {formatCurrencyCompact(totals.byBand.get(band.id) ?? 0)}
                  </div>
                  <div className="text-[10px] tabular-nums text-zinc-400">
                    {formatCount(totals.headcountByBand.get(band.id) ?? 0)}
                  </div>
                </td>
              ))}
              <td className="border-l border-zinc-200 py-1.5 pl-2 text-right align-top">
                <div className="text-sm font-medium tabular-nums text-zinc-900">
                  {formatCurrencyCompact(totals.totalCost)}
                </div>
                <div className="text-[10px] tabular-nums text-zinc-400">
                  {formatCount(totals.totalHeadcount)}
                </div>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* A fixed-height readout, so hovering never moves the table underneath. */}
      <div className="mt-2 h-8 border-t border-zinc-100 pt-2 text-[11px]">
        {hoveredCell ? (
          <span className="text-zinc-600">
            <span className="text-zinc-900">
              {hoveredCell.performanceRating} ·{' '}
              {matrix.bands.find((b) => b.id === hoveredCell.bandId)?.label}
            </span>
            {'  '}
            {hoveredCell.headcount > 0 ? (
              <>
                {pluralize(hoveredCell.headcount, 'employee')} ·{' '}
                {formatCurrencyCompact(hoveredCell.eligiblePayroll)} eligible payroll ·{' '}
                {formatPercent(hoveredCell.increasePercent)} costs{' '}
                <span className="text-zinc-900">
                  {formatCurrency(hoveredCell.cost)}
                </span>
              </>
            ) : (
              <>no employees in this cell</>
            )}
          </span>
        ) : (
          <span className="text-zinc-300">
            Hover a cell for its headcount, eligible payroll and cost.
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * The lower bound of a band, editable in place.
 *
 * Moving it moves the neighbouring band's upper bound at the same time, so the
 * bands stay contiguous and no compa-ratio can fall through a gap.
 */
function BoundaryEditor({
  lowerBound,
  onChange,
  editable,
}: {
  lowerBound: number | null
  onChange: (value: number) => void
  editable: boolean
}) {
  const [draft, setDraft] = useState<string | null>(null)

  if (!editable || lowerBound === null) {
    return <div className="mt-0.5 h-5 text-[10px] text-zinc-300">—</div>
  }

  return (
    <div className="mt-0.5">
      <input
        type="text"
        inputMode="decimal"
        aria-label={`Lower boundary of the ${lowerBound.toFixed(2)} band`}
        value={draft ?? lowerBound.toFixed(2)}
        onChange={(e) => {
          const raw = e.target.value
          if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return
          setDraft(raw)
          const parsed = Number(raw)
          if (raw !== '' && Number.isFinite(parsed)) onChange(parsed)
        }}
        onFocus={(e) => {
          setDraft(lowerBound.toFixed(2))
          e.target.select()
        }}
        onBlur={() => setDraft(null)}
        className="h-5 w-full rounded-sm bg-transparent text-center text-[10px] tabular-nums text-zinc-400 outline-none hover:bg-zinc-100 focus:bg-white focus:text-zinc-900 focus:ring-1 focus:ring-zinc-400"
      />
    </div>
  )
}

/**
 * Where to cut a band when it is split.
 *
 * Halfway through a bounded band. An unbounded end has no midpoint, so it splits
 * a tenth of a compa-ratio inside its only boundary — the width of the default
 * bands, which reads as a deliberate step rather than an arbitrary one.
 */
function splitPointFor(band: {
  lowerBound: number | null
  upperBound: number | null
}): number {
  if (band.lowerBound !== null && band.upperBound !== null) {
    return Math.round(((band.lowerBound + band.upperBound) / 2) * 100) / 100
  }
  if (band.upperBound !== null) return Math.round((band.upperBound - 0.1) * 100) / 100
  if (band.lowerBound !== null) return Math.round((band.lowerBound + 0.1) * 100) / 100
  return 1
}

/** A rating name, renamed in place. Its cells and its position follow the name. */
function RatingLabel({
  rating,
  onRename,
}: {
  rating: string
  onRename: (next: string) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)

  return (
    <input
      type="text"
      aria-label={`Rating name: ${rating}`}
      value={draft ?? rating}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => setDraft(rating)}
      onBlur={() => {
        const next = (draft ?? '').trim()
        // An empty name would leave a row nobody can identify, so it reverts.
        if (next !== '' && next !== rating) onRename(next)
        setDraft(null)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setDraft(null)
          e.currentTarget.blur()
        }
      }}
      className="w-full min-w-0 truncate rounded-sm bg-transparent text-zinc-900 outline-none hover:bg-zinc-100 focus:bg-white focus:ring-1 focus:ring-zinc-400"
    />
  )
}
