import { useEffect, useMemo, useState } from 'react'
import DayStrip from './DayStrip'
import { colorForTrack, labelForTrack, scaleForTrack } from '../lib/metrics'
import { upsertTrackValue, trackValueOn, lastTrackValueOnOrBefore, tracksSince } from '../db/queries'
import { fmtDate } from '../lib/dates'

// Tap a tracked item (knee pain, dancing, breath work…) → pick a day → drag the
// slider → confirm. The sheet stays open after confirming so several days can be
// filled in one sitting: pick another day, drag, confirm again.
export default function QuickLogSheet({
  name,
  category,
  dates,
  initialDate,
  onClose,
  onChanged,
}: {
  name: string
  category: string | null
  dates: string[] // oldest → newest
  initialDate?: string
  onClose: () => void
  onChanged: () => void
}) {
  const today = dates[dates.length - 1]
  const [date, setDate] = useState(initialDate ?? today)
  const [value, setValue] = useState(0)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  const scale = scaleForTrack(name, category)
  const color = colorForTrack(name)
  const label = labelForTrack(name)

  // Which days already have this item — shown as dots on the strip.
  const logged = useMemo(() => {
    const rows = tracksSince(dates[0]).filter((t) => t.name === name.trim().toLowerCase() && t.value != null)
    return new Set(rows.map((t) => t.date))
  }, [dates, name, version])

  // When the day changes: show that day's saved value, or fall back to the most
  // recent earlier value (the user's "default is the value of the day before").
  useEffect(() => {
    const existing = trackValueOn(date, name)
    const fallback = lastTrackValueOnOrBefore(date, name)
    setValue(existing ?? fallback ?? 0)
    setNote(null)
  }, [date, name, version])

  async function save(forDate: string, v: number | null) {
    setBusy(true)
    try {
      await upsertTrackValue(forDate, name, category, v, v == null ? null : scale.unit)
      setVersion((k) => k + 1)
      onChanged()
      setNote(v == null ? `Cleared ${fmtDate(forDate)}` : `Saved ${v}${scale.unit} for ${fmtDate(forDate)}`)
      setTimeout(() => setNote(null), 2000)
    } finally {
      setBusy(false)
    }
  }

  // Copy the current slider value onto the last N days in one go.
  async function applyLastNDays(n: number) {
    setBusy(true)
    try {
      const targets = dates.slice(-n)
      for (const d of targets) {
        await upsertTrackValue(d, name, category, value, scale.unit)
      }
      setVersion((k) => k + 1)
      onChanged()
      setNote(`Saved ${value}${scale.unit} for the last ${n} days`)
      setTimeout(() => setNote(null), 2200)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl border-t border-ink-700 bg-ink-900 p-4 pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <span className="h-3 w-3 rounded-full" style={{ background: color }} />
            <span className="font-semibold">{label}</span>
          </div>
          <button className="text-sm text-ink-400 hover:text-white" onClick={onClose}>
            Done
          </button>
        </div>

        <div className="label mb-1">Day</div>
        <DayStrip dates={dates} selected={date} onSelect={setDate} marked={logged} />

        <div className="mt-4 flex items-baseline justify-between">
          <div className="label !mb-0">{scale.unit === '/10' ? 'Level' : scale.unit === '%' ? 'Intensity' : 'Duration'}</div>
          <div className="text-2xl font-semibold text-white">
            {value}
            <span className="ml-1 text-sm text-ink-400">{scale.unit}</span>
          </div>
        </div>
        <input
          type="range"
          min={scale.min}
          max={scale.max}
          step={scale.step}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          className="mt-2 w-full accent-brand-500"
          style={{ accentColor: color }}
        />
        <div className="flex justify-between text-[10px] text-ink-500">
          <span>{scale.min}</span>
          <span>{scale.max}{scale.unit}</span>
        </div>

        <button
          className="btn-primary mt-3 w-full"
          disabled={busy}
          onClick={() => void save(date, value)}
        >
          Save {value}{scale.unit} for {fmtDate(date)}
        </button>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button className="btn-ghost !py-2 text-xs" disabled={busy} onClick={() => void applyLastNDays(3)}>
            Apply to last 3 days
          </button>
          <button className="btn-ghost !py-2 text-xs" disabled={busy} onClick={() => void applyLastNDays(7)}>
            Apply to last 7 days
          </button>
          <button
            className="btn-ghost !py-2 text-xs"
            disabled={busy}
            onClick={() => {
              const y = dates[dates.length - 2]
              if (y) void save(y, value)
            }}
          >
            Same for yesterday
          </button>
          <button
            className="rounded-xl bg-ink-800 px-3 py-2 text-xs text-red-400 hover:bg-ink-700"
            disabled={busy}
            onClick={() => void save(date, null)}
          >
            Clear this day
          </button>
        </div>

        <div className="mt-3 h-4 text-center text-xs text-brand-300">{note}</div>
      </div>
    </div>
  )
}
