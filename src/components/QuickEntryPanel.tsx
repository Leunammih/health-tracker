import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { trackNamesSince } from '../db/queries'
import {
  colorForTrack, labelForTrack, scaleForTrack, clampToScale, groupForTrack, categoryForDef, defForName,
  QUICK_LOG_ITEMS, PINNED_QUICK_ENTRY_ITEMS, PINNED_QUICK_ENTRY_KEYS, TRACK_DEFS,
  type MetricGroup, type TrackDef,
} from '../lib/metrics'
import {
  loadHiddenMetrics, supplementMetricNames, isSuppressedMetric, hideMetric, unhideMetric,
} from '../lib/hiddenMetrics'
import { loadCollapsedGroups, setGroupCollapsed } from '../lib/uiPrefs'
import { readMetric, lastMetricValue, writeMetric, readSegments, writeSegment, rollupKindFor } from '../lib/metricStore'
import { daysAgoISO } from '../lib/dates'
import { IconNote } from './icons'
import { MetricIcon, GroupIcon } from './metricIcons'
import type { Segment } from '../types'

// Whether `name` should read/write a specific time-of-day segment right now, vs the
// whole-day rollup directly. 'last'-rollup metrics (weight, stool) never segment —
// a point-in-time reading doesn't split by morning/afternoon/evening.
function usesSegment(segment: Segment | null, name: string): boolean {
  return segment != null && rollupKindFor(name) !== 'last'
}

const SEGMENT_LABEL: Record<Segment, string> = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' }

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

// Read a row's persisted state. In whole-day mode this dispatches to whichever
// table the metric actually lives in (tracks / wellbeing / day_context) — see
// lib/metricStore.ts. In segment mode it reads that one segment's own value
// instead, leaving the day's rollup (and every other segment) untouched.
function readSaved(date: string, item: Item, segment: Segment | null): SavedState {
  if (usesSegment(segment, item.name)) {
    const row = readSegments(date, item.name).find((r) => r.segment === segment)
    return { value: row?.value ?? null, note: row?.notes ?? null }
  }
  return readMetric(date, item.name)
}

// Where a slider starts: today's saved value, else the most recent earlier one, else
// the bottom of the scale. The fallback is always the whole-day history — a
// morning segment with nothing logged yet still starts from your last known value,
// not zero.
function readFallback(date: string, item: Item): number | null {
  return lastMetricValue(date, item.name)
}

function initRow(date: string, item: Item, saved: SavedState): RowState {
  const scale = scaleForTrack(item.name, item.category)
  const raw = saved.value ?? readFallback(date, item) ?? scale.min
  return {
    // Clamped: rows written before a metric's scale was corrected can hold a value
    // far outside it (45 "minutes" of muscle soreness on a 0-10 slider).
    value: clampToScale(raw, scale),
    note: saved.note ?? '',
    noteTouched: false,
  }
}

