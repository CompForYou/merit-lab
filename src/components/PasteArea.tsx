/**
 * A paste target that parses as you type.
 *
 * No Import button, no file dialog, no upload. There is no server to send
 * anything to, so there is nothing to submit: the moment text lands in this box
 * it has already been parsed and everything on the right has already moved.
 */
export function PasteArea({
  value,
  onChange,
  placeholder,
  rows = 6,
  label,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  rows?: number
  label: string
}) {
  return (
    <textarea
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      spellCheck={false}
      className="w-full rounded border border-zinc-300 bg-white px-2.5 py-2 font-mono text-[11px] leading-relaxed text-zinc-800 placeholder:text-zinc-300 focus:border-zinc-500 focus:outline-none resize-y"
    />
  )
}

/** A small, quiet button. Nothing in this tool needs a call to action. */
export function ActionButton({
  onClick,
  children,
  disabled = false,
}: {
  onClick: () => void
  children: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  )
}
