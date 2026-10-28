/**
 * Accessible tooltip: <Tooltip content="text" side="top|bottom|left|right">{child}</Tooltip>
 *
 * ── IN SIMPLE WORDS ──
 * A small label that pops up next to something to explain it. It appears
 * when you hover with a mouse, when you Tab onto the element with the
 * keyboard, or when you tap it on a phone. Escape or tapping elsewhere hides it.
 *
 * ── WHY IT'S BUILT THIS WAY (change at your peril) ──
 * - The bubble is always in the DOM (only visually hidden) so the child's
 *   aria-describedby always points at a real element; screen readers read
 *   the text as the child's description.
 * - Placement is plain CSS (absolute, around the trigger). On open we measure
 *   once and either flip to a side that fits the viewport or nudge the bubble
 *   along the edge, so it is not cut off on 320px phones.
 * - Touch opens by tap-to-toggle on pointerdown and never calls
 *   preventDefault, so a wrapped button still receives its click.
 * - Focus only opens it when the element is :focus-visible (keyboard). A tap
 *   also focuses a button; without that check every tap would open it twice.
 *
 * ── DO NOT ──
 * - Do not put a Tooltip inside an element with overflow: hidden/auto near
 *   its edge: absolute bubbles get clipped by scroll containers.
 * - Do not wrap a non-focusable child without giving it tabIndex={0};
 *   keyboard users could never reach the tooltip.
 */
import { cloneElement, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import './Tooltip.css'

const OPEN_DELAY = 300 // ms; closing is instant
const GAP = 10 // px between trigger and bubble (matches Tooltip.css)
const EDGE = 8 // px minimum distance from the viewport edge
const OPPOSITE = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }

const clamp = (v, min, max) => Math.min(Math.max(v, min), max)

export default function Tooltip({ content, side = 'top', className = '', children }) {
  const id = useId()
  const wrapRef = useRef(null)
  const bubbleRef = useRef(null)
  const timer = useRef(0)
  const [open, setOpen] = useState(false)
  const [place, setPlace] = useState({ side, shift: 0, arrow: 0 })

  const cancel = () => clearTimeout(timer.current)
  const show = (delay = OPEN_DELAY) => {
    cancel()
    timer.current = setTimeout(() => setOpen(true), delay)
  }
  const hide = () => {
    cancel()
    setOpen(false)
  }

  useEffect(() => () => clearTimeout(timer.current), [])

  // While open: Escape closes, and a tap/click outside closes (touch toggle).
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') hide()
    }
    const onDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) hide()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  // Pick a side that fits the viewport, then nudge along that edge.
  useLayoutEffect(() => {
    if (!open) return
    const wrap = wrapRef.current
    const bubble = bubbleRef.current
    if (!wrap || !bubble) return
    const r = wrap.getBoundingClientRect()
    const w = bubble.offsetWidth
    const h = bubble.offsetHeight
    const vw = document.documentElement.clientWidth
    const vh = window.innerHeight
    const fits = {
      top: r.top - h - GAP >= EDGE,
      bottom: r.bottom + h + GAP <= vh - EDGE,
      left: r.left - w - GAP >= EDGE,
      right: r.right + w + GAP <= vw - EDGE,
    }
    const next = [side, OPPOSITE[side], 'top', 'bottom'].find((s) => fits[s]) ?? side
    const horizontal = next === 'top' || next === 'bottom'
    const start = horizontal ? r.left + r.width / 2 - w / 2 : r.top + r.height / 2 - h / 2
    const size = horizontal ? w : h
    const limit = horizontal ? vw : vh
    const shift = Math.round(clamp(start, EDGE, Math.max(EDGE, limit - EDGE - size)) - start)
    // Keep the arrow pointing at the trigger, but inside the bubble's corners.
    const arrow = Math.round(clamp(-shift, -(size / 2 - 14), size / 2 - 14))
    setPlace({ side: next, shift, arrow })
  }, [open, side, content])

  const describedBy = isValidElement(children)
    ? [children.props['aria-describedby'], id].filter(Boolean).join(' ')
    : undefined
  const trigger = isValidElement(children)
    ? cloneElement(children, { 'aria-describedby': describedBy })
    : children

  return (
    <span
      ref={wrapRef}
      className={`tt ${className}`}
      onPointerEnter={(e) => e.pointerType !== 'touch' && show()}
      onPointerLeave={(e) => e.pointerType !== 'touch' && hide()}
      onPointerDown={(e) => {
        if (e.pointerType !== 'touch') return
        if (open) hide()
        else show(0)
      }}
      onFocus={(e) => {
        let keyboard = true
        try {
          keyboard = e.target.matches(':focus-visible')
        } catch {
          // Very old browsers: treat every focus as keyboard focus.
        }
        if (keyboard) show()
      }}
      onBlur={hide}
    >
      {trigger}
      <span
        ref={bubbleRef}
        id={id}
        role="tooltip"
        className="tt__bubble"
        data-side={place.side}
        data-open={open || undefined}
        style={{ '--tt-shift': `${place.shift}px`, '--tt-arrow': `${place.arrow}px` }}
      >
        {content}
      </span>
    </span>
  )
}
