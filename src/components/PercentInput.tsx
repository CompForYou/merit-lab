import { useState } from 'react'

/**
 * An inline percentage field.
 *
 * The user types in percent units (3.25); the value is stored as a decimal
 * (0.0325). Nothing else in the codebase deals in percent units.
 *
 * While focused it holds the raw keystrokes, so half-typed values like "3." and
 * "" survive long enough to finish typing. Every accepted keystroke reports
 * upward immediately, which is what makes the figures on the right move as you
 * type rather than when you leave the field.
 */
export function PercentInput({
  value,
  onChange,
  label,
  className = '',
}: {
  value: number
  onChange: (next: number) => void
  label: string
  className?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)

  const display = draft ?? formatForEditing(value)

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={label}
      value={display}
      onChange={(e) => {
        const raw = e.target.value
        // Digits and at most one decimal point. Rejecting anything else here
        // means the stored value can never become NaN.
        if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return
        setDraft(raw)
        const parsed = Number(raw)
        if (raw !== '' && Number.isFinite(parsed)) onChange(parsed / 100)
        if (raw === '') onChange(0)
      }}
      onFocus={(e) => {
        setDraft(formatForEditing(value))
        e.target.select()
      }}
      onBlur={() => setDraft(null)}
      className={`w-full bg-transparent text-right tabular-nums outline-none focus:bg-white focus:ring-1 focus:ring-zinc-400 rounded-sm ${className}`}
    />
  )
}

/** 0.0325 becomes "3.25"; 0.03 becomes "3"; 0.045 becomes "4.5". */
function formatForEditing(value: number): string {
  if (!Number.isFinite(value)) return '0'
  const percent = value * 100
  return String(Math.round(percent * 100) / 100)
}
