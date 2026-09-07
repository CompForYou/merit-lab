import { useState } from 'react'
import type { Finding, Severity } from '../lib/advisor'

const SEVERITY_STYLE: Record<Severity, { dot: string; label: string }> = {
  high: { dot: 'bg-rose-500', label: 'text-rose-700' },
  medium: { dot: 'bg-amber-500', label: 'text-amber-700' },
  low: { dot: 'bg-zinc-400', label: 'text-zinc-500' },
}

const SEVERITY_WORD: Record<Severity, string> = {
  high: 'Fix first',
  medium: 'Worth deciding',
  low: 'Worth knowing',
}

/**
 * What this plan does wrong, and what to do about it.
 *
 * The advice is prescriptive by design, so each finding is built to be argued
 * with rather than taken on faith: the arithmetic that produced it, the price of
 * the action it recommends, and a plain statement of what the tool cannot see.
 * A reader who disagrees can check the numbers and identify exactly which piece
 * of context they hold that Merit Lab does not.
 */
export function AdvisorPanel({ findings }: { findings: Finding[] }) {
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set())
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())

  const visible = findings.filter((f) => !dismissed.has(f.id))
  const hiddenCount = findings.length - visible.length

  const toggle = (
    set: ReadonlySet<string>,
    update: (next: ReadonlySet<string>) => void,
    id: string,
  ) => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    update(next)
  }

  if (findings.length === 0) {
    return (
      <p className="text-xs text-zinc-500">
        Nothing to raise. This plan lands on budget, leaves nobody outside their
        range, and does not narrow any grade step past your threshold.
      </p>
    )
  }

  return (
    <div>
      {visible.length === 0 ? (
        <p className="text-xs text-zinc-400">
          All {findings.length} findings dismissed for this session.
        </p>
      ) : null}

      <ul className="space-y-2.5">
        {visible.map((finding) => {
          const isOpen = expanded.has(finding.id)
          const style = SEVERITY_STYLE[finding.severity]

          return (
            <li
              key={finding.id}
              className="rounded border border-zinc-200 bg-white px-3 py-2.5"
            >
              <div className="flex items-start gap-2">
                <span
                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span
                      className={`text-[10px] uppercase tracking-[0.08em] ${style.label}`}
                    >
                      {SEVERITY_WORD[finding.severity]}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs font-medium leading-relaxed text-zinc-900">
                    {finding.headline}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-zinc-600">
                    {finding.recommendedAction}
                  </p>

                  {isOpen ? (
                    <div className="mt-2 space-y-2 border-t border-zinc-100 pt-2">
                      <p className="text-[11px] leading-relaxed text-zinc-600">
                        {finding.detail}
                      </p>

                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] tabular-nums">
                        {finding.supportingNumbers.map((n) => (
                          <span key={n.label}>
                            <span className="text-zinc-400">{n.label} </span>
                            <span className="text-zinc-900">{n.value}</span>
                          </span>
                        ))}
                      </div>

                      {finding.actionCost ? (
                        <p className="rounded bg-zinc-50 px-2 py-1.5 text-[11px] leading-relaxed text-zinc-700">
                          <span className="text-zinc-400">Cost of acting. </span>
                          {finding.actionCost}
                        </p>
                      ) : null}

                      <p className="text-[11px] leading-relaxed text-zinc-500">
                        <span className="text-zinc-400">
                          What Merit Lab cannot know.{' '}
                        </span>
                        {finding.cannotKnow}
                      </p>
                    </div>
                  ) : null}

                  <div className="mt-1.5 flex gap-3 text-[11px]">
                    <button
                      type="button"
                      onClick={() => toggle(expanded, setExpanded, finding.id)}
                      className="text-zinc-500 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-800"
                    >
                      {isOpen ? 'Hide the arithmetic' : 'Show the arithmetic'}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggle(dismissed, setDismissed, finding.id)}
                      className="text-zinc-400 underline decoration-zinc-200 underline-offset-2 hover:text-zinc-700"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      {hiddenCount > 0 ? (
        <button
          type="button"
          onClick={() => setDismissed(new Set())}
          className="mt-2 text-[11px] text-zinc-400 underline decoration-zinc-200 underline-offset-2 hover:text-zinc-700"
        >
          Restore {hiddenCount} dismissed
        </button>
      ) : null}

      <p className="mt-3 text-[11px] leading-relaxed text-zinc-400">
        These are recommendations, not decisions. Each one shows the arithmetic
        behind it and states what Merit Lab cannot see — market position, budget
        politics, prior commitments, tenure. You hold that context; the tool does
        not.
      </p>
    </div>
  )
}
