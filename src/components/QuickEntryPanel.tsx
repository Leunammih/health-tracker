import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { trackNamesSince } from '../db/queries'
import {
  colorForTrack, labelForTrack, scaleForTrack, groupForTrack, categoryForDef, defForName,
  QUICK_LOG_ITEMS, PINNED_QUICK_ENTRY_ITEMS, PINNED_QUICK_ENTRY_KEYS, TRACK_DEFS,
  type MetricGroup, type TrackDef,
} from '../lib/metrics'
import { readMetric, lastMetricValue, writeMetric } from '../lib/metricStore'
import { daysAgoISO } from '../lib/dates'
import { IconNote } from './icons'

const GROUP_ORDER: { group: MetricGroup; title: string }[] = [
  { group: 'movement', title: 'Movement' },
  { group: 'practice', title: 'Practice' },
  { group: 'symptom', title: 'Health & pain' },
  { group: 'wellbeing', title: 'Wellbeing' },
  { group: 'other', title: 'Other' },
]

// Canonical display order. Sorting by position in the registry (never by how often
// something has been logged) is what keeps rows from swapping places under your
// thumb when a save changes a row count.
const DEF_INDEX = new Map(TRACK_DEFS.map((d, i) => [d.key, i]))

// Items a plain "+5 min, tap again to add more" chip makes sense for — duration-based
// movement/practice metrics. Pain/symptom (/10) and release (%) don't fit a running
// increment, so they stay in the categorized slider list above instead.
const QUICK_LOG_STEP_ITEMS = QUICK_LOG_ITEMS.filter((d) => d.unit === 'min')

interface Item {
  name: string
  category: string | null
  def: TrackDef | undefined
}

interface RowState {
  value: number
  note: string
  noteTouched: boolean
}
interface SavedState {
  value: number | null
  note: string | null
}

// Read a row's persisted state — dispatches to whichever table the metric actually
// lives in (tracks / wellbeing / day_context), see lib/metricStore.ts.
function readSaved(date: string, item: Item): SavedState {
  return readMetric(date, item.name)
}

// Where a slider starts: today's saved value, else the most recent earlier one, else
// the bottom of the scale.
function readFallback(date: string, item: Item): number | null {
  return lastMetricValue(date, item.name)
}

function initRow(date: string, item: Item, saved: SavedState): RowState {
  const scale = scaleForTrack(item.name, item.category)
  return {
    value: saved.value ?? readFallback(date, item) ?? scale.min,
    note: saved.note ?? '',
    noteTouched: false,
  }
}

