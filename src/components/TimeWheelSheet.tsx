import { useEffect, useLayoutEffect, useRef, useState } from 'react'

// A two-column time wheel — hours on the left, minutes on the right, both visible
// and spinnable at once, minutes restricted to 5-minute steps, and both columns
// wrapping so 23 rolls straight on to 00.
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
const PAD = ((VISIBLE - 1) / 2) * ROW_H

// How many times a column repeats its values, so 23 rolls straight on to 00 instead
// of hitting a wall. The wheel opens in the middle copy, which leaves two whole
// cycles of headroom in EACH direction — 48 hours of scrolling either way from
// wherever it starts.
//
// Deliberately NOT an infinitely recentring wheel. That needs a silent scrollTop
// jump once a flick settles, which only works if scroll events land exactly when
// expected — and it would be repositioning the control under his thumb on evidence
// I have no way to test here. Five copies cost 120 rows of nothing and can't
// misfire.
const REPEATS = 5

function clamp(i: number, len: number): number {
  return Math.max(0, Math.min(len - 1, i))
}

function WheelColumn({
  base,
  value,
  onChange,
  ariaLabel,
}: {
  base: string[] // the real, unrepeated values
  value: string
  onChange: (v: string) => void
  ariaLabel: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null)
  const frame = useRef<number | null>(null)
  // Suppresses the scroll handler while WE are the ones scrolling — recentring the
  // loop and gliding a tapped row into place both move scrollTop, and neither is a
  // user gesture.
  const programmatic = useRef(false)

  const rows = Array.from({ length: REPEATS * base.length }, (_, i) => base[i % base.length])
  const middle = Math.floor(REPEATS / 2) * base.length

  // Live index under the centre band. Held locally and updated every animation
  // frame while scrolling — the highlight has to move WITH the wheel. The parent is
  // only told once the wheel stops, so a flick past twenty values doesn't cause
  // twenty re-renders of the sheet.
  const [active, setActive] = useState(() => middle + Math.max(0, base.indexOf(value)))

  function scrollToIndex(i: number, smooth: boolean): void {
    const el = ref.current
    if (!el) return
    programmatic.current = true
    if (smooth) el.scrollTo({ top: i * ROW_H, behavior: 'smooth' })
    else el.scrollTop = i * ROW_H
    setActive(i)
    // Release after the gesture would have finished. A plain assignment settles at
    // once, but iOS still emits a trailing scroll event either way.
    setTimeout(() => { programmatic.current = false }, smooth ? 420 : 60)
  }

  // Land on the starting value before the first paint. Separate from the sync
  // effect below, which deliberately does nothing here: at mount `active` ALREADY
  // points at the right value (it was seeded from it), so a value-compare finds
  // nothing to do — but scrollTop is still 0, showing 00 under the band while the
  // wheel claims 23.
  useLayoutEffect(() => {
    scrollToIndex(active, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-position whenever the value is changed from outside. Compared by VALUE, not
  // index: after the user scrolls, `active` sits in whichever copy they spun into,
  // and jumping back to the middle copy would teleport the wheel under their thumb
  // for no visible reason.
  useEffect(() => {
    if (base[active % base.length] === value) return
    scrollToIndex(middle + Math.max(0, base.indexOf(value)), false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  function onScroll(): void {
    if (programmatic.current) return

    // Highlight follows the scroll, one update per frame at most.
    if (frame.current == null) {
      frame.current = requestAnimationFrame(() => {
        frame.current = null
        const el = ref.current
        if (!el) return
        setActive(clamp(Math.round(el.scrollTop / ROW_H), rows.length))
      })
    }

    // Commit once it stops. iOS Safari has no `scrollend` before 17, so this
    // debounce is the mechanism, not a fallback.
    if (settle.current) clearTimeout(settle.current)
    settle.current = setTimeout(() => {
      const el = ref.current
      if (!el) return
      const i = clamp(Math.round(el.scrollTop / ROW_H), rows.length)
      setActive(i)
      const next = base[i % base.length]
      if (next !== value) onChange(next)
    }, 140)
  }

  return (
    <div
      ref={ref}
      onScroll={onScroll}
      role="listbox"
      aria-label={ariaLabel}
      className="no-scrollbar relative flex-1 snap-y snap-mandatory overflow-y-auto overscroll-contain"
      style={{
        height: VISIBLE * ROW_H,
        WebkitOverflowScrolling: 'touch',
        // Values dissolve towards the edges instead of being cut off by the sheet —
        // the thing that makes a list read as a wheel rather than a scrollbox.
        maskImage: 'linear-gradient(to bottom, transparent 0, #000 30%, #000 70%, transparent 100%)',
        WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, #000 30%, #000 70%, transparent 100%)',
      }}
    >
      <div style={{ height: PAD }} />
      {rows.map((v, i) => {
        const dist = Math.abs(i - active)
        return (
          <button
            key={i}
            type="button"
            role="option"
            aria-selected={i === active}
            onClick={() => { scrollToIndex(i, true); if (v !== value) onChange(v) }}
            className={`flex h-10 w-full snap-center items-center justify-center font-serif leading-none ${
              dist === 0 ? 'text-cream' : 'text-ink-400'
            }`}
            // Rows shrink with distance from the centre, so the column reads as a
            // curved surface. Inline rather than a class: it is a continuous
            // function of position, not three states.
            style={{
              fontSize: dist === 0 ? '1.6rem' : dist === 1 ? '1.35rem' : '1.15rem',
              opacity: dist === 0 ? 1 : dist === 1 ? 0.75 : 0.45,
              transition: 'font-size 90ms linear, opacity 90ms linear',
            }}
          >
            {v}
          </button>
        )
      })}
      <div style={{ height: PAD }} />
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
            style={{ height: ROW_H, top: PAD, background: 'var(--surface-3)' }}
          />
          <WheelColumn base={HOURS} value={h} onChange={setH} ariaLabel={`${title} hour`} />
          <div className="relative flex items-center px-1 font-serif text-2xl text-cream">:</div>
          <WheelColumn base={minutes} value={m} onChange={setM} ariaLabel={`${title} minute`} />
        </div>

        <p className="mt-2 text-center text-xs text-ink-500">Minutes step by 5 · keep scrolling past 23 for 00</p>
      </div>
    </div>
  )
}
