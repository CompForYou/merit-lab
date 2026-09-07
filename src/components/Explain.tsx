import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { lookupTerm, type TermId } from '../lib/glossary'

const POPOVER_WIDTH = 320
const EDGE_MARGIN = 8
const GAP = 8

/**
 * A question mark that explains the figure beside it.
 *
 * Rendered through a portal rather than inline. The control column is a sticky
 * element with its own overflow, which would clip a popover drawn inside it, and
 * several of these sit inside table cells that would trap an absolutely
 * positioned child.
 *
 * Opens on hover, focus or click, so it is reachable by pointer and by keyboard.
 * A click pins it, which matters because these carry three or four lines that
 * are awkward to read while holding a mouse still.
 *
 * Position is measured after the popover renders rather than estimated before,
 * because the entries vary in height and an estimate puts the long ones off the
 * bottom of the window. It follows its trigger on scroll instead of closing:
 * focusing a trigger that is below the fold scrolls it into view, and a popover
 * that closed on scroll would shut itself the instant a keyboard user reached it.
 */
export function Explain({ term }: { term: TermId }) {
  const entry = lookupTerm(term)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const popoverId = useId()

  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

  const close = useCallback(() => {
    setPinned(false)
    setOpen(false)
    setPosition(null)
  }, [])

  const hide = useCallback(() => {
    if (pinned) return
    setOpen(false)
    setPosition(null)
  }, [pinned])

  // Measure, then place. Runs before paint, so the popover never appears in the
  // wrong spot first.
  useLayoutEffect(() => {
    if (!open) return

    const reposition = () => {
      const trigger = triggerRef.current
      const popover = popoverRef.current
      if (!trigger || !popover) return

      const anchor = trigger.getBoundingClientRect()

      // Only give up when the trigger itself has left the window.
      if (anchor.bottom < 0 || anchor.top > window.innerHeight) {
        close()
        return
      }

      const height = popover.offsetHeight
      const width = popover.offsetWidth

      // Below the trigger by preference; above it when that would overflow;
      // clamped to the window when neither side has room.
      let top = anchor.bottom + GAP
      if (top + height > window.innerHeight - EDGE_MARGIN) {
        const above = anchor.top - GAP - height
        top =
          above >= EDGE_MARGIN
            ? above
            : Math.max(EDGE_MARGIN, window.innerHeight - height - EDGE_MARGIN)
      }

      const left = Math.min(
        Math.max(anchor.left + anchor.width / 2 - width / 2, EDGE_MARGIN),
        Math.max(EDGE_MARGIN, window.innerWidth - width - EDGE_MARGIN),
      )

      setPosition((current) =>
        current && current.top === top && current.left === left
          ? current
          : { top, left },
      )
    }

    reposition()
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open, close])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      close()
      triggerRef.current?.focus()
    }
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (popoverRef.current?.contains(target)) return
      close()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open, close])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`What ${entry.term} means`}
        aria-expanded={open}
        aria-describedby={open ? popoverId : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={hide}
        onFocus={() => setOpen(true)}
        onBlur={hide}
        onClick={(e) => {
          e.stopPropagation()
          if (pinned) {
            close()
          } else {
            setPinned(true)
            setOpen(true)
          }
        }}
        className="ml-1 inline-flex h-3.5 w-3.5 shrink-0 translate-y-[1px] items-center justify-center rounded-full border border-zinc-300 text-[9px] leading-none text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-700 focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500"
      >
        ?
      </button>

      {open
        ? createPortal(
            <div
              ref={popoverRef}
              id={popoverId}
              role="tooltip"
              style={{
                position: 'fixed',
                top: position?.top ?? 0,
                left: position?.left ?? 0,
                width: POPOVER_WIDTH,
                // Hidden for the single frame between mounting and measuring.
                visibility: position ? 'visible' : 'hidden',
              }}
              className="z-50 rounded border border-zinc-300 bg-white p-3 shadow-lg"
              onMouseEnter={() => setOpen(true)}
              onMouseLeave={hide}
            >
              <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-900">
                {entry.term}
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-zinc-700">
                {entry.definition}
              </p>
              {entry.formula ? (
                <p className="mt-2 rounded bg-zinc-50 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-zinc-600">
                  {entry.formula}
                </p>
              ) : null}
              {entry.assumption ? (
                <p className="mt-2 border-t border-zinc-100 pt-2 text-[11px] leading-relaxed text-zinc-500">
                  {entry.assumption}
                </p>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
