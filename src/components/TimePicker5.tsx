// A 'HH:MM' time picker that really is limited to 5-minute steps.
//
// `<input type="time" step={300}>` does NOT do this on iOS: WebKit applies `step`
// to validation only, and its wheel still offers all sixty minutes — which is why
// the sleep card kept landing on 23:07 after step={300} shipped. Two native
// <select>s are the reliable way: iOS renders each as its own wheel, the options
// ARE the allowed values, and the touch targets are large.
//
// Value in and out is the same 'HH:MM' string the <input type="time"> used, so
// sleepDurationMin() and upsertSleep() are untouched.

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'))
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))

function parse(value: string): { h: string; m: string } | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const [, h, m] = match
  if (Number(h) > 23 || Number(m) > 59) return null
  return { h, m }
}

export default function TimePicker5({
  value,
  onChange,
  ariaLabel,
}: {
  value: string
  onChange: (next: string) => void
  ariaLabel: string
}) {
  const parsed = parse(value)
  const h = parsed?.h ?? ''
  const m = parsed?.m ?? ''

  // A value saved before this picker existed can sit off the 5-minute grid (23:07).
  // Offer it as its own option rather than snapping the display: silently showing
  // 23:05 for a row that says 23:07 would be the picker lying about stored data.
  // It disappears as soon as the user picks anything else.
  const minutes = m && !MINUTES.includes(m) ? [...MINUTES, m].sort() : MINUTES

  const emit = (nextH: string, nextM: string) => {
    if (!nextH || !nextM) return
    onChange(`${nextH}:${nextM}`)
  }

  const cls = 'field !w-auto !px-2 !py-2.5 text-center tabular-nums'

  return (
    <div className="flex items-center gap-1" role="group" aria-label={ariaLabel}>
      <select className={cls} aria-label={`${ariaLabel} hour`} value={h} onChange={(e) => emit(e.target.value, m || '00')}>
        {!h && <option value="">--</option>}
        {HOURS.map((x) => (
          <option key={x} value={x}>{x}</option>
        ))}
      </select>
      <span className="text-ink-400">:</span>
      <select className={cls} aria-label={`${ariaLabel} minute`} value={m} onChange={(e) => emit(h || '00', e.target.value)}>
        {!m && <option value="">--</option>}
        {minutes.map((x) => (
          <option key={x} value={x}>{x}</option>
        ))}
      </select>
    </div>
  )
}
