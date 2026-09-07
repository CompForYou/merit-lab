import { useMemo, useState } from 'react'
import type { Grade, MeritMatrix } from '../types/domain'
import type { EmployeeMeritResult } from '../lib/merit-increase'
import { layoutDots, layoutDotsByGrade, type Dot } from '../lib/dot-layout'
import { explainDot, type DotExplanation } from '../lib/dot-explain'
import {
  formatCompaRatio,
  formatCurrency,
  formatPercent,
  pluralize,
} from '../lib/format'

const VIEW_WIDTH = 820
const ROW_HEIGHT = 7
const DOT_RADIUS = 2.6
/** Invisible, and much larger than the dot, so a 2.6px target is reachable. */
const HIT_RADIUS = 5.5
const PADDING = { top: 18, right: 16, bottom: 30, left: 16 }
const GROUP_LABEL_HEIGHT = 14
const GROUP_GAP = 8

export type DotPlotMode = 'single' | 'byGrade'

/**
 * The population as individual dots, one per employee, positioned by compa-ratio.
 *
 * Not a histogram. A bar chart shows a distribution; dots show people, and the
 * argument this tool makes is that a merit matrix moves individuals rather than
 * moving a shape.
 *
 * Grey dots are where the population sits today. Coloured dots are where this
 * matrix puts them. Every coloured dot shares a row with its own grey dot, so
 * the horizontal gap between them is that person's increase.
 *
 * Motion is a CSS transition rather than a JavaScript animation, deliberately:
 * the browser owns the tween, so a dot always arrives at its true position even
 * when the page is not painting. An animation driven by requestAnimationFrame
 * silently does nothing in a tab that never draws.
 */
