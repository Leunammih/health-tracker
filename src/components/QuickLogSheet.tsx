import { useEffect, useMemo, useState } from 'react'
import DayStrip from './DayStrip'
import { colorForTrack, labelForTrack, scaleForTrack } from '../lib/metrics'
import { upsertTrackValue, trackRowOn, lastTrackValueOnOrBefore, tracksSince } from '../db/queries'
import { fmtDate } from '../lib/dates'
import { IconNote } from './icons'

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
  const [status, setStatus] = useState<string | null>(null) // transient confirmation
  const [noteDraft, setNoteDraft] = useState('')
  const [noteTouched, setNoteTouched] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [version, setVersion] = useState(0)

  const scale = scaleForTrack(name, category)
  const color = colorForTrack(name)
  const label = labelForTrack(name)

  // Which days already have this item — shown as dots on the strip.
  const logged = useMemo(() => {
    const rows = tracksSince(dates[0]).filter((t) => t.name === name.trim().toLowerCase() && t.value != null)
    return new Set(rows.map((t) => t.date))
  }, [dates, name, version])

  // When the day changes: show that day's saved value and note, or fall back to the
  // most recent earlier value (the user's "default is the value of the day before").
  useEffect(() => {
    const row = trackRowOn(date, name)
    const fallback = lastTrackValueOnOrBefore(date, name)
    setValue(row?.value ?? fallback ?? 0)
    setNoteDraft(row?.notes ?? '')
    setNoteTouched(false)
    setStatus(null)
  }, [date, name, version])

  // `withNote` only when committing the day currently on screen — the bulk helpers
  // below omit it so every other day keeps its own note.
  async function save(forDate: string, v: number | null, withNote = false) {
    setBusy(true)
    try {
      const noteArg = withNote && noteTouched ? (noteDraft.trim() || null) : undefined
      await upsertTrackValue(forDate, name, category, v, v == null ? null : scale.unit, noteArg)
      setVersion((k) => k + 1)
      onChanged()
      setStatus(v == null ? `Cleared ${fmtDate(forDate)}` : `Saved ${v}${scale.unit} for ${fmtDate(forDate)}`)
      setTimeout(() => setStatus(null), 2000)
    } finally {
      setBusy(false)
    }
  }

  // Copy the current slider value onto the last N days in one go. Notes are left
  // alone — each day keeps whatever it already had.
  async function applyLastNDays(n: number) {
    setBusy(true)
    try {
      const targets = dates.slice(-n)
      for (const d of targets) {
        await upsertTrackValue(d, name, category, value, scale.unit)
      }
      setVersion((k) => k + 1)
      onChanged()
      setStatus(`Saved ${value}${scale.unit} for the last ${n} days`)
      setTimeout(() => setStatus(null), 2200)
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
          type="button"
          onClick={() => setNoteOpen((o) => !o)}
          aria-expanded={noteOpen}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-ink-800 px-3 py-2 text-xs text-ink-300 hover:bg-ink-700"
        >
          <IconNote width={14} height={14} />
          {noteDraft.trim() ? 'Edit note' : 'Add note'}
          {noteDraft.trim() && !noteOpen && <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />}
        </button>
        {noteOpen && (
          <textarea
            className="field mt-2 min-h-[2.75rem] !py-2"
            placeholder="Additional information — e.g. 'right knee only, worse on stairs'"
            value={noteDraft}
            onChange={(e) => { setNoteDraft(e.target.value); setNoteTouched(true) }}
          />
        )}

        <button
          className="btn-primary mt-3 w-full"
          disabled={busy}
          onClick={() => void save(date, value, true)}
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

        <div className="mt-3 h-4 text-center text-xs text-brand-300">{status}</div>
      </div>
    </div>
  )
}
