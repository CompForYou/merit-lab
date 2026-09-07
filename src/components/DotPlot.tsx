import { useMemo } from 'react'
import type { DotLayout } from '../lib/dot-layout'
import type { CompaRatioBand } from '../types/domain'
import { formatCompaRatio, pluralize } from '../lib/format'

const VIEW_WIDTH = 820
const ROW_HEIGHT = 7
const DOT_RADIUS = 2.6
const PADDING = { top: 18, right: 16, bottom: 30, left: 16 }

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
  layout,
  bands,
  hovered,
}: {
  layout: DotLayout
  bands: CompaRatioBand[]
  hovered: { rating: string; bandId: string } | null
}) {
  const height =
    PADDING.top + PADDING.bottom + Math.max(layout.maxRow * 2 + 1, 3) * ROW_HEIGHT
  const centreY = PADDING.top + ((layout.maxRow * 2 + 1) * ROW_HEIGHT) / 2

  const scaleX = useMemo(() => {
    const [low, high] = layout.domain
    const span = high - low || 1
    const usable = VIEW_WIDTH - PADDING.left - PADDING.right
    return (value: number) => PADDING.left + ((value - low) / span) * usable
  }, [layout.domain])

  const guides = useMemo(() => {
    const [low, high] = layout.domain
    const values = new Set<number>([1])
    for (const band of bands) {
      if (band.lowerBound !== null) values.add(band.lowerBound)
    }
    return [...values].filter((v) => v > low && v < high).sort((a, b) => a - b)
  }, [bands, layout.domain])

  if (layout.dots.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-zinc-400">
        No employees to plot.
      </p>
    )
  }

  return (
    <div>
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${height}`}
        className="w-full"
        role="img"
        aria-label={`Compa-ratio distribution for ${pluralize(layout.dots.length, 'employee')}, before and after the merit cycle`}
      >
        {guides.map((value) => (
          <g key={value}>
            <line
              x1={scaleX(value)}
              x2={scaleX(value)}
              y1={PADDING.top - 8}
              y2={height - PADDING.bottom + 6}
              stroke={value === 1 ? '#a1a1aa' : '#e4e4e7'}
              strokeWidth={value === 1 ? 1 : 1}
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

        {/* Where the population sits today. Static: base salaries do not move. */}
        <g>
          {layout.dots.map((dot) => (
            <circle
              key={`before-${dot.employeeId}`}
              cx={scaleX(dot.before)}
              cy={centreY + dot.row * ROW_HEIGHT}
              r={DOT_RADIUS - 0.4}
              className="fill-zinc-200"
            />
          ))}
        </g>

        {/* Where this matrix puts them. These are the dots that move. */}
        <g>
          {layout.dots.map((dot) => {
            const dimmed =
              hovered !== null &&
              !(
                dot.performanceRating === hovered.rating &&
                dot.bandId === hovered.bandId
              )

            return (
              <circle
                key={`after-${dot.employeeId}`}
                r={DOT_RADIUS}
                cx={0}
                cy={0}
                transform={`translate(${scaleX(dot.after)}, ${centreY + dot.row * ROW_HEIGHT})`}
                className={`${dotColour(dot)} transition-[transform,opacity] duration-[400ms] ease-out motion-reduce:transition-none`}
                opacity={dimmed ? 0.12 : 1}
              >
                <title>
                  {`${dot.employeeId} · ${dot.performanceRating} · ${formatCompaRatio(dot.before)} to ${formatCompaRatio(dot.after)}`}
                </title>
              </circle>
            )
          })}
        </g>
      </svg>

      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-400">
        <Key className="fill-zinc-200" label="before" />
        <Key className="fill-zinc-500" label="after" />
        <Key className="fill-rose-500" label="above maximum" />
        <Key className="fill-amber-500" label="below minimum" />
        <Key className="fill-zinc-300" label="ineligible" />
        {layout.omitted > 0 ? (
          <span className="text-amber-700">
            {pluralize(layout.omitted, 'employee')} could not be placed and
            {layout.omitted === 1 ? ' is' : ' are'} not plotted
          </span>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Colour carries only the two states a practitioner acts on. Everything else is
 * neutral, so an outlier is the thing the eye lands on rather than one of six
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
