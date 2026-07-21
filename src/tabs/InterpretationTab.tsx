import { useMemo, useState } from 'react'
import { interpret } from '../ai/anthropic'
import {
  saveInterpretation, recentInterpretations, activitiesSince, gutSince, infectionsSince,
  wellbeingSince, dayContextSince, mealsSince,
} from '../db/queries'
import { daysAgoISO, nowISO, fmtDate } from '../lib/dates'
import type { Interpretation } from '../types'

export default function InterpretationTab() {
  const [days, setDays] = useState(30)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const logs = useMemo(() => recentInterpretations(20), [refreshKey])

  async function analyse() {
    setBusy(true)
    setError(null)
    try {
      const since = daysAgoISO(days)
      const data = {
        activities: activitiesSince(since),
        gut_events: gutSince(since),
        infections: infectionsSince(since),
        wellbeing: wellbeingSince(since),
        day_context: dayContextSince(since),
        meals: mealsSince(since).map((m) => ({ date: m.date, name: m.name, calories: m.calories })),
      }
      const empty = Object.values(data).every((v) => Array.isArray(v) && v.length === 0)
      if (empty) {
        setError('Not enough data yet to interpret. Add some log entries first.')
        return
      }
      const res = await interpret(JSON.stringify(data), `last ${days} days`)
      await saveInterpretation({
        created_at: nowISO(),
        period_covered: res.period_covered,
        patterns: res.patterns,
        correlations: res.correlations,
        model: res.model,
        source_entry_ids: null,
      })
      setRefreshKey((k) => k + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <p className="text-sm text-ink-300">
          Claude reviews your recent data for patterns — anticipatory stress before infections or gut
          episodes, the warming-bottle vs stress link, recovery patterns, and more.
        </p>
        <div className="flex items-center gap-2">
          <select className="field !w-auto" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button className="btn-primary flex-1" disabled={busy} onClick={() => void analyse()}>
            {busy ? 'Analysing…' : 'Analyse now'}
          </button>
        </div>
        {error && <div className="text-sm text-red-300">{error}</div>}
      </div>

      {logs.map((log) => (
        <InterpretationCard key={log.id} log={log} />
      ))}

      {logs.length === 0 && (
        <div className="card text-center text-sm text-ink-400">
          No interpretations yet. Tap “Analyse now” once you have a few entries.
        </div>
      )}
    </div>
  )
}

// The model is asked for "short markdown bullets", so what comes back is markdown —
// rendering it as plain text showed literal ** around every emphasis. It also
// sometimes closes the tool's own field names as pseudo-XML inside the text
// (`</correlations>`, `<period_covered">last 14 days…`), which leaked straight onto
// the screen. Both are cleaned at render time rather than on save, so reports
// already sitting in the database read correctly too.
function cleanReport(raw: string): string {
  return raw
    .replace(/<\/?(patterns|correlations|period_covered)\b[^>]*>/gi, '')
    .trim()
}

// Deliberately minimal: bold, italic, and `-`/`*` bullets. That is the whole
// vocabulary the interpret prompt asks for, and a full markdown dependency would have
// to be bundled into a PWA that must work offline.
function renderInline(text: string): (string | JSX.Element)[] {
  // Bold alternative comes first so `**x**` is never mistaken for two italic runs.
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={i} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      )
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return (
        <em key={i} className="italic text-ink-200">
          {part.slice(1, -1)}
        </em>
      )
    }
    return part
  })
}

function Report({ text }: { text: string }) {
  const lines = cleanReport(text).split('\n').filter((l) => l.trim() !== '')
  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => {
        const bullet = line.match(/^\s*[-*]\s+(.*)$/)
        return bullet ? (
          <div key={i} className="flex gap-2 text-sm leading-relaxed text-ink-300">
            <span aria-hidden className="mt-[3px] shrink-0 text-ink-600">
              •
            </span>
            <span className="min-w-0">{renderInline(bullet[1])}</span>
          </div>
        ) : (
          <p key={i} className="text-sm leading-relaxed text-ink-300">
            {renderInline(line)}
          </p>
        )
      })}
    </div>
  )
}

function InterpretationCard({ log }: { log: Interpretation }) {
  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-ink-400">
          {fmtDate(log.created_at)} · {log.period_covered}
        </div>
        <div className="text-[10px] text-ink-600">{log.model}</div>
      </div>
      {log.patterns && (
        <div>
          <div className="label">Patterns</div>
          <Report text={log.patterns} />
        </div>
      )}
      {log.correlations && (
        <div>
          <div className="label">Correlations</div>
          <Report text={log.correlations} />
        </div>
      )}
    </div>
  )
}