export function DotPlot({
  results,
  grades,
  matrix,
  highlightedIds,
  focusId,
  mode,
  onModeChange,
}: {
  results: EmployeeMeritResult[]
  grades: Grade[]
  matrix: MeritMatrix
  /**
   * Employees to keep lit while everything else dims. Null means no highlight.
   * Generalised from the matrix-cell hover it started as, so a group row and an
   * employee search dim the plot through exactly the same path.
   */
  highlightedIds: ReadonlySet<string> | null
  /** Pinned from outside, by the employee search. */
  focusId: string | null
  mode: DotPlotMode
  onModeChange: (next: DotPlotMode) => void
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [pinnedId, setPinnedId] = useState<string | null>(null)

  const flat = useMemo(() => layoutDots(results), [results])
  const grouped = useMemo(
    () => (mode === 'byGrade' ? layoutDotsByGrade(results, grades) : null),
    [results, grades, mode],
  )

  const resultById = useMemo(
    () => new Map(results.map((r) => [r.employeeId, r])),
    [results],
  )
  const gradeById = useMemo(() => new Map(grades.map((g) => [g.id, g])), [grades])

  const shownId = hoveredId ?? focusId ?? pinnedId
  const detail: DotExplanation | null = useMemo(() => {
    if (!shownId) return null
    const result = resultById.get(shownId)
    if (!result) return null
    return explainDot(result, gradeById.get(result.gradeId), matrix)
  }, [shownId, resultById, gradeById, matrix])

  const scaleX = useMemo(() => {
    const [low, high] = flat.domain
    const span = high - low || 1
    const usable = VIEW_WIDTH - PADDING.left - PADDING.right
    return (value: number) => PADDING.left + ((value - low) / span) * usable
  }, [flat.domain])

  const guides = useMemo(() => {
    const [low, high] = flat.domain
    const values = new Set<number>([1])
    for (const band of matrix.bands) {
      if (band.lowerBound !== null) values.add(band.lowerBound)
    }
    return [...values].filter((v) => v > low && v < high).sort((a, b) => a - b)
  }, [matrix.bands, flat.domain])

  if (flat.dots.length === 0) {
    return <p className="py-8 text-center text-sm text-zinc-400">No employees to plot.</p>
  }

  // Vertical extent. Grouped mode stacks a labelled band per grade.
  const rows =
    mode === 'byGrade' && grouped
      ? grouped.groups.reduce(
          (total, g) =>
            total + (g.maxRow * 2 + 1) * ROW_HEIGHT + GROUP_LABEL_HEIGHT + GROUP_GAP,
          0,
        )
      : (flat.maxRow * 2 + 1) * ROW_HEIGHT
  const height = PADDING.top + PADDING.bottom + Math.max(rows, 3 * ROW_HEIGHT)

  const isDimmed = (dot: Dot) =>
    highlightedIds !== null && !highlightedIds.has(dot.employeeId)

  const dotProps = (dot: Dot, cy: number) => ({
    dot,
    cy,
    x: scaleX(dot.after),
    beforeX: scaleX(dot.before),
    dimmed: isDimmed(dot),
    selected: dot.employeeId === shownId,
    onEnter: () => setHoveredId(dot.employeeId),
    onLeave: () => setHoveredId(null),
    onSelect: () =>
      setPinnedId((current) => (current === dot.employeeId ? null : dot.employeeId)),
  })

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded border border-zinc-300 bg-white p-0.5 text-xs">
          {(
            [
              ['single', 'One axis'],
              ['byGrade', 'By grade'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onModeChange(value)}
              className={`rounded-sm px-2 py-0.5 transition ${
                mode === value ? 'bg-zinc-800 text-white' : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {pinnedId ? (
          <button
            type="button"
            onClick={() => setPinnedId(null)}
            className="text-[11px] text-zinc-500 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-800"
          >
            unpin {pinnedId}
          </button>
        ) : focusId ? (
          <span className="text-[11px] text-zinc-500">showing {focusId}</span>
        ) : (
          <span className="text-[11px] text-zinc-300">click a dot to pin it</span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${height}`}
        className="w-full"
        role="img"
        aria-label={`Compa-ratio distribution for ${pluralize(flat.dots.length, 'employee')}, before and after the merit cycle`}
      >
        {guides.map((value) => (
          <g key={value}>
            <line
              x1={scaleX(value)}
              x2={scaleX(value)}
              y1={PADDING.top - 8}
              y2={height - PADDING.bottom + 6}
              stroke={value === 1 ? '#a1a1aa' : '#e4e4e7'}
              strokeDasharray={value === 1 ? undefined : '2 3'}
            />
            <text
              x={scaleX(value)}
              y={height - PADDING.bottom + 18}
              textAnchor="middle"
              className="fill-zinc-400 text-[9px] tabular-nums"
            >
              {formatCompaRatio(value)}
            </text>
          </g>
        ))}
        <text
          x={scaleX(1)}
          y={PADDING.top - 12}
          textAnchor="middle"
          className="fill-zinc-400 text-[9px]"
        >
          midpoint
        </text>

        {mode === 'byGrade' && grouped
          ? (() => {
              let cursor = PADDING.top
              return grouped.groups.map((group) => {
                const bandHeight = (group.maxRow * 2 + 1) * ROW_HEIGHT
                const labelY = cursor + GROUP_LABEL_HEIGHT - 4
                const centreY = cursor + GROUP_LABEL_HEIGHT + bandHeight / 2
                const top = cursor + GROUP_LABEL_HEIGHT
                cursor += GROUP_LABEL_HEIGHT + bandHeight + GROUP_GAP

                return (
                  <g key={group.gradeId}>
                    <text x={PADDING.left} y={labelY} className="fill-zinc-500 text-[9px]">
                      {group.gradeName}
                      <tspan className="fill-zinc-300"> · {group.dots.length}</tspan>
                    </text>

                    {/* Each grade's own minimum and maximum, which only a
                        grouped view can draw: they sit at a different
                        compa-ratio in every grade. */}
                    {[group.minCompaRatio, group.maxCompaRatio].map((bound, i) =>
                      bound === null ? null : (
                        <line
                          key={i}
                          x1={scaleX(bound)}
                          x2={scaleX(bound)}
                          y1={top - 2}
                          y2={top + bandHeight + 2}
                          stroke={i === 0 ? '#fbbf24' : '#fb7185'}
                          strokeWidth={1}
                        />
                      ),
                    )}

                    {group.dots.map((dot) => (
                      <circle
                        key={`b-${dot.employeeId}`}
                        cx={scaleX(dot.before)}
                        cy={centreY + dot.row * ROW_HEIGHT}
                        r={DOT_RADIUS - 0.4}
                        className="fill-zinc-200"
                      />
                    ))}
                    {group.dots.map((dot) => (
                      <PlottedDot
                        key={`a-${dot.employeeId}`}
                        {...dotProps(dot, centreY + dot.row * ROW_HEIGHT)}
                      />
                    ))}
                  </g>
                )
              })
            })()
          : (() => {
              const centreY = PADDING.top + ((flat.maxRow * 2 + 1) * ROW_HEIGHT) / 2
              return (
                <g>
                  {flat.dots.map((dot) => (
                    <circle
                      key={`b-${dot.employeeId}`}
                      cx={scaleX(dot.before)}
                      cy={centreY + dot.row * ROW_HEIGHT}
                      r={DOT_RADIUS - 0.4}
                      className="fill-zinc-200"
                    />
                  ))}
                  {flat.dots.map((dot) => (
                    <PlottedDot
                      key={`a-${dot.employeeId}`}
                      {...dotProps(dot, centreY + dot.row * ROW_HEIGHT)}
                    />
                  ))}
                </g>
              )
            })()}
      </svg>

      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-400">
        <Key className="fill-zinc-200" label="before" />
        <Key className="fill-zinc-500" label="after" />
        <Key className="fill-rose-500" label="above maximum" />
        <Key className="fill-amber-500" label="below minimum" />
        <Key className="fill-zinc-300" label="ineligible" />
        {mode === 'byGrade' ? (
          <span className="text-zinc-400">
            <span className="text-amber-500">│</span> grade minimum{' '}
            <span className="text-rose-400">│</span> grade maximum
          </span>
        ) : null}
      </div>

      <DetailCard detail={detail} pinned={pinnedId !== null} />
    </div>
  )
}

/**
 * One employee. The visible dot is small so 204 of them fit; a transparent
 * circle more than twice its size carries the pointer events, because a 2.6px
 * target is not reachable with a mouse.
 */
function PlottedDot({
  dot,
  cy,
  x,
  dimmed,
  selected,
  onEnter,
  onLeave,
  onSelect,
}: {
  dot: Dot
  cy: number
  x: number
  beforeX: number
  dimmed: boolean
  selected: boolean
  onEnter: () => void
  onLeave: () => void
  onSelect: () => void
}) {
  return (
    <g
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={onSelect}
      className="dot-move cursor-pointer"
      transform={`translate(${x}, ${cy})`}
    >
      {selected ? (
        <circle r={DOT_RADIUS + 3} className="fill-none stroke-zinc-900" strokeWidth={1} />
      ) : null}
      <circle
        r={DOT_RADIUS}
        className={`dot-fill ${dotColour(dot)}`}
        opacity={dimmed ? 0.12 : 1}
      />
      <circle r={HIT_RADIUS} fill="transparent" />
    </g>
  )
}

/**
 * A fixed slot beneath the plot rather than a card that follows the cursor.
 *
 * With 204 dots at this density a floating card covers the very neighbours a
 * user is comparing against, and it moves while they are trying to read it.
 * Keeping the slot always present also means the plot never shifts when a dot
 * is hovered.
 */
function DetailCard({
  detail,
  pinned,
}: {
  detail: DotExplanation | null
  pinned: boolean
}) {
  if (!detail) {
    return (
      <div className="mt-3 min-h-[5.5rem] rounded border border-dashed border-zinc-200 px-3 py-2 text-[11px] text-zinc-300">
        Hover a dot for that employee. Click to pin it.
      </div>
    )
  }

  return (
    <div
      className={`mt-3 min-h-[5.5rem] rounded border px-3 py-2 ${
        pinned ? 'border-zinc-400 bg-white' : 'border-zinc-200 bg-zinc-50'
      }`}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className="text-xs font-medium text-zinc-900">{detail.employeeId}</span>
        <span className="text-[11px] text-zinc-500">
          {detail.gradeName} · {detail.performanceRating}
          {detail.bandLabel ? ` · ${detail.bandLabel}` : ''}
          {detail.isPartTime ? ` · ${detail.fte} FTE` : ''}
        </span>
      </div>

      <p className="mt-1 text-[11px] leading-relaxed text-zinc-700">{detail.reason}</p>

      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] tabular-nums text-zinc-500">
        <Fact label="Salary">
          {formatCurrency(detail.baseSalary)} → {formatCurrency(detail.newSalary)}
        </Fact>
        <Fact label="Compa-ratio">
          {formatCompaRatio(detail.compaRatioBefore)} →{' '}
          {formatCompaRatio(detail.compaRatioAfter)}
        </Fact>
        {detail.matrixPercent !== null ? (
          <Fact label="Matrix">{formatPercent(detail.matrixPercent)}</Fact>
        ) : null}
        {detail.prorationFactor !== 1 ? (
          <Fact label="Prorated">{formatPercent(detail.prorationFactor, 0)}</Fact>
        ) : null}
        <Fact label="Increase">{formatCurrency(detail.increaseAmount)}</Fact>
        {detail.lumpSumAmount > 0 ? (
          <Fact label="Lump sum">{formatCurrency(detail.lumpSumAmount)}</Fact>
        ) : null}
        {detail.reducedByCap > 0 ? (
          <Fact label="Withheld">{formatCurrency(detail.reducedByCap)}</Fact>
        ) : null}
      </div>
    </div>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span>
      <span className="text-zinc-400">{label} </span>
      <span className="text-zinc-800">{children}</span>
    </span>
  )
}

/**
 * Colour carries only the states a practitioner acts on. Everything else is
 * neutral, so an outlier is what the eye lands on rather than one of six
 * competing hues.
 */
function dotColour(dot: {
  eligible: boolean
  isOverMaximumAfter: boolean
  isBelowMinimumAfter: boolean
}): string {
  if (dot.isOverMaximumAfter) return 'fill-rose-500'
  if (dot.isBelowMinimumAfter) return 'fill-amber-500'
  if (!dot.eligible) return 'fill-zinc-300'
  return 'fill-zinc-500'
}

function Key({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width="7" height="7" aria-hidden>
        <circle cx="3.5" cy="3.5" r="3" className={className} />
      </svg>
      {label}
    </span>
  )
}
