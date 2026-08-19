import { useMemo, useState } from 'react'
import { extractDiary, refineDiary } from '../ai/anthropic'
import {
  saveDiaryExtraction, deleteEntry, recentEntries, entryDetail,
  pendingCheckins, recordCheckin, dismissCheckin, loggedDates, type EntryDetail,
  pendingSupplementCheckins, recordSupplementCheckin, dismissSupplementCheckin,
} from '../db/queries'
import { fmtDate, todayISO, dateSpine, daysAgoISO } from '../lib/dates'
import { IconMic } from '../components/icons'
import DayStrip from '../components/DayStrip'
import QuickEntryPanel from '../components/QuickEntryPanel'
import SleepCard from '../components/SleepCard'
import EventsCard from '../components/EventsCard'
import SupplementsCard from '../components/SupplementsCard'
import { colorForTrack } from '../lib/metrics'
import { buildReview, applyReview, conflictCount, type ReviewItem, type ReviewField } from '../lib/diaryReview'
import type { DiaryExtraction, Activity, Entry, Segment, Supplement } from '../types'

// How far back the date strip lets you swipe.
const STRIP_DAYS = 27

type Phase = 'input' | 'processing' | 'questions' | 'preview'

// 'whole' isn't a real Segment — it means "log the day directly", the existing
// behaviour before segments existed. Only quick-entry sliders read this; the
// dictation/AI path always files under the whole day regardless.
type SegmentChoice = Segment | 'whole'
const SEGMENT_CHOICES: { value: SegmentChoice; label: string }[] = [
  { value: 'whole', label: 'Whole day' },
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
]

