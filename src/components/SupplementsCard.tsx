import { useMemo, useRef, useState } from 'react'
import {
  activeSupplements, stoppedSupplements, saveSupplement, stopSupplement, deleteSupplement,
  updateSupplement,
} from '../db/queries'
import { prepareImage, type PreparedImage } from '../lib/image'
import { isConfigured, pushPhoto } from '../sync/dropbox'
import { fmtDate } from '../lib/dates'
import { uid } from '../lib/id'
import { IconCamera } from './icons'
import type { Supplement } from '../types'

const CHECKIN_CHOICES = [7, 14, 30]

// An ongoing regimen — unlike EventsCard's one-off "started X" marker, this has a
// start, an optional stop, and a recurring "how's it going?" check-in (rendered
// separately in LogTab, above this card, when one falls due — see
// pendingSupplementCheckins()). Composition is typed, or attached as a photo of
// the label for your own later reference: nothing here reads the photo with
// Claude, it's just stored like a meal photo.
export default function SupplementsCard({ date, onChanged }: { date: string; onChanged: () => void }) {
  const [name, setName] = useState('')
  const [composition, setComposition] = useState('')
  const [photo, setPhoto] = useState<PreparedImage | null>(null)
  const [checkinDays, setCheckinDays] = useState(14)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showStopped, setShowStopped] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [justAddedId, setJustAddedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Supplement | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const active = useMemo(() => activeSupplements(), [refresh])
  const stopped = useMemo(() => stoppedSupplements(), [refresh, showStopped])

  async function onPickPhoto(file: File) {
    setError(null)
    try {
      setPhoto(await prepareImage(file))
    } catch (e) {
      setError(msg(e))
    }
  }

  async function add() {
    if (!name.trim()) return
    setBusy(true)
    setError(null)
    try {
      let photoPath: string | null = null
      if (photo && isConfigured()) {
        photoPath = await pushPhoto(photo.bytes, `supplement-${uid().slice(0, 8)}.jpg`)
      }
      const id = await saveSupplement(name.trim(), composition.trim() || null, photoPath, date, checkinDays)
      setName('')
      setComposition('')
      setPhoto(null)
      setRefresh((k) => k + 1)
      onChanged()
      // Briefly highlight the new row — it lands directly below this form, but a
      // silent, unhighlighted list update after tapping "Add" is easy to miss.
      setJustAddedId(id)
      setTimeout(() => setJustAddedId(null), 2000)
    } catch (e) {
      setError(msg(e))
    } finally {
      setBusy(false)
    }
  }

  async function stop(s: Supplement) {
    if (!confirm(`Stop "${s.name}"? You can still see it under Stopped, but it won't ask for check-ins anymore.`)) return
    await stopSupplement(s.id)
    setRefresh((k) => k + 1)
    onChanged()
  }

  async function remove(id: string) {
    if (!confirm('Delete this supplement entirely? This cannot be undone.')) return
    await deleteSupplement(id)
    setRefresh((k) => k + 1)
    onChanged()
  }

  async function saveEdit(id: string, patch: Parameters<typeof updateSupplement>[1]) {
    await updateSupplement(id, patch)
    setEditing(null)
    setRefresh((k) => k + 1)
    onChanged()
  }

  return (
    <div className="card space-y-3">
      <div className="label">Supplements</div>

      <div className="space-y-2 rounded-lg bg-ink-900 p-3">
        <input
          className="field"
          placeholder="Name, e.g. 'Magnesium glycinate'"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <textarea
          className="field min-h-[2.5rem]"
          placeholder="Dose / composition (optional) — typed, or attach a photo of the label below"
          value={composition}
          onChange={(e) => setComposition(e.target.value)}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void onPickPhoto(f)
            e.target.value = ''
          }}
        />
        {photo ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <img src={photo.dataUrl} alt="" className="h-10 w-10 rounded-lg object-cover" />
              <span className="text-xs text-ink-400">Label photo attached</span>
              <button className="ml-auto text-xs text-ink-500 hover:text-red-400" onClick={() => setPhoto(null)}>
                Remove
              </button>
            </div>
            {/* Photos live in Dropbox, not in the local database — without a
                connection there's nowhere to put it, and saying so beats
                dropping it silently. */}
            {!isConfigured() && (
              <p className="text-xs text-amber-300">
                Dropbox isn't connected, so this photo won't be saved — the supplement still will.
              </p>
            )}
          </div>
        ) : (
          <button className="btn-ghost w-full !py-2 text-xs" onClick={() => fileRef.current?.click()}>
            <IconCamera width={16} height={16} /> Attach a photo of the label
          </button>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-ink-400">Check in every</span>
          {CHECKIN_CHOICES.map((d) => (
            <button
              key={d}
              type="button"
              className={checkinDays === d ? 'chip-on !py-0.5 !text-xs' : 'chip !py-0.5 !text-xs'}
              onClick={() => setCheckinDays(d)}
            >
              {d}d
            </button>
          ))}
        </div>
        <button className="btn-primary w-full !py-2 text-sm" disabled={busy || !name.trim()} onClick={() => void add()}>
          {justAddedId ? 'Added ✓' : 'Add supplement'}
        </button>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>

      {/* Directly below the form — where you're already looking right after
          tapping Add — rather than above it, where a new entry is easy to miss
          without scrolling back up. */}
      {active.length > 0 && (
        <div className="space-y-1.5">
          {active.map((s) => (
            <div
              key={s.id}
              className="rounded-lg bg-ink-900 px-3 py-2 text-xs transition-colors duration-500"
              style={s.id === justAddedId ? { background: 'var(--accent-dim)' } : undefined}
            >
              {editing?.id === s.id ? (
                <SupplementEditor
                  supplement={s}
                  onCancel={() => setEditing(null)}
                  onSave={(patch) => void saveEdit(s.id, patch)}
                />
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-sm text-cream">{s.name}</span>
                    <div className="flex shrink-0 gap-2">
                      <button className="text-ink-500 hover:text-cream" onClick={() => setEditing(s)}>
                        Edit
                      </button>
                      <button className="text-ink-500 hover:text-cream" onClick={() => void stop(s)}>
                        Stop
                      </button>
                      <button className="text-ink-500 hover:text-red-400" onClick={() => void remove(s.id)} aria-label="Delete">
                        ✕
                      </button>
                    </div>
                  </div>
                  {s.composition && <div className="mt-0.5 text-ink-300">{s.composition}</div>}
                  <div className="mt-0.5 text-ink-400">
                    since {fmtDate(s.start_date)} · check-in every {s.checkin_days}d
                    {s.photo_path ? ' · 📷' : ''}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {stopped.length > 0 && (
        <div>
          <button className="text-xs text-ink-400 underline" onClick={() => setShowStopped((v) => !v)}>
            {showStopped ? 'Hide' : 'Show'} stopped ({stopped.length})
          </button>
          {showStopped && (
            <div className="mt-1.5 space-y-1.5">
              {stopped.map((s) => (
                <div key={s.id} className="rounded-lg bg-ink-900 px-3 py-2 text-xs">
                  {editing?.id === s.id ? (
                    <SupplementEditor
                      supplement={s}
                      onCancel={() => setEditing(null)}
                      onSave={(patch) => void saveEdit(s.id, patch)}
                    />
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-ink-300">
                        {s.name} · {fmtDate(s.start_date)}–{fmtDate(s.end_date!)}
                      </span>
                      <div className="flex shrink-0 gap-2">
                        <button className="text-ink-500 hover:text-cream" onClick={() => setEditing(s)}>
                          Edit
                        </button>
                        <button className="text-ink-500 hover:text-red-400" onClick={() => void remove(s.id)} aria-label="Delete">
                          ✕
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Inline editor for one supplement. Same fields as the add form plus the dates —
// a start date typed wrong, or a stop date that should have been last Tuesday, used
// to mean deleting the row and losing its accumulated check-in notes with it.
function SupplementEditor({
  supplement,
  onSave,
  onCancel,
}: {
  supplement: Supplement
  onSave: (patch: {
    name: string; composition: string | null; start_date: string
    end_date: string | null; checkin_days: number
  }) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(supplement.name)
  const [composition, setComposition] = useState(supplement.composition ?? '')
  const [startDate, setStartDate] = useState(supplement.start_date)
  const [endDate, setEndDate] = useState(supplement.end_date ?? '')
  const [checkinDays, setCheckinDays] = useState(supplement.checkin_days)

  return (
    <div className="space-y-2">
      <input className="field !py-1.5 text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
      <textarea
        className="field min-h-[2.5rem] !py-1.5 text-sm"
        value={composition}
        onChange={(e) => setComposition(e.target.value)}
        placeholder="Dose / composition"
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-ink-400">From</label>
        <input type="date" className="field !w-auto !py-1 text-xs" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <label className="text-ink-400">Until</label>
        <input type="date" className="field !w-auto !py-1 text-xs" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
      </div>
      {/* Clearing the end date puts it back on the active list and restarts its
          check-ins — the way to say "actually, I'm still taking this". */}
      <p className="text-ink-500">Leave “Until” empty if you're still taking it.</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-ink-400">Check in every</span>
        {CHECKIN_CHOICES.map((d) => (
          <button
            key={d}
            type="button"
            className={checkinDays === d ? 'chip-on !py-0.5 !text-xs' : 'chip !py-0.5 !text-xs'}
            onClick={() => setCheckinDays(d)}
          >
            {d}d
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button className="btn-ghost flex-1 !py-1.5 text-xs" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="btn-primary flex-1 !py-1.5 text-xs"
          disabled={!name.trim() || !startDate}
          onClick={() =>
            onSave({
              name: name.trim(),
              composition: composition.trim() || null,
              start_date: startDate,
              end_date: endDate || null,
              checkin_days: checkinDays,
            })
          }
        >
          Save changes
        </button>
      </div>
    </div>
  )
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
