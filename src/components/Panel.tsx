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
