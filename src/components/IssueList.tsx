import type { ImportIssue } from '../lib/import-employees'

/**
 * Import problems, listed with their spreadsheet line number so the user can go
 * and look at the row.
 *
 * Errors and warnings are visually distinct but neither is a modal, a banner, or
 * a red wall. The user is importing a file, not making a mistake: guardrails
 * inform, they do not interrupt.
 */
export function IssueList({
  errors,
  warnings,
}: {
  errors: ImportIssue[]
  warnings: ImportIssue[]
}) {
  if (errors.length === 0 && warnings.length === 0) return null

  return (
    <div className="space-y-4">
      {errors.length > 0 ? (
        <IssueGroup
          issues={errors}
          heading={`${errors.length} ${errors.length === 1 ? 'row' : 'rows'} not imported`}
          markerClass="bg-rose-500"
          textClass="text-rose-900"
        />
      ) : null}

      {warnings.length > 0 ? (
        <IssueGroup
          issues={warnings}
          heading={`${warnings.length} ${warnings.length === 1 ? 'note' : 'notes'}`}
          markerClass="bg-amber-400"
          textClass="text-amber-900"
        />
      ) : null}
    </div>
  )
}

function IssueGroup({
  issues,
  heading,
  markerClass,
  textClass,
}: {
  issues: ImportIssue[]
  heading: string
  markerClass: string
  textClass: string
}) {
  // Long runs of the same problem are collapsed: two hundred identical messages
  // is noise, and the count is the useful part.
  const shown = issues.slice(0, 12)
  const remaining = issues.length - shown.length

  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.08em] text-zinc-400 mb-2">
        {heading}
      </div>
      <ul className="space-y-1.5">
        {shown.map((issue, i) => (
          <li key={i} className="flex gap-2 text-xs leading-relaxed">
            <span
              className={`mt-1.5 h-1 w-1 shrink-0 rounded-full ${markerClass}`}
              aria-hidden
            />
            <span className={textClass}>
              {issue.row !== null ? (
                <span className="text-zinc-400 tabular-nums">Row {issue.row} </span>
              ) : null}
              {issue.message}
            </span>
          </li>
        ))}
      </ul>
      {remaining > 0 ? (
        <div className="mt-2 text-xs text-zinc-400">
          and {remaining} more
        </div>
      ) : null}
    </div>
  )
}
