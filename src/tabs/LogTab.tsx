import { useMemo, useState } from 'react'
import { extractDiary, refineDiary } from '../ai/anthropic'
import { saveDiaryExtraction, deleteEntry, recentEntries } from '../db/queries'
import { fmtDate, todayISO } from '../lib/dates'
import { IconMic } from '../components/icons'
import type { DiaryExtraction } from '../types'

type Phase = 'input' | 'processing' | 'questions' | 'preview'

export default function LogTab() {
  const [phase, setPhase] = useState<Phase>('input')
  const [raw, setRaw] = useState('')
  const [entryDate, setEntryDate] = useState(todayISO())
  const [extraction, setExtraction] = useState<DiaryExtraction | null>(null)
  const [answers, setAnswers] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [savedNote, setSavedNote] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const entries = useMemo(() => recentEntries(8), [refreshKey, phase])

  async function process() {
    setError(null)
    setPhase('processing')
    try {
      const res = await extractDiary(raw, entryDate)
      setExtraction(res)
      if (res.follow_up_questions.length) {
        setAnswers(new Array(res.follow_up_questions.length).fill(''))
        setPhase('questions')
      } else {
        setPhase('preview')
      }
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
      const merged = qa.length ? await refineDiary(raw, qa, entryDate) : extraction
      setExtraction(merged)
      setPhase('preview')
    } catch (e) {
      setError(msg(e))
      setPhase('questions')
    }
  }

  async function confirmSave() {
    if (!extraction) return
    try {
      await saveDiaryExtraction(raw, 'voice', extraction, entryDate)
      setSavedNote('Saved to your log.')
      reset()
      setRefreshKey((k) => k + 1)
      setTimeout(() => setSavedNote(null), 2500)
    } catch (e) {
      setError(msg(e))
    }
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
    setAnswers([])
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

      {phase === 'input' && (
        <div className="card space-y-3">
          <div className="flex items-center gap-2 text-ink-300">
            <IconMic width={18} height={18} />
            <span className="text-sm">Dictate or type your day</span>
          </div>
          <div>
            <label className="label">Logging for</label>
            <input
              type="date"
              className="field !w-auto"
              value={entryDate}
              max={todayISO()}
              onChange={(e) => setEntryDate(e.target.value)}
            />
            {entryDate !== todayISO() && (
              <p className="mt-1 text-xs text-amber-300">
                Backfilling {fmtDate(entryDate)} — dates you don't mention will default here, not today.
              </p>
            )}
          </div>
          <textarea
            className="field min-h-[9rem]"
            placeholder="Tap here, then use the mic key on your keyboard. E.g. 'Ran 40 min this morning, moderate. Calves got sore afterwards. Bloated after lunch, big client call tomorrow. Energy 6, mood 7.'"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
          <button className="btn-primary w-full" disabled={!raw.trim()} onClick={() => void process()}>
            Process with Claude
          </button>
          <p className="text-xs text-ink-400">
            Claude sorts it into activities, gut, infections, energy/mood and day context — and asks about
            anything important you left out.
          </p>
        </div>
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
            A few follow-ups so the log is complete{entryDate !== todayISO() ? ` (logging for ${fmtDate(entryDate)})` : ''}:
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
          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={() => void submitAnswers()}>
              Continue
            </button>
            <button className="btn-ghost" onClick={() => setPhase('preview')}>
              Skip
            </button>
          </div>
        </div>
      )}

      {phase === 'preview' && extraction && (
        <div className="card space-y-4">
          <div>
            <div className="label">Summary · {fmtDate(entryDate)}</div>
            <p className="text-sm text-white">{extraction.summary || 'Log entry'}</p>
          </div>
          <ExtractionPreview data={extraction} />
          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={() => void confirmSave()}>
              Confirm & save
            </button>
            <button className="btn-ghost" onClick={() => setPhase('input')}>
              Back
            </button>
          </div>
        </div>
      )}

      {phase === 'input' && entries.length > 0 && (
        <div className="space-y-2">
          <div className="label">Recent entries</div>
          {entries.map((e) => (
            <div key={e.id} className="card flex items-start justify-between gap-3 !p-3">
              <div className="min-w-0">
                <div className="text-xs text-ink-400">{fmtDate(e.entry_date ?? e.created_at)}</div>
                <div className="line-clamp-2 text-sm text-ink-300">{e.raw_text}</div>
              </div>
              <button
                className="shrink-0 rounded-lg px-2 py-1 text-xs text-red-400 hover:bg-red-500/10"
                onClick={() => void removeEntry(e.id)}
                aria-label="Delete entry"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ExtractionPreview({ data }: { data: DiaryExtraction }) {
  const rows: { label: string; items: string[] }[] = [
    { label: 'Activities', items: data.activities.map((a) => [a.type, a.duration_min && `${a.duration_min}m`, a.intensity, a.symptoms && `→ ${a.symptoms}`, a.recovery_time && `recovery ${a.recovery_time}`, a.gentle_movement_effect && a.gentle_movement_effect !== 'unknown' && `gentle: ${a.gentle_movement_effect}`].filter(Boolean).join(' · ')) },
    { label: 'Gut', items: data.gut_events.map((g) => [g.pain != null && `pain ${g.pain}`, g.bloating != null && `bloat ${g.bloating}`, g.stool_consistency != null && `Bristol ${g.stool_consistency}`, g.warming_bottle_needed && 'warming bottle', g.preceded_by?.length && `before: ${g.preceded_by.join(', ')}`].filter(Boolean).join(' · ')) },
    { label: 'Infections', items: data.infections.map((i) => [i.kind, i.severity, i.preceded_by?.length && `before: ${i.preceded_by.join(', ')}`].filter(Boolean).join(' · ')) },
    { label: 'Energy / Mood', items: data.wellbeing.map((w) => [w.energy != null && `energy ${w.energy}`, w.mood != null && `mood ${w.mood}`].filter(Boolean).join(' · ')) },
    { label: 'Day context', items: data.day_context.map((d) => [d.stress_load != null && `stress ${d.stress_load}`, d.work, d.travel, d.retreat, d.relaxation, d.tasks].filter(Boolean).join(' · ')) },
  ].filter((r) => r.items.filter(Boolean).length)

  if (!rows.length) return <p className="text-sm text-ink-400">Nothing structured was detected.</p>

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="label">{r.label}</div>
          <div className="space-y-1">
            {r.items.filter(Boolean).map((it, i) => (
              <div key={i} className="rounded-lg bg-ink-900 px-3 py-2 text-sm text-white">
                {it}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