// Values can now carry half steps (Bristol stool is 0.5), so a raw {draft.value}
// would render 4.5 correctly but also 6.700000000000001 after a segment rollup.
function fmtValue(v: number): string {
  return String(Math.round(v * 10) / 10)
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
  segment,
  onChanged,
}: {
  date: string
  segment: Segment | null
  onChanged: () => void
}) {
  const [extra, setExtra] = useState<string[]>([]) // items added via quick-add this session
  const [hidden, setHidden] = useState<Set<string>>(() => loadHiddenMetrics())
  const [collapsed, setCollapsed] = useState<Set<string>>(() => loadCollapsedGroups())
  const [busy, setBusy] = useState(false)
  const [justSaved, setJustSaved] = useState<string | null>(null)
  const [qlBusy, setQlBusy] = useState<string | null>(null)
  const [qlFlash, setQlFlash] = useState<string | null>(null)

  // Names logged in the last 7 days. Independent of `date` (the window is relative to
  // today), and the panel unmounts between log phases, so this never needs refreshing
  // mid-session — which is precisely what used to reset the sliders.
  const recent = useMemo(() => trackNamesSince(daysAgoISO(7)), [])

  // Supplements live in their own card with a dose and a check-in rhythm; when one
  // also lands in `tracks` it must not turn up here as a slider as well.
  const supplements = useMemo(() => supplementMetricNames(), [])

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
      .filter(([name]) => !isSuppressedMetric(name, hidden, supplements))
      .map(([name, category]) => ({ name, category, def: defForName(name) }))
      .sort((a, b) => {
        const ia = DEF_INDEX.get(a.def?.key ?? '') ?? Number.MAX_SAFE_INTEGER
        const ib = DEF_INDEX.get(b.def?.key ?? '') ?? Number.MAX_SAFE_INTEGER
        if (ia !== ib) return ia - ib
        return labelForTrack(a.name).localeCompare(labelForTrack(b.name))
      })
  }, [recent, extra, hidden, supplements])

  const [saved, setSaved] = useState<Map<string, SavedState>>(() => initSavedMap(date, segment, items))
  const [drafts, setDrafts] = useState<Map<string, RowState>>(() => initDraftMap(date, segment, items))

  // Switching day or segment: reload everything from the DB. Unsaved slider
  // positions are discarded — the correct reading of an explicit-save panel.
  useEffect(() => {
    setSaved(initSavedMap(date, segment, items))
    setDrafts(initDraftMap(date, segment, items))
    setJustSaved(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, segment])

  // A newly added item needs its own initial state, without disturbing drafts the
  // user has already adjusted.
  useEffect(() => {
    setSaved((prev) => {
      const next = new Map(prev)
      let changed = false
      for (const it of items) {
        if (!next.has(it.name)) { next.set(it.name, readSaved(date, it, segment)); changed = true }
      }
      return changed ? next : prev
    })
    setDrafts((prev) => {
      const next = new Map(prev)
      let changed = false
      for (const it of items) {
        if (!next.has(it.name)) { next.set(it.name, initRow(date, it, readSaved(date, it, segment))); changed = true }
      }
      return changed ? next : prev
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (usesSegment(segment, it.name)) {
      await writeSegment(date, segment as Segment, it.name, d.value, noteArg)
    } else {
      await writeMetric(date, it.name, d.value, noteArg)
    }
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
      const segmented = usesSegment(segment, def.key)
      const current = (segmented
        ? readSegments(date, def.key).find((r) => r.segment === segment)?.value
        : readMetric(date, def.key).value) ?? 0
      const next = Math.min(current + def.step, def.max)
      if (segmented) {
        await writeSegment(date, segment as Segment, def.key, next)
      } else {
        await writeMetric(date, def.key, next)
      }
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

  // Hiding removes the row from this list only — the stored history stays, so a
  // metric hidden by mistake loses nothing and comes back from the Hidden row below.
  async function hideRow(name: string) {
    await hideMetric(name)
    setHidden(loadHiddenMetrics())
    setExtra((e) => e.filter((n) => n !== name))
  }

  async function restoreRow(name: string) {
    await unhideMetric(name)
    setHidden(loadHiddenMetrics())
    setExtra((e) => (e.includes(name) ? e : [...e, name]))
  }

  async function toggleGroup(group: MetricGroup) {
    setCollapsed(await setGroupCollapsed(group, !collapsed.has(group)))
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

  // Every group is listed, including empty ones — a collapsed heading costs one line
  // and is where Phase G-2's "+ add a category" button will live, which has to be
  // reachable in a group you haven't tracked anything in yet.
  const grouped = GROUP_ORDER.map((g) => ({
    ...g,
    rows: items.filter((it) => groupForTrack(it.name, it.category) === g.group),
  }))

  // Standard items not already shown — tap to add a row for this day. Energy and
  // mood are always present, so they never appear here.
  const addable = QUICK_LOG_ITEMS.filter(
    (d) =>
      !items.some((it) => it.name === d.key) &&
      !hidden.has(d.key) &&
      !(PINNED_QUICK_ENTRY_KEYS as readonly string[]).includes(d.key),
  )

  return (
    <div className="card space-y-3">
      <div>
        <div className="label">Quick entry{segment ? ` — ${SEGMENT_LABEL[segment]}` : ''}</div>
        <p className="text-xs text-ink-400">
          {segment
            ? `Sliders start at your last value. Items that don't split by time of day (weight, stool) still log the whole day.`
            : 'Sliders start at your last value.'}{' '}
          Adjust and tap Save — nothing is written until you do. Tap a heading to fold it away.
        </p>
      </div>

      {grouped.map((g) => {
        const isOpen = !collapsed.has(g.group)
        const dirtyHere = g.rows.filter((it) => isDirty(it)).length
        return (
          <div key={g.group}>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => void toggleGroup(g.group)}
              className="flex w-full items-center gap-1.5 py-1 text-[11px] font-medium uppercase tracking-wide text-ink-500 hover:text-ink-300"
            >
              <GroupIcon group={g.group} size={13} className="shrink-0" />
              <span>{g.title}</span>
              <span className="text-ink-600">{g.rows.length}</span>
              {!isOpen && dirtyHere > 0 && (
                <span className="warn-dot h-1.5 w-1.5 rounded-full" aria-label={`${dirtyHere} unsaved`} />
              )}
              <span className="ml-auto text-ink-500">{isOpen ? '▾' : '▸'}</span>
            </button>

            {isOpen && g.rows.map((it) => {
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
                  onHide={() => void hideRow(it.name)}
                />
              )
            })}

            {isOpen && !g.rows.length && (
              <p className="py-1 text-xs text-ink-500">Nothing here yet.</p>
            )}
          </div>
        )
      })}

      {dirtyItems.length > 0 && (
        <button className="btn-primary w-full !py-2 text-sm" disabled={busy} onClick={() => void saveAll()}>
          {justSaved === '__all__' ? '✓ Saved' : `Save ${dirtyItems.length} changed`}
        </button>
      )}

      {QUICK_LOG_STEP_ITEMS.length > 0 && (
        <div>
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-500">Quick log</div>
          <p className="mb-1.5 text-xs text-ink-400">
            Tap to add 5 minutes to {segment ? `${SEGMENT_LABEL[segment].toLowerCase()}'s` : "today's"} total for that item.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_LOG_STEP_ITEMS.map((d) => (
              <button
                key={d.key}
                type="button"
                disabled={qlBusy === d.key}
                className="flex items-center gap-1.5 rounded-full bg-ink-800 px-2.5 py-1.5 text-xs text-ink-200 hover:bg-ink-700"
                onClick={() => void tapQuickLog(d)}
              >
                <MetricIcon name={d.key} color={colorForTrack(d.key)} size={14} className="shrink-0" />
                {d.label}
                <span className="text-brand-400">{qlFlash === d.key ? '✓' : '+5'}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {hidden.size > 0 && (
        <div>
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-500">Hidden</div>
          <p className="mb-1.5 text-xs text-ink-400">
            Not shown as sliders. Their history is untouched — tap to bring one back.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {[...hidden].map((name) => (
              <button
                key={name}
                type="button"
                className="flex items-center gap-1.5 rounded-full border border-ink-700 px-2.5 py-1.5 text-xs text-ink-400 hover:text-cream"
                onClick={() => void restoreRow(name)}
              >
                <MetricIcon name={name} size={14} className="shrink-0" />
                {labelForTrack(name)}
                <span aria-hidden>↩</span>
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
                <MetricIcon name={d.key} color={colorForTrack(d.key)} size={14} className="shrink-0" />
                {d.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function initSavedMap(date: string, segment: Segment | null, items: Item[]): Map<string, SavedState> {
  return new Map(items.map((it) => [it.name, readSaved(date, it, segment)]))
}
function initDraftMap(date: string, segment: Segment | null, items: Item[]): Map<string, RowState> {
  return new Map(items.map((it) => [it.name, initRow(date, it, readSaved(date, it, segment))]))
}

// Presentational and memoised: dragging one slider re-renders only its own row.
//
// Two lines, not three. The slider, the note pen and Save share ONE row — the
// previous layout gave the three buttons a full-width row of their own, which cost
// a third of the panel's height across every metric and turned finding anything
// into a scroll. Hiding a row moved into the note panel: it is rare, and it was
// taking permanent space on every row to say so.
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
  onHide,
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
  onHide: () => void
}) {
  const [noteOpen, setNoteOpen] = useState(false)
  const scale = scaleForTrack(name, category)
  const color = colorForTrack(name)
  const hasNote = !!(draft.noteTouched ? draft.note.trim() : saved.note)

  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 flex-1 items-center gap-2 text-[15px] text-cream">
          <MetricIcon name={name} category={category} color={color} size={17} className="shrink-0" />
          <span className="truncate">{labelForTrack(name)}</span>
          {saved.value != null && !dirty && (
            <span className="shrink-0 text-[10px] text-brand-500">saved</span>
          )}
          {dirty && <span className="warn-dot h-1.5 w-1.5 shrink-0 rounded-full" aria-label="unsaved" />}
        </span>

        <span className="flex shrink-0 items-baseline gap-1">
          <span
            className={`font-serif text-xl leading-none ${
              dirty || saved.value != null ? 'text-cream' : 'text-ink-400'
            }`}
          >
            {fmtValue(draft.value)}
          </span>
          <span className="text-[11px] text-ink-400">{scale.unit}</span>
        </span>
      </div>

      <div className="mt-1 flex items-center gap-2">
        <input
          type="range"
          min={scale.min}
          max={scale.max}
          step={scale.step}
          value={draft.value}
          onChange={(e) => onChange({ value: Number(e.target.value) })}
          aria-label={labelForTrack(name)}
          className="min-w-0 flex-1"
          style={{ accentColor: color }}
        />

        <button
          type="button"
          aria-label={hasNote ? 'Edit note' : 'Add note'}
          aria-expanded={noteOpen}
          onClick={() => setNoteOpen((o) => !o)}
          className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
            noteOpen ? 'border-ink-600 bg-ink-700 text-cream' : 'border-ink-700 text-ink-300'
          }`}
        >
          <IconNote width={14} height={14} />
          {hasNote && !noteOpen && (
            <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-brand-500" />
          )}
        </button>

        <button
          type="button"
          disabled={!canSave}
          onClick={onSave}
          className="btn-primary h-9 w-[4.25rem] shrink-0 !px-0 !py-0 text-xs"
        >
          {justSaved ? '✓ Saved' : 'Save'}
        </button>
      </div>

      {noteOpen && (
        <div className="mt-2 space-y-1.5">
          <textarea
            className="field min-h-[2.75rem] !py-2"
            placeholder="Additional information — e.g. 'right knee only, worse on stairs'"
            value={draft.note}
            onChange={(e) => onChange({ note: e.target.value, noteTouched: true })}
          />
          {/* Anything dictation files under `tracks` shows up here, including things
              that aren't metrics at all. One tap removes the row; the data stays. */}
          <button
            type="button"
            onClick={onHide}
            className="text-xs text-ink-500 underline hover:text-red-400"
          >
            Hide {labelForTrack(name)} from quick entry
          </button>
        </div>
      )}
    </div>
  )
})
