import type { ReactNode } from 'react'

/**
 * A titled section. The small-caps label is the only chrome: no cards, no
 * shadows, no borders around everything. Instrument, not brochure.
 */
export function Panel({
  title,
  aside,
  children,
}: {
  title: string
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="mb-8">
      <div className="flex items-baseline justify-between gap-4 mb-3">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-400">
          {title}
        </h2>
        {aside ? <div className="text-xs text-zinc-400">{aside}</div> : null}
      </div>
      {children}
    </section>
  )
}

/**
 * A label and a figure. Figures are larger than their labels and sit on
 * tabular numerals, so a value changing does not shift anything around it.
 */
export function Stat({
  label,
  value,
  detail,
  tone = 'neutral',
}: {
  label: string
  value: string
  detail?: string
  tone?: 'neutral' | 'warn' | 'quiet'
}) {
  const valueTone =
    tone === 'warn'
      ? 'text-amber-700'
      : tone === 'quiet'
        ? 'text-zinc-400'
        : 'text-zinc-900'

  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.08em] text-zinc-400">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-medium tabular-nums ${valueTone}`}>
        {value}
      </div>
      {detail ? <div className="text-xs text-zinc-500 mt-0.5">{detail}</div> : null}
    </div>
  )
}

/**
 * A panel that folds itself away once its job is done.
 *
 * The paste areas are used once at the start of a session and then hold a
 * permanent block of the control column for the rest of it. Collapsing them
 * gives the space back to the matrix without hiding the ability to paste again.
 */
export function CollapsiblePanel({
  title,
  aside,
  collapsed,
  summary,
  children,
}: {
  title: string
  aside?: ReactNode
  collapsed: boolean
  summary: string
  children: ReactNode
}) {
  if (!collapsed) {
    return (
      <Panel title={title} aside={aside}>
        {children}
      </Panel>
    )
  }

  return (
    <details className="mb-8 group">
      <summary className="flex cursor-pointer list-none items-baseline justify-between gap-4 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-400 hover:text-zinc-600">
        <span>
          {title}
          <span className="ml-2 normal-case tracking-normal text-zinc-300 group-open:hidden">
            {summary}
          </span>
        </span>
        {aside ? <span className="normal-case tracking-normal">{aside}</span> : null}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  )
}
