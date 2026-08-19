import { useMemo, useState } from 'react'
import { eventsSince, saveEvent, deleteEvent } from '../db/queries'
import { fmtDate, daysAgoISO } from '../lib/dates'

// No "Supplement" any more: supplements have their own card, and Insights now draws
// their start and stop lines automatically from that table (see eventMarkers in
// InsightsTab). Offering it here as well was the overlap — it invited logging the
// same thing twice to get both the check-in rhythm and the chart line.
const KINDS: { value: string; label: string }[] = [
  { value: 'diet', label: 'Diet' },
  { value: 'medication', label: 'Medication' },
  { value: 'life', label: 'Life' },
  { value: 'other', label: 'Other' },
]

// One-off markers ("began low-FODMAP", "moved house") — not a metric trended over
// time, just a point in time shown as a reference line across Insights charts so a
// change of circumstances is visible against the trends.
export default function EventsCard({ date, onChanged }: { date: string; onChanged: () => void }) {
  const [label, setLabel] = useState('')
  const [kind, setKind] = useState(KINDS[0].value)
  const [busy, setBusy] = useState(false)
  const [refresh, setRefresh] = useState(0)

  const recent = useMemo(() => eventsSince(daysAgoISO(30)), [refresh])

  async function add() {
    if (!label.trim()) return
    setBusy(true)
    try {
      await saveEvent(date, kind, label.trim())
      setLabel('')
      setRefresh((k) => k + 1)
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    await deleteEvent(id)
    setRefresh((k) => k + 1)
    onChanged()
  }

  return (
    <div className="card space-y-3">
      <div className="label">Mark a change</div>
      <p className="text-xs text-ink-400">
        Anything that changed and might explain a shift in your trends — a diet, a medication, a move,
        a stretch of travel. It isn't tracked over time; it draws one dated line across your Insights
        charts so you can see what happened either side of it.
        <span className="block mt-1 text-ink-500">
          Supplements don't belong here — add them above and their start and stop lines appear on the
          charts on their own.
        </span>
      </p>
      <div className="flex flex-wrap gap-1.5">
        {KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            className={kind === k.value ? 'chip-on' : 'chip'}
            onClick={() => setKind(k.value)}
          >
            {k.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className="field flex-1"
          placeholder="e.g. 'began low-FODMAP', 'started antibiotics', 'moved flat'"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <button className="btn-primary shrink-0 !px-4" disabled={busy || !label.trim()} onClick={() => void add()}>
          Add
        </button>
      </div>
      {recent.length > 0 && (
        <div className="space-y-1.5">
          {recent.map((e) => (
            <div key={e.id} className="flex items-center justify-between rounded-lg bg-ink-900 px-3 py-2 text-xs">
              <span className="text-ink-300">
                {fmtDate(e.date)} · {e.label}
              </span>
              <button className="text-ink-500 hover:text-red-400" onClick={() => void remove(e.id)} aria-label="Delete event">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
