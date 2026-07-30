import { useEffect, useState } from 'react'
import { sleepOn, upsertSleep } from '../db/queries'
import { sleepDurationMin } from '../lib/dates'

// Where the native time wheel opens when the field is still empty. Without this
// iOS starts at the current time, which is never the answer — you log sleep in
// the morning, not at bedtime. Deliberately NOT applied as an initial state
// value: the fields must stay visibly empty until tapped, or "Save sleep" would
// write a night you never actually had.
const DEFAULT_BEDTIME = '23:00'
const DEFAULT_WAKE = '09:00'

// Set the DOM value as well as React state. The picker snapshots the input the
// moment it opens, and a setState alone can land a frame too late for that —
// writing the element directly makes the value present immediately, with the
// state update keeping React in sync so the next render doesn't undo it.
function prefill(
  el: HTMLInputElement,
  current: string,
  set: (v: string) => void,
  fallback: string,
): void {
  if (current) return
  el.value = fallback
  set(fallback)
}

// Bedtime, wake time, and felt quality for the selected day. Separate from
// QuickEntryPanel because sleep is three related fields saved together, not one
// slider — duration is computed live from the two times, never stored.
export default function SleepCard({ date, onChanged }: { date: string; onChanged: () => void }) {
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [quality, setQuality] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [justSaved, setJustSaved] = useState(false)

  useEffect(() => {
    const row = sleepOn(date)
    setStart(row?.sleep_start ?? '')
    setEnd(row?.sleep_end ?? '')
    setQuality(row?.sleep_quality ?? null)
    setJustSaved(false)
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

  return (
    <div className="card space-y-3">
      <div className="label">Sleep</div>
      <div className="flex items-end gap-3">
        <div>
          <label className="label !mb-1 !text-[10px]">Bedtime</label>
          <input
            type="time"
            step={300}
            className="field !w-auto"
            value={start}
            onFocus={(e) => prefill(e.currentTarget, start, setStart, DEFAULT_BEDTIME)}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        <div>
          <label className="label !mb-1 !text-[10px]">Wake</label>
          <input
            type="time"
            step={300}
            className="field !w-auto"
            value={end}
            onFocus={(e) => prefill(e.currentTarget, end, setEnd, DEFAULT_WAKE)}
            onChange={(e) => setEnd(e.target.value)}
          />
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
    </div>
  )
}