// Everything tracked in the last week (plus energy and mood, always), grouped by
// category, each with a slider for the selected day. A slider starts at the last
// known value, so a steady habit is one tap to confirm rather than re-entry.
//
// Draft state lives HERE, not in the rows. One owner means saving one row can never
// disturb another — the previous per-row version shared a refresh counter, so every
// save reset every other slider.
export default function QuickEntryPanel({
  date,
  onChanged,
}: {
  date: string
  onChanged: () => void
}) {
  const [extra, setExtra] = useState<string[]>([]) // items added via quick-add this session
  const [busy, setBusy] = useState(false)
  const [justSaved, setJustSaved] = useState<string | null>(null)
  const [qlBusy, setQlBusy] = useState<string | null>(null)
  const [qlFlash, setQlFlash] = useState<string | null>(null)

  // Names logged in the last 7 days. Independent of `date` (the window is relative to
  // today), and the panel unmounts between log phases, so this never needs refreshing
  // mid-session — which is precisely what used to reset the sliders.
  const recent = useMemo(() => trackNamesSince(daysAgoISO(7)), [])

  const items = useMemo<Item[]>(() => {
    const map = new Map<string, string | null>()
    for (const d of PINNED_QUICK_ENTRY_ITEMS) map.set(d.key, null)
    for (const r of recent) if (!map.has(r.name)) map.set(r.name, r.category)
    for (const name of extra) {
      if (!map.has(name)) {
        const def = defForName(name)
        map.set(name, def ? categoryForDef(def) : null)
      }
    }
    return [...map.entries()]
      .map(([name, category]) => ({ name, category, def: defForName(name) }))
      .sort((a, b) => {
        const ia = DEF_INDEX.get(a.def?.key ?? '') ?? Number.MAX_SAFE_INTEGER
        const ib = DEF_INDEX.get(b.def?.key ?? '') ?? Number.MAX_SAFE_INTEGER
        if (ia !== ib) return ia - ib
        return labelForTrack(a.name).localeCompare(labelForTrack(b.name))
      })
  }, [recent, extra])

  const [saved, setSaved] = useState<Map<string, SavedState>>(() => initSavedMap(date, items))
  const [drafts, setDrafts] = useState<Map<string, RowState>>(() => initDraftMap(date, items))

  // Switching day: reload everything from the DB. Unsaved slider positions are
  // discarded — the correct reading of an explicit-save panel.
  useEffect(() => {
    setSaved(initSavedMap(date, items))
    setDrafts(initDraftMap(date, items))
    setJustSaved(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  // A newly added item needs its own initial state, without disturbing drafts the
  // user has already adjusted.
  useEffect(() => {
    setSaved((prev) => {
      const next = new Map(prev)
      let changed = false
      for (const it of items) {
        if (!next.has(it.name)) { next.set(it.name, readSaved(date, it)); changed = true }
      }
      return changed ? next : prev
    })
    setDrafts((prev) => {
      const next = new Map(prev)
      let changed = false
      for (const it of items) {
        if (!next.has(it.name)) { next.set(it.name, initRow(date, it, readSaved(date, it))); changed = true }
      }
      return changed ? next : prev
    })
  }, [items, date])

  const setDraft = useCallback((name: string, patch: Partial<RowState>) => {
    setDrafts((prev) => {
      const cur = prev.get(name)
      if (!cur) return prev
      const next = new Map(prev)
      next.set(name, { ...cur, ...patch })
      return next
    })
  }, [])

  const isDirty = useCallback(
    (it: Item) => {
      const d = drafts.get(it.name)
      const s = saved.get(it.name)
      if (!d || !s) return false
      if (d.value !== s.value) return true
      return d.noteTouched && (d.note.trim() || null) !== s.note
    },
    [drafts, saved],
  )

  // A row that has never been saved for this day can be confirmed at its
  // carried-forward value in one tap.
  const canSave = useCallback(
    (it: Item) => !busy && (isDirty(it) || saved.get(it.name)?.value == null),
    [busy, isDirty, saved],
  )

  async function persistItem(it: Item) {
    const d = drafts.get(it.name)
    if (!d) return
    // Only send a note when the field was actually edited; otherwise omit it so the
    // DB layer keeps whatever is already stored.
    const noteArg = d.noteTouched ? (d.note.trim() || null) : undefined
    await writeMetric(date, it.name, d.value, noteArg)
    setSaved((prev) => {
      const next = new Map(prev)
      const cur = prev.get(it.name)
      next.set(it.name, {
        value: d.value,
        note: d.noteTouched ? (d.note.trim() || null) : (cur?.note ?? null),
      })
      return next
    })
    setDraft(it.name, { noteTouched: false })
  }

  async function saveOne(it: Item) {
    setBusy(true)
    try {
      await persistItem(it)
      setJustSaved(it.name)
      setTimeout(() => setJustSaved((n) => (n === it.name ? null : n)), 1500)
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  // One tap = one step (5 min) added to today's total for that item, written straight
  // to the DB — no slider stop-off. Also folds the item into the categorized list above
  // (via `extra`) so its slider reflects the new total and can be fine-tuned from there.
  async function tapQuickLog(def: TrackDef) {
    setQlBusy(def.key)
    try {
      const current = readMetric(date, def.key).value ?? 0
      const next = Math.min(current + def.step, def.max)
      await writeMetric(date, def.key, next)
      setSaved((prev) => {
        const next2 = new Map(prev)
        next2.set(def.key, { value: next, note: prev.get(def.key)?.note ?? null })
        return next2
      })
      setDrafts((prev) => {
        const next2 = new Map(prev)
        const cur = prev.get(def.key)
        next2.set(def.key, cur ? { ...cur, value: next } : { value: next, note: '', noteTouched: false })
        return next2
      })
      setExtra((e) => (e.includes(def.key) ? e : [...e, def.key]))
      setQlFlash(def.key)
      setTimeout(() => setQlFlash((k) => (k === def.key ? null : k)), 900)
      onChanged()
    } finally {
      setQlBusy(null)
    }
  }

  const dirtyItems = items.filter((it) => isDirty(it))

  async function saveAll() {
    if (!dirtyItems.length) return
    setBusy(true)
    try {
      for (const it of dirtyItems) await persistItem(it)
      setJustSaved('__all__')
      setTimeout(() => setJustSaved((n) => (n === '__all__' ? null : n)), 1500)
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  const grouped = GROUP_ORDER.map((g) => ({
    ...g,
    rows: items.filter((it) => groupForTrack(it.name, it.category) === g.group),
  })).filter((g) => g.rows.length)

  // Standard items not already shown — tap to add a row for this day. Energy and
  // mood are always present, so they never appear here.
  const addable = QUICK_LOG_ITEMS.filter(
    (d) =>
      !items.some((it) => it.name === d.key) &&
      !(PINNED_QUICK_ENTRY_KEYS as readonly string[]).includes(d.key),
  )

  return (
    <div className="card space-y-4">
      <div>
        <div className="label">Quick entry</div>
        <p className="text-xs text-ink-400">
          Sliders start at your last value. Adjust and tap Save — nothing is written until you do.
        </p>
      </div>

      {grouped.map((g) => (
        <div key={g.group} className="space-y-2">
          <div className="text-[11px] font-medium uppercase tracking-wide text-ink-500">{g.title}</div>
          {g.rows.map((it) => {
            const d = drafts.get(it.name)
            const s = saved.get(it.name)
            if (!d || !s) return null
            return (
              <QuickRow
                key={it.name}
                name={it.name}
                category={it.category}
                draft={d}
                saved={s}
                dirty={isDirty(it)}
                canSave={canSave(it)}
                justSaved={justSaved === it.name}
                onChange={(patch) => setDraft(it.name, patch)}
                onSave={() => void saveOne(it)}
              />
            )
          })}
        </div>
      ))}

      {!grouped.length && (
        <p className="text-xs text-ink-400">
          Nothing tracked in the last week yet — add something below.
        </p>
      )}

      {dirtyItems.length > 0 && (
        <button className="btn-primary w-full !py-2 text-sm" disabled={busy} onClick={() => void saveAll()}>
          {justSaved === '__all__' ? '✓ Saved' : `Save ${dirtyItems.length} changed`}
        </button>
      )}

      {QUICK_LOG_STEP_ITEMS.length > 0 && (
        <div>
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-500">Quick log</div>
          <p className="mb-1.5 text-xs text-ink-400">Tap to add 5 minutes to today's total for that item.</p>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_LOG_STEP_ITEMS.map((d) => (
              <button
                key={d.key}
                type="button"
                disabled={qlBusy === d.key}
                className="flex items-center gap-1.5 rounded-full bg-ink-800 px-2.5 py-1.5 text-xs text-ink-200 hover:bg-ink-700"
                onClick={() => void tapQuickLog(d)}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: colorForTrack(d.key) }} />
                {d.label}
                <span className="text-brand-400">{qlFlash === d.key ? '✓' : '+5'}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {addable.length > 0 && (
        <div>
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-500">Add</div>
          <div className="flex flex-wrap gap-1.5">
            {addable.map((d) => (
              <button
                key={d.key}
                className="flex items-center gap-1.5 rounded-full bg-ink-800 px-2.5 py-1.5 text-xs text-ink-200 hover:bg-ink-700"
                onClick={() => setExtra((e) => (e.includes(d.key) ? e : [...e, d.key]))}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: colorForTrack(d.key) }} />
                {d.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function initSavedMap(date: string, items: Item[]): Map<string, SavedState> {
  return new Map(items.map((it) => [it.name, readSaved(date, it)]))
}
function initDraftMap(date: string, items: Item[]): Map<string, RowState> {
  return new Map(items.map((it) => [it.name, initRow(date, it, readSaved(date, it))]))
}

// Presentational and memoised: dragging one slider re-renders only its own row.
const QuickRow = memo(function QuickRow({
  name,
  category,
  draft,
  saved,
  dirty,
  canSave,
  justSaved,
  onChange,
  onSave,
}: {
  name: string
  category: string | null
  draft: RowState
  saved: SavedState
  dirty: boolean
  canSave: boolean
  justSaved: boolean
  onChange: (patch: Partial<RowState>) => void
  onSave: () => void
}) {
  const [noteOpen, setNoteOpen] = useState(false)
  const scale = scaleForTrack(name, category)
  const color = colorForTrack(name)
  const hasNote = !!(draft.noteTouched ? draft.note.trim() : saved.note)

  return (
    <div className="py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 flex-1 items-center gap-2 text-[15px] text-cream">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
          <span className="truncate">{labelForTrack(name)}</span>
          {saved.value != null && !dirty && (
            <span className="shrink-0 text-[10px] text-brand-500">saved</span>
          )}
          {dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" aria-label="unsaved" />}
        </span>

        <span className="flex shrink-0 items-baseline gap-1">
          <span
            className={`font-serif text-xl leading-none ${
              dirty || saved.value != null ? 'text-cream' : 'text-ink-400'
            }`}
          >
            {draft.value}
          </span>
          <span className="text-[11px] text-ink-400">{scale.unit}</span>
        </span>
      </div>

      <input
        type="range"
        min={scale.min}
        max={scale.max}
        step={scale.step}
        value={draft.value}
        onChange={(e) => onChange({ value: Number(e.target.value) })}
        className="mt-1 w-full"
        style={{ accentColor: color }}
      />

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          aria-label={hasNote ? 'Edit note' : 'Add note'}
          aria-expanded={noteOpen}
          onClick={() => setNoteOpen((o) => !o)}
          className={`relative flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border text-xs ${
            noteOpen ? 'border-ink-600 bg-ink-700 text-cream' : 'border-ink-700 text-ink-300'
          }`}
        >
          <IconNote width={13} height={13} />
          {hasNote ? 'Edit note' : 'Add note'}
          {hasNote && !noteOpen && (
            <span className="absolute right-3 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-brand-500" />
          )}
        </button>

        <button
          type="button"
          disabled={!canSave}
          onClick={onSave}
          className="btn-primary h-9 shrink-0 !px-4 !py-0 text-xs"
        >
          {justSaved ? '✓ Saved' : 'Save'}
        </button>
      </div>

      {noteOpen && (
        <textarea
          className="field mt-2 min-h-[2.75rem] !py-2"
          placeholder="Additional information — e.g. 'right knee only, worse on stairs'"
          value={draft.note}
          onChange={(e) => onChange({ note: e.target.value, noteTouched: true })}
        />
      )}
    </div>
  )
})
