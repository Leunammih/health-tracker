import { useEffect, useMemo, useRef, useState } from 'react'
import {
  trackNamesSince, trackValueOn, lastTrackValueOnOrBefore, upsertTrackValue,
} from '../db/queries'
import {
  colorForTrack, labelForTrack, scaleForTrack, groupForTrack, categoryForDef, defForName,
  QUICK_LOG_ITEMS, type MetricGroup,
} from '../lib/metrics'
import { daysAgoISO } from '../lib/dates'

const GROUP_ORDER: { group: MetricGroup; title: string }[] = [
  { group: 'movement', title: 'Movement' },
  { group: 'practice', title: 'Practice' },
  { group: 'symptom', title: 'Health & pain' },
  { group: 'wellbeing', title: 'Wellbeing' },
  { group: 'other', title: 'Other' },
]

// Everything tracked in the last week, grouped by category, each with a slider for
// the selected day. A slider starts at that day's saved value, or falls back to the
// most recent earlier value — so a steady habit is one tap to confirm, not re-entry.
// Nothing is written until a slider is actually moved.
export default function QuickEntryPanel({
  date,
  onChanged,
}: {
  date: string
  onChanged: () => void
}) {
  const [extra, setExtra] = useState<string[]>([]) // items added via quick-add this session
  const [version, setVersion] = useState(0)

  const recent = useMemo(() => trackNamesSince(daysAgoISO(7)), [version, date])

  // Recently-tracked items plus anything added by hand, de-duplicated.
  const items = useMemo(() => {
    const map = new Map<string, string | null>()
    for (const r of recent) map.set(r.name, r.category)
    for (const name of extra) {
      if (!map.has(name)) {
        const def = defForName(name)
        map.set(name, def ? categoryForDef(def) : null)
      }
    }
    return [...map.entries()].map(([name, category]) => ({ name, category }))
  }, [recent, extra])

  const grouped = GROUP_ORDER.map((g) => ({
    ...g,
    rows: items.filter((it) => groupForTrack(it.name, it.category) === g.group),
  })).filter((g) => g.rows.length)

  // Standard items not already shown — tap to add a row for this day.
  const addable = QUICK_LOG_ITEMS.filter((d) => !items.some((it) => it.name === d.key))

  function bump() {
    setVersion((v) => v + 1)
    onChanged()
  }

  return (
    <div className="card space-y-4">
      <div>
        <div className="label">Quick entry</div>
        <p className="text-xs text-ink-400">
          What you've been tracking this week. Sliders start at the last value — move one to log it for this day.
        </p>
      </div>

      {grouped.map((g) => (
        <div key={g.group} className="space-y-2">
          <div className="text-[11px] font-medium uppercase tracking-wide text-ink-500">{g.title}</div>
          {g.rows.map((it) => (
            <QuickRow
              key={it.name}
              date={date}
              name={it.name}
              category={it.category}
              version={version}
              onSaved={bump}
            />
          ))}
        </div>
      ))}

      {!grouped.length && (
        <p className="text-xs text-ink-400">
          Nothing tracked in the last week yet — add something below.
        </p>
      )}

      {addable.length > 0 && (
        <div>
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-500">Add</div>
          <div className="flex flex-wrap gap-1.5">
            {addable.map((d) => (
              <button
                key={d.key}
                className="flex items-center gap-1.5 rounded-full bg-ink-800 px-2.5 py-1.5 text-xs text-ink-200 hover:bg-ink-700"
                onClick={() => setExtra((e) => [...e, d.key])}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
                {d.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function QuickRow({
  date,
  name,
  category,
  version,
  onSaved,
}: {
  date: string
  name: string
  category: string | null
  version: number
  onSaved: () => void
}) {
  const scale = scaleForTrack(name, category)
  const color = colorForTrack(name)

  // Saved value for this day, else carry the most recent earlier value forward.
  const saved = useMemo(() => trackValueOn(date, name), [date, name, version])
  const fallback = useMemo(() => lastTrackValueOnOrBefore(date, name), [date, name, version])
  const initial = saved ?? fallback ?? scale.min

  const [value, setValue] = useState(initial)
  const [dirty, setDirty] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset when the day changes (or someone else wrote this item).
  useEffect(() => {
    setValue(initial)
    setDirty(false)
  }, [initial])

  // Persisting rewrites the whole SQLite blob, so debounce rather than writing on
  // every pointer move while dragging.
  function change(next: number) {
    setValue(next)
    setDirty(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      void upsertTrackValue(date, name, category, next, scale.unit).then(onSaved)
    }, 500)
  }

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="flex items-center gap-1.5 text-sm text-white">
          <span className="h-2 w-2 rounded-full" style={{ background: color }} />
          {labelForTrack(name)}
          {saved != null && !dirty && <span className="text-[10px] text-brand-400">saved</span>}
        </span>
        <span className={`text-sm ${dirty || saved != null ? 'text-white' : 'text-ink-500'}`}>
          {value}
          <span className="ml-0.5 text-[10px] text-ink-400">{scale.unit}</span>
        </span>
      </div>
      <input
        type="range"
        min={scale.min}
        max={scale.max}
        step={scale.step}
        value={value}
        onChange={(e) => change(Number(e.target.value))}
        className="w-full"
        style={{ accentColor: color }}
      />
    </div>
  )
}