export default function LogTab() {
  const [phase, setPhase] = useState<Phase>('input')
  const [raw, setRaw] = useState('')
  const [entryDate, setEntryDate] = useState(todayISO())
  const [extraction, setExtraction] = useState<DiaryExtraction | null>(null)
  // The reviewed, editable form of `extraction` — built on entering the preview
  // phase and applied on save, so nothing Claude returned reaches the database
  // without passing through the user's own hands first.
  const [review, setReview] = useState<ReviewItem[] | null>(null)
  const [answers, setAnswers] = useState<string[]>([])
  const [extraNote, setExtraNote] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedNote, setSavedNote] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [multiDay, setMultiDay] = useState(false)
  const [segment, setSegment] = useState<SegmentChoice>('whole')

  const entries = useMemo(() => recentEntries(8), [refreshKey, phase])
  const checkins = useMemo(() => pendingCheckins(), [refreshKey, phase])
  const supplementCheckins = useMemo(() => pendingSupplementCheckins(), [refreshKey, phase])
  const strip = useMemo(() => dateSpine(daysAgoISO(STRIP_DAYS)), [])
  const marked = useMemo(() => loggedDates(daysAgoISO(STRIP_DAYS)), [refreshKey])

  async function process() {
    setError(null)
    setPhase('processing')
    try {
      const res = await extractDiary(raw, entryDate, multiDay)
      setExtraction(res)
      // Only reset answers if the questions actually changed, so re-processing an
      // edited log doesn't wipe answers you've already typed for the same questions.
      setAnswers((prev) =>
        res.follow_up_questions.map((_, i) => prev[i] ?? ''),
      )
      setPhase('questions')
    } catch (e) {
      setError(msg(e))
      setPhase('input')
    }
  }

  async function submitAnswers() {
    if (!extraction) return
    setError(null)
    setPhase('processing')
    try {
      const qa = extraction.follow_up_questions
        .map((q, i) => ({ question: q, answer: answers[i]?.trim() ?? '' }))
        .filter((x) => x.answer)
      if (extraNote.trim()) {
        qa.push({ question: 'Additional notes or corrections from me', answer: extraNote.trim() })
      }
      const merged = qa.length ? await refineDiary(raw, qa, entryDate) : extraction
      setExtraction(merged)
      setReview(buildReview(merged, entryDate))
      setPhase('preview')
    } catch (e) {
      setError(msg(e))
      setPhase('questions')
    }
  }

  async function confirmSave() {
    if (!extraction) return
    try {
      // Editing an existing entry: replace it (delete old + its rows, re-save).
      if (editingId) await deleteEntry(editingId)
      const final = review ? applyReview(extraction, review) : extraction
      await saveDiaryExtraction(raw, 'voice', final, entryDate)
      setSavedNote(editingId ? 'Entry updated.' : 'Saved to your log.')
      reset()
      setRefreshKey((k) => k + 1)
      setTimeout(() => setSavedNote(null), 2500)
    } catch (e) {
      setError(msg(e))
    }
  }

  function startEdit(entry: Entry) {
    setEditingId(entry.id)
    setExpandedId(null)
    setRaw(entry.raw_text)
    setEntryDate(entry.entry_date ?? todayISO())
    setExtraction(null)
    setReview(null)
    setAnswers([])
    setExtraNote('')
    setPhase('input')
  }

  async function removeEntry(id: string) {
    if (!confirm('Delete this entry and everything logged from it? This cannot be undone.')) return
    try {
      await deleteEntry(id)
      setRefreshKey((k) => k + 1)
    } catch (e) {
      setError(msg(e))
    }
  }

  function reset() {
    setPhase('input')
    setRaw('')
    setEntryDate(todayISO())
    setExtraction(null)
    setReview(null)
    setAnswers([])
    setExtraNote('')
    setEditingId(null)
    setMultiDay(false)
  }

  return (
    <div className="space-y-4">
      {savedNote && (
        <div className="rounded-xl border border-brand-500/40 bg-brand-500/10 px-3 py-2 text-sm text-brand-300">
          {savedNote}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {phase === 'input' && checkins.length > 0 && (
        <div
          className="space-y-4 rounded-2xl border border-brand-600/25 p-5"
          style={{ background: 'linear-gradient(160deg, var(--surface-2), var(--surface))' }}
        >
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-brand-500">✦</span>
              <span className="label !mb-0 !text-brand-500">Recovery check-in</span>
            </div>
            <p className="font-serif text-xl leading-tight text-cream">How have these felt since?</p>
            <p className="mt-2 text-sm font-light leading-relaxed text-ink-300">
              Soreness often shows up a day or two later. No rush — answer whenever you can.
            </p>
          </div>
          <div className="space-y-3">
            {checkins.map((a) => (
              <CheckinRow
                key={a.id}
                activity={a}
                onDone={() => setRefreshKey((k) => k + 1)}
                onError={(m) => setError(m)}
              />
            ))}
          </div>
        </div>
      )}

      {phase === 'input' && supplementCheckins.length > 0 && (
        <div
          className="space-y-4 rounded-2xl border border-brand-600/25 p-5"
          style={{ background: 'linear-gradient(160deg, var(--surface-2), var(--surface))' }}
        >
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-brand-500">✦</span>
              <span className="label !mb-0 !text-brand-500">Supplement check-in</span>
            </div>
            <p className="font-serif text-xl leading-tight text-cream">Still on track?</p>
            <p className="mt-2 text-sm font-light leading-relaxed text-ink-300">
              A quick note on how it's going — or skip if there's nothing to say yet.
            </p>
          </div>
          <div className="space-y-3">
            {supplementCheckins.map((s) => (
              <SupplementCheckinRow
                key={s.id}
                supplement={s}
                onDone={() => setRefreshKey((k) => k + 1)}
                onError={(m) => setError(m)}
              />
            ))}
          </div>
        </div>
      )}

      {phase === 'input' && editingId && (
        <div className="warn-box flex items-center justify-between">
          <span>Editing an existing entry — re-analyzing will replace it.</span>
          <button className="underline" onClick={reset}>
            Cancel
          </button>
        </div>
      )}

      {phase === 'input' && (
        <div className="card space-y-3">
          <div className="flex items-center gap-2 text-ink-300">
            <IconMic width={18} height={18} />
            <span className="text-sm">{editingId ? 'Edit the entry text' : 'Dictate or type your day'}</span>
          </div>
          <div>
            <label className="label">Logging for</label>
            <DayStrip dates={strip} selected={entryDate} onSelect={setEntryDate} marked={marked} />
            <div className="mt-2 flex items-center gap-2">
              <input
                type="date"
                className="field !w-auto"
                value={entryDate}
                max={todayISO()}
                onChange={(e) => setEntryDate(e.target.value)}
              />
              <span className="text-xs text-ink-500">or swipe the strip above</span>
            </div>
            {entryDate !== todayISO() && !multiDay && (
              <p className="warn-box mt-1">
                Backfilling {fmtDate(entryDate)} — dates you don't mention will default here, not today.
              </p>
            )}
          </div>
          <div>
            <label className="label">Quick entry for</label>
            <div className="flex flex-wrap gap-1.5">
              {SEGMENT_CHOICES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  className={segment === s.value ? 'chip-on' : 'chip'}
                  onClick={() => setSegment(s.value)}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-ink-400">
              Log energy, mood, pain and duration items separately per part of the day —
              whole day sliders average or sum whatever segments you've filled in.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-300">
            <input
              type="checkbox"
              className="h-4 w-4 rounded accent-brand-500"
              checked={multiDay}
              onChange={(e) => setMultiDay(e.target.checked)}
            />
            This covers more than one day
          </label>
          <textarea
            className="field min-h-[9rem]"
            placeholder={
              multiDay
                ? "E.g. 'Meditated every morning this week, 15 min. Yesterday ran 40 min, calves sore today. Two days ago felt low energy, mood 4.'"
                : "Tap here, then use the mic key on your keyboard. E.g. 'Ran 40 min this morning, moderate. Calves got sore afterwards. Bloated after lunch, big client call tomorrow. Energy 6, mood 7.'"
            }
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
          <button className="btn-primary w-full" disabled={!raw.trim()} onClick={() => void process()}>
            {editingId ? 'Re-analyze' : 'Process with Claude'}
          </button>
          <p className="text-xs text-ink-400">
            {multiDay
              ? `Claude will split this into separate dated records instead of filing it all under ${fmtDate(entryDate)}.`
              : 'Claude sorts it into activities, gut, infections, energy/mood and day context — and asks about anything important you left out.'}
          </p>
        </div>
      )}

      {phase === 'input' && !editingId && (
        <SleepCard date={entryDate} onChanged={() => setRefreshKey((k) => k + 1)} />
      )}

      {phase === 'input' && !editingId && (
        <QuickEntryPanel
          date={entryDate}
          segment={segment === 'whole' ? null : segment}
          onChanged={() => setRefreshKey((k) => k + 1)}
        />
      )}

      {phase === 'input' && !editingId && (
        <EventsCard date={entryDate} onChanged={() => setRefreshKey((k) => k + 1)} />
      )}

      {phase === 'input' && !editingId && (
        <SupplementsCard date={entryDate} onChanged={() => setRefreshKey((k) => k + 1)} />
      )}

      {phase === 'processing' && (
        <div className="card flex items-center gap-3 text-ink-300">
          <span className="h-3 w-3 animate-pulse rounded-full bg-brand-400" />
          Thinking…
        </div>
      )}

      {phase === 'questions' && extraction && (
        <div className="card space-y-4">
          <p className="text-sm text-ink-300">
            {extraction.follow_up_questions.length
              ? `A few follow-ups so the log is complete`
              : `Anything to adjust before saving?`}
            {entryDate !== todayISO() ? ` (logging for ${fmtDate(entryDate)})` : ''}:
          </p>
          {extraction.follow_up_questions.map((q, i) => (
            <div key={i}>
              <label className="label">{q}</label>
              <textarea
                className="field min-h-[3.5rem]"
                value={answers[i] ?? ''}
                onChange={(e) => {
                  const next = [...answers]
                  next[i] = e.target.value
                  setAnswers(next)
                }}
              />
            </div>
          ))}
          <div>
            <label className="label">Anything else to add or correct?</label>
            <textarea
              className="field min-h-[3.5rem]"
              placeholder="e.g. 'Interpret the Bristol value as 4, not 6' or 'also add: felt anxious in the evening'"
              value={extraNote}
              onChange={(e) => setExtraNote(e.target.value)}
            />
            <p className="mt-1 text-xs text-ink-400">
              Add or fix anything here instead of re-editing the whole log.
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={() => void submitAnswers()}>
              Continue
            </button>
            <button className="btn-ghost" onClick={() => setPhase('input')}>
              Edit log
            </button>
          </div>
        </div>
      )}

      {phase === 'preview' && extraction && (
        <div className="card space-y-4">
          <div>
            <div className="label">Summary · {fmtDate(entryDate)}</div>
            <p className="text-sm text-cream">{extraction.summary || 'Log entry'}</p>
          </div>
          <ExtractionReview items={review ?? []} onChange={setReview} />
          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={() => void confirmSave()}>
              Confirm & save
            </button>
            <button className="btn-ghost" onClick={() => setPhase('questions')}>
              Back to questions
            </button>
          </div>
        </div>
      )}

      {phase === 'input' && !editingId && entries.length > 0 && (
        <div className="space-y-2">
          <div className="label">Recent entries</div>
          {entries.map((e) => (
            <div key={e.id} className="card !p-3">
              <button
                className="flex w-full items-start justify-between gap-3 text-left"
                onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}
              >
                <div className="min-w-0">
                  <div className="text-xs text-ink-400">{fmtDate(e.entry_date ?? e.created_at)}</div>
                  <div className={`text-sm text-ink-300 ${expandedId === e.id ? '' : 'line-clamp-2'}`}>
                    {e.raw_text}
                  </div>
                </div>
                <span className="shrink-0 text-ink-400">{expandedId === e.id ? '▾' : '▸'}</span>
              </button>

              {expandedId === e.id && (
                <div className="mt-3 space-y-3 border-t border-ink-700 pt-3">
                  <SavedDetail detail={entryDetail(e.id)} />
                  <div className="flex gap-2">
                    <button className="btn-ghost flex-1 !py-2 text-sm" onClick={() => startEdit(e)}>
                      Edit &amp; re-analyze
                    </button>
                    <button
                      className="rounded-xl bg-ink-700 px-3 py-2 text-sm text-red-400 hover:bg-ink-600"
                      onClick={() => void removeEntry(e.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SavedDetail({ detail }: { detail: EntryDetail }) {
  const rows: { label: string; items: string[] }[] = [
    { label: 'Activities', items: detail.activities.map((a) => [a.type, a.duration_min && `${a.duration_min}m`, a.intensity, a.symptoms && `→ ${a.symptoms}`, a.recovery_time && `recovery ${a.recovery_time}`, a.notes].filter(Boolean).join(' · ')) },
    { label: 'Gut', items: detail.gut_events.map((g) => [g.pain != null && `pain ${g.pain}`, g.bloating != null && `bloat ${g.bloating}`, g.stool_consistency != null && `Bristol ${g.stool_consistency}`, g.warming_bottle_needed && 'warming bottle', g.preceded_by && `before: ${g.preceded_by}`].filter(Boolean).join(' · ')) },
    { label: 'Infections', items: detail.infections.map((i) => [i.kind, i.severity, i.preceded_by && `before: ${i.preceded_by}`].filter(Boolean).join(' · ')) },
    { label: 'Energy / Mood', items: detail.wellbeing.map((w) => [w.energy != null && `energy ${w.energy}`, w.mood != null && `mood ${w.mood}`].filter(Boolean).join(' · ')) },
    { label: 'Day context', items: detail.day_context.map((d) => [d.stress_load != null && `stress ${d.stress_load}`, d.work, d.travel, d.retreat, d.relaxation, d.tasks].filter(Boolean).join(' · ')) },
    { label: 'Tracked', items: detail.tracks.map((t) => [t.name, t.value != null && `${t.value}${t.unit ? ` ${t.unit}` : ''}`, t.time && `at ${t.time}`, t.notes].filter(Boolean).join(' · ')) },
  ].filter((r) => r.items.filter(Boolean).length)

  if (!rows.length) return <p className="text-xs text-ink-400">No structured data was saved from this entry.</p>

  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="label !mb-0.5">{r.label}</div>
          {r.items.filter(Boolean).map((it, i) => (
            <div key={i} className="text-sm text-cream">{it}</div>
          ))}
        </div>
      ))}
    </div>
  )
}

// The editable review step. Every number Claude produced gets a stepper, every
// record gets an include toggle, and anything that would overwrite a value already
// stored for that day is flagged with that value and a one-tap "Keep".
//
// The default on a conflict is HIS value, not Claude's: the extraction has to be
// accepted to win. That is the whole point — the previous version wrote silently,
// and a guessed energy of 9 landed on a 7 he had entered by hand.
function ExtractionReview({
  items,
  onChange,
}: {
  items: ReviewItem[]
  onChange: (next: ReviewItem[]) => void
}) {
  if (!items.length) return <p className="text-sm text-ink-400">Nothing structured was detected.</p>

  const conflicts = conflictCount(items)

  const setInclude = (id: string, include: boolean) =>
    onChange(items.map((it) => (it.id === id ? { ...it, include } : it)))

  const setValue = (id: string, key: string, value: number) =>
    onChange(
      items.map((it) =>
        it.id === id ? { ...it, fields: it.fields.map((f) => (f.key === key ? { ...f, value } : f)) } : it,
      ),
    )

  return (
    <div className="space-y-2">
      {conflicts > 0 && (
        <div className="warn-box">
          {conflicts === 1 ? 'One value' : `${conflicts} values`} would replace something already saved for that day.
          Each one shows what is there now — tap <span className="font-semibold">Keep</span> to leave it alone, or
          untick the record to drop it entirely.
        </div>
      )}
      <p className="text-xs text-ink-400">
        Correct anything Claude got wrong here — nothing is written until you tap Confirm.
      </p>

      {items.map((it) => (
        <div
          key={it.id}
          className={`rounded-lg bg-ink-900 px-3 py-2 ${it.include ? '' : 'opacity-45'}`}
        >
          <div className="flex items-start gap-2.5">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 shrink-0 rounded accent-brand-500"
              checked={it.include}
              aria-label={`Include this ${it.section} record`}
              onChange={(e) => setInclude(it.id, e.target.checked)}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[10px] uppercase tracking-wide text-ink-500">{it.section}</span>
                <span className="text-[10px] text-ink-500">{fmtDate(it.date)}</span>
              </div>
              {it.text && <div className="text-sm text-cream">{it.text}</div>}
              {it.fields.map((f) => (
                <FieldRow
                  key={f.key}
                  field={f}
                  disabled={!it.include}
                  onChange={(v) => setValue(it.id, f.key, v)}
                />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function FieldRow({
  field,
  disabled,
  onChange,
}: {
  field: ReviewField
  disabled: boolean
  onChange: (v: number) => void
}) {
  const clamp = (v: number) => Math.min(field.max, Math.max(field.min, Math.round(v / field.step) * field.step))
  const conflicted = field.saved != null && field.saved !== field.value
  const show = (v: number) => String(Math.round(v * 10) / 10)

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="w-[5.5rem] shrink-0 text-xs text-ink-300">{field.label}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={disabled}
          aria-label={`Decrease ${field.label}`}
          className="h-7 w-7 rounded-lg border border-ink-700 text-ink-300 disabled:opacity-40"
          onClick={() => onChange(clamp(field.value - field.step))}
        >
          −
        </button>
        <span className="w-10 text-center font-serif text-lg leading-none text-cream">{show(field.value)}</span>
        <button
          type="button"
          disabled={disabled}
          aria-label={`Increase ${field.label}`}
          className="h-7 w-7 rounded-lg border border-ink-700 text-ink-300 disabled:opacity-40"
          onClick={() => onChange(clamp(field.value + field.step))}
        >
          +
        </button>
        {field.unit && <span className="text-[11px] text-ink-400">{field.unit}</span>}
      </div>
      {conflicted && (
        <span className="warn-chip">
          was {show(field.saved as number)}
          <button
            type="button"
            disabled={disabled}
            className="underline disabled:opacity-40"
            onClick={() => onChange(field.saved as number)}
          >
            Keep
          </button>
        </span>
      )}
    </div>
  )
}

function CheckinRow({
  activity,
  onDone,
  onError,
}: {
  activity: Activity
  onDone: () => void
  onError: (m: string) => void
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const duration = activity.duration_min ? `${activity.duration_min}m` : null
  const color = colorForTrack(activity.type || 'activity')

  async function save() {
    if (!text.trim()) return
    setBusy(true)
    try {
      await recordCheckin(activity.id, text)
      onDone()
    } catch (e) {
      onError(msg(e))
    } finally {
      setBusy(false)
    }
  }
  async function dismiss() {
    setBusy(true)
    try {
      await dismissCheckin(activity.id)
      onDone()
    } catch (e) {
      onError(msg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl p-3" style={{ background: 'var(--surface-3)' }}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-[15px] text-cream">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
          <span className="truncate">{activity.type || 'Workout'}</span>
        </span>
        <span className="shrink-0 text-xs text-ink-400">
          {[duration, fmtDate(activity.date)].filter(Boolean).join(' · ')}
        </span>
      </div>
      <textarea
        className="field min-h-[2.75rem]"
        placeholder="How does your body feel today?"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="mt-2 flex gap-2">
        <button className="btn-ghost flex-1 !py-2 text-sm" disabled={busy} onClick={() => void dismiss()}>
          No issues
        </button>
        <button className="btn-primary flex-1 !py-2 text-sm" disabled={busy || !text.trim()} onClick={() => void save()}>
          Save
        </button>
      </div>
    </div>
  )
}

function SupplementCheckinRow({
  supplement,
  onDone,
  onError,
}: {
  supplement: Supplement
  onDone: () => void
  onError: (m: string) => void
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!text.trim()) return
    setBusy(true)
    try {
      await recordSupplementCheckin(supplement.id, text)
      onDone()
    } catch (e) {
      onError(msg(e))
    } finally {
      setBusy(false)
    }
  }
  async function dismiss() {
    setBusy(true)
    try {
      await dismissSupplementCheckin(supplement.id)
      onDone()
    } catch (e) {
      onError(msg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl p-3" style={{ background: 'var(--surface-3)' }}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[15px] text-cream">{supplement.name}</span>
        <span className="shrink-0 text-xs text-ink-400">since {fmtDate(supplement.start_date)}</span>
      </div>
      <textarea
        className="field min-h-[2.75rem]"
        placeholder="Noticing anything — good or bad?"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="mt-2 flex gap-2">
        <button className="btn-ghost flex-1 !py-2 text-sm" disabled={busy} onClick={() => void dismiss()}>
          Nothing to add
        </button>
        <button className="btn-primary flex-1 !py-2 text-sm" disabled={busy || !text.trim()} onClick={() => void save()}>
          Save
        </button>
      </div>
    </div>
  )
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
