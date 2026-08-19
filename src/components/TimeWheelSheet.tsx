import { useEffect, useRef, useState } from 'react'

// A two-column time wheel — hours on the left, minutes on the right, both visible
// and spinnable at once, minutes restricted to 5-minute steps.
//
// Why this and not a native control: <input type="time" step={300}> looks right but
// WebKit applies `step` to validation only, so the iOS wheel still offers all sixty
// minutes. Two <select>s DID enforce the step, but cost a separate tap-and-dismiss
// for the hour and again for the minutes. This gets both properties: one tap to
// open, both wheels on screen, and the options ARE the allowed values.
//
// The wheel is a scroll-snap list: rows at scroll-snap-align center, two rows of
// spacer padding at each end so the first and last value can reach the middle, and
// a highlight band drawn behind the centre row. The selected value is read back
// from scrollTop rather than from a click, which is what makes a flick land on a
// value the way a native wheel does.

const ROW_H = 40 // px; must match the h-10 on each row
const VISIBLE = 5 // odd, so there is a true centre row

function WheelColumn({
  values,
  value,
  onChange,
  ariaLabel,
}: {
  values: string[]
  value: string
  onChange: (v: string) => void
  ariaLabel: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Suppresses the scroll handler while we are the ones doing the scrolling —
  // otherwise centring a tapped row reads back as a user scroll mid-animation and
  // fights the smooth scroll.
  const programmatic = useRef(false)

  // Jump to the incoming value on mount and whenever it changes from outside.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const i = values.indexOf(value)
    if (i < 0) return
    const target = i * ROW_H
    if (Math.abs(el.scrollTop - target) < 2) return
    programmatic.current = true
    el.scrollTop = target
    // A plain assignment settles synchronously, but iOS can still emit a trailing
    // scroll event, so release on the next frame rather than immediately.
    requestAnimationFrame(() => { programmatic.current = false })
  }, [value, values])

  // Read the selection back off the scroll position once it stops moving. iOS
  // Safari has no `scrollend` before 17, so the debounce is the mechanism here,
  // not a fallback.
  function onScroll() {
    if (programmatic.current) return
    if (settle.current) clearTimeout(settle.current)
    settle.current = setTimeout(() => {
      const el = ref.current
      if (!el) return
      const i = Math.max(0, Math.min(values.length - 1, Math.round(el.scrollTop / ROW_H)))
      if (values[i] !== value) onChange(values[i])
    }, 120)
  }

  function pick(v: string) {
    const el = ref.current
    if (el) {
      programmatic.current = true
      el.scrollTo({ top: values.indexOf(v) * ROW_H, behavior: 'smooth' })
      setTimeout(() => { programmatic.current = false }, 400)
    }
    onChange(v)
  }

  const pad = ((VISIBLE - 1) / 2) * ROW_H

  return (
    <div
      ref={ref}
      onScroll={onScroll}
      role="listbox"
      aria-label={ariaLabel}
      className="no-scrollbar relative flex-1 snap-y snap-mandatory overflow-y-auto overscroll-contain"
      style={{ height: VISIBLE * ROW_H, WebkitOverflowScrolling: 'touch' }}
    >
      <div style={{ height: pad }} />
      {values.map((v) => (
        <button
          key={v}
          type="button"
          role="option"
          aria-selected={v === value}
          onClick={() => pick(v)}
          className={`flex h-10 w-full snap-center items-center justify-center font-serif text-2xl leading-none transition-colors ${
            v === value ? 'text-cream' : 'text-ink-400'
          }`}
        >
          {v}
        </button>
      ))}
      <div style={{ height: pad }} />
    </div>
  )
}

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'))
const BASE_MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))

export default function TimeWheelSheet({
  value,
  title,
  onCommit,
  onClose,
}: {
  value: string // 'HH:MM'
  title: string
  onCommit: (next: string) => void
  onClose: () => void
}) {
  const [h, setH] = useState(() => value.slice(0, 2))
  const [m, setM] = useState(() => value.slice(3, 5))

  // A time saved before the 5-minute rule existed (23:07) gets its own row rather
  // than being silently snapped — the wheel should never quietly disagree with what
  // is stored. It drops out as soon as another minute is picked.
  const minutes = m && !BASE_MINUTES.includes(m) ? [...BASE_MINUTES, m].sort() : BASE_MINUTES

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-2xl border-t border-ink-700 bg-ink-900 p-4 pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[17px] text-cream">{title}</span>
          <button className="btn-primary !px-4 !py-1.5 text-sm" onClick={() => onCommit(`${h}:${m}`)}>
            Done
          </button>
        </div>

        {/* Capped and centred: at full sheet width the two columns sit so far apart
            that "23" and "00" stop reading as one time. */}
        <div className="relative mx-auto flex max-w-[15rem] items-stretch">
          {/* The band marking the selected row. Behind the columns and inert, so a
              flick passes straight through it. --surface-3 rather than a Tailwind
              ink step, because it needs to stay visible against BOTH grounds. */}
          <div
            className="pointer-events-none absolute inset-x-0 rounded-xl"
            style={{ height: ROW_H, top: ((VISIBLE - 1) / 2) * ROW_H, background: 'var(--surface-3)' }}
          />
          <WheelColumn values={HOURS} value={h} onChange={setH} ariaLabel={`${title} hour`} />
          <div className="relative flex items-center px-1 font-serif text-2xl text-cream">:</div>
          <WheelColumn values={minutes} value={m} onChange={setM} ariaLabel={`${title} minute`} />
        </div>

        <p className="mt-2 text-center text-xs text-ink-500">Minutes step by 5</p>
      </div>
    </div>
  )
}
