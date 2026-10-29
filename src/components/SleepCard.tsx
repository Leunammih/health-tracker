import { useEffect, useState } from 'react'
import { sleepOn, upsertSleep } from '../db/queries'
import { fmtDate, sleepDurationMin } from '../lib/dates'
import { applyTargets, rangeLabel } from '../lib/applyBack'
import TimePicker5 from './TimePicker5'

// Where the picker opens for a day with no sleep saved yet. Harmless to pre-fill:
// nothing reaches the database until "Save sleep" is tapped, same as every other
// quick-entry control in this app.
const DEFAULT_BEDTIME = '23:00'
const DEFAULT_WAKE = '09:00'

// Bedtime, wake time, and felt quality for the selected day. Separate from
// QuickEntryPanel because sleep is three related fields saved together, not one
// slider — duration is computed live from the two times, never stored.
export default function SleepCard({ date, onChanged }: { date: string; onChanged: () => void }) {
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [quality, setQuality] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [applied, setApplied] = useState<string | null>(null)

  useEffect(() => {
    const row = sleepOn(date)
    setStart(row?.sleep_start ?? DEFAULT_BEDTIME)
    setEnd(row?.sleep_end ?? DEFAULT_WAKE)
    setQuality(row?.sleep_quality ?? null)
    setJustSaved(false)
    setApplied(null)
  }, [date])

  const duration = start && end ? sleepDurationMin(start, end) : null

  async function save() {
    setBusy(true)
    try {
      await upsertSleep(date, start || null, end || null, quality)
      setJustSaved(true)
      onChanged()
      setTimeout(() => setJustSaved(false), 1500)
    } finally {
      setBusy(false)
    }
  }

  // Same bedtime, wake and felt quality onto other nights, counted back from the
  // selected day like every other "apply" control (lib/applyBack.ts). Overwrites
  // those nights' sleep — there's no note to merge, and a night has one bedtime.
  async function applyTo(days: string[]) {
    setBusy(true)
    try {
      for (const d of days) await upsertSleep(d, start || null, end || null, quality)
      setApplied(`Saved for ${days.length === 1 ? fmtDate(days[0]) : rangeLabel(days)}`)
      onChanged()
      setTimeout(() => setApplied(null), 2200)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card space-y-3">
      <div className="label">Sleep</div>
      <div className="flex items-end gap-3">
        <div>
          <div className="label !mb-1 !text-[10px]">Bedtime</div>
          <TimePicker5 value={start} onChange={setStart} ariaLabel="Bedtime" />
        </div>
        <div>
          <div className="label !mb-1 !text-[10px]">Wake</div>
          <TimePicker5 value={end} onChange={setEnd} ariaLabel="Wake time" />
        </div>
        {duration != null && (
          <div className="ml-auto text-right">
            <div className="font-serif text-xl leading-none text-cream">
              {Math.floor(duration / 60)}h{duration % 60 ? ` ${duration % 60}m` : ''}
            </div>
            <div className="text-[10px] text-ink-400">asleep</div>
          </div>
        )}
      </div>
      <div>
        <div className="flex items-baseline justify-between">
          <label className="label !mb-0">Felt quality</label>
          <span className="font-serif text-lg text-cream">{quality != null ? `${quality}/10` : '—'}</span>
        </div>
        <input
          type="range"
          min={0}
          max={10}
          step={1}
          value={quality ?? 0}
          onChange={(e) => setQuality(Number(e.target.value))}
          className="mt-1 w-full"
        />
      </div>
      <button className="btn-primary w-full !py-2 text-sm" disabled={busy} onClick={() => void save()}>
        {justSaved ? '✓ Saved' : 'Save sleep'}
      </button>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-ink-500">Also apply to:</span>
        {applyTargets(date).map((t) => (
          <button key={t.key} type="button" className="chip !px-2.5 !py-0.5 !text-xs" disabled={busy} onClick={() => void applyTo(t.days)}>
            {t.label}
          </button>
        ))}
      </div>
      {applied && <div className="text-xs text-brand-300">{applied}</div>}
    </div>
  )
}
