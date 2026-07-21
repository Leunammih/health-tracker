import { useMemo, useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from 'recharts'
import { daysAgoISO, dateSpine, fmtDate } from '../lib/dates'
import {
  wellbeingSince, gutSince, infectionsSince, mealsSince, dayContextSince, tracksSince,
  activitiesSince, allTrackNames,
} from '../db/queries'
import {
  colorForTrack, labelForTrack, defForName, groupForTrack, isLowerBetter, QUICK_LOG_ITEMS,
} from '../lib/metrics'
import PlateauChart, { type PlateauSeries } from '../components/PlateauChart'
import QuickLogSheet from '../components/QuickLogSheet'
import type { Track } from '../types'

const RANGES = [
  { label: '14d', days: 14 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
]

// Free-text infection severity → 0-10. The user logs recovery by saying it's gone,
// which must read as 0 so the carried-forward line can end.
function severityScore(s: string | null): number | null {
  if (!s) return null
  const t = s.toLowerCase()
  if (/gone|resolved|clear|recovered|over|none|no longer/.test(t)) return 0
  const m = t.match(/(\d+(?:\.\d+)?)/)
  if (m) {
    const n = parseFloat(m[1])
    if (n >= 0 && n <= 10) return n
  }
  if (/mild|light|slight/.test(t)) return 3
  if (/moderate|medium/.test(t)) return 6
  if (/severe|bad|heavy|strong|awful/.test(t)) return 9
  return 5
}

export default function InsightsTab() {
  const [days, setDays] = useState(30)
  const [refresh, setRefresh] = useState(0)
  const [sheet, setSheet] = useState<{ name: string; category: string | null; date?: string } | null>(null)

  const since = daysAgoISO(days)
  // One shared X axis for every chart — a day with no entry still gets a column,
  // so the graphs stack into readable vertical columns for the same date.
  const spine = useMemo(() => dateSpine(since), [since])

  const { wb, gut, inf, meals, ctx, tracks, acts, known } = useMemo(
    () => ({
      wb: wellbeingSince(since),
      gut: gutSince(since),
      inf: infectionsSince(since),
      meals: mealsSince(since),
      ctx: dayContextSince(since),
      tracks: tracksSince(since),
      acts: activitiesSince(since),
      known: allTrackNames(),
    }),
    [since, refresh],
  )

  // --- movement & exercise: activities (workouts) + movement-category tracks,
  // merged per canonical name per day, rendered as rounded plateaus over a 0 line.
  const movementSeries = useMemo<PlateauSeries[]>(() => {
    const byName = new Map<string, Map<string, number>>()
    const add = (rawName: string, date: string, mins: number | null) => {
      if (!rawName || mins == null) return
      const key = defForName(rawName)?.key ?? rawName.trim().toLowerCase()
      if (groupForTrack(key) !== 'movement') return
      const m = byName.get(key) ?? new Map<string, number>()
      m.set(date, (m.get(date) ?? 0) + mins)
      byName.set(key, m)
    }
    for (const a of acts) add(a.type ?? '', a.date, a.duration_min)
    for (const t of tracks) add(t.name, t.date, t.value)
    return [...byName.entries()].map(([key, m]) => ({
      key,
      label: labelForTrack(key),
      color: colorForTrack(key),
      values: spine.map((d) => m.get(d) ?? null),
    }))
  }, [acts, tracks, spine])

  // --- practices: meditation / breath work, same plateau treatment.
  const practiceSeries = useMemo<PlateauSeries[]>(() => {
    const byName = new Map<string, Map<string, number>>()
    for (const t of tracks) {
      if (t.value == null) continue
      const key = defForName(t.name)?.key ?? t.name
      if (groupForTrack(key, t.category) !== 'practice') continue
      const m = byName.get(key) ?? new Map<string, number>()
      m.set(t.date, (m.get(t.date) ?? 0) + t.value)
      byName.set(key, m)
    }
    return [...byName.entries()].map(([key, m]) => ({
      key,
      label: labelForTrack(key),
      color: colorForTrack(key),
      values: spine.map((d) => m.get(d) ?? null),
    }))
  }, [tracks, spine])

  // --- pain & discomfort: every symptom-category track, on a reversed axis.
  const painKeys = useMemo(() => {
    const s = new Set<string>()
    for (const t of tracks) if (t.value != null && groupForTrack(t.name, t.category) === 'symptom') s.add(t.name)
    return [...s].sort()
  }, [tracks])

  const painRows = useMemo(() => buildRows(spine, tracks, painKeys), [spine, tracks, painKeys])

  // --- energy / mood (0-10, high is good) + release (0-100, 0 at top).
  // Release defaults to a constant 0 line and only dips on days with an entry.
  const wbByDate = new Map(wb.map((w) => [w.date, w]))
  const releaseByDate = new Map(
    tracks.filter((t) => t.name === 'release' && t.value != null).map((t) => [t.date, t.value as number]),
  )
  const moodData = spine.map((d) => ({
    date: fmtDate(d),
    rawDate: d,
    energy: wbByDate.get(d)?.energy ?? null,
    mood: wbByDate.get(d)?.mood ?? null,
    release: releaseByDate.get(d) ?? 0,
  }))
  const hasRelease = releaseByDate.size > 0

  const ctxByDate = new Map(ctx.map((c) => [c.date, c]))
  const stressData = spine.map((d) => ({ date: fmtDate(d), stress: ctxByDate.get(d)?.stress_load ?? null }))

  // --- illness: infection severity carried forward until logged as gone (0),
  // plus gut pain and Bristol stool consistency on the same reversed axis.
  const illnessData = useMemo(() => {
    const infByDate = new Map<string, number>()
    for (const i of inf) {
      const s = severityScore(i.severity)
      if (s != null) infByDate.set(i.date, s)
    }
    const gutByDate = new Map(gut.map((g) => [g.date, g]))
    let carried: number | null = null
    return spine.map((d) => {
      if (infByDate.has(d)) carried = infByDate.get(d) as number
      const g = gutByDate.get(d)
      return {
        date: fmtDate(d),
        rawDate: d,
        infection: carried,
        gutPain: g?.pain ?? null,
        stool: g?.stool_consistency ?? null,
      }
    })
  }, [inf, gut, spine])

  const hasIllness = illnessData.some((r) => r.infection != null || r.gutPain != null || r.stool != null)

  // --- calories on the shared spine so bars line up with everything above.
  const kcalByDate = new Map<string, number>()
  for (const m of meals) kcalByDate.set(m.date, (kcalByDate.get(m.date) ?? 0) + (m.calories ?? 0))
  const calData = spine.map((d) => ({ date: fmtDate(d), kcal: kcalByDate.get(d) ?? 0 }))

  const totalMacro = meals.reduce(
    (acc, m) => {
      acc.p += m.protein_g ?? 0
      acc.f += m.fat_g ?? 0
      acc.c += m.carbs_g ?? 0
      acc.fb += m.fiber_g ?? 0
      return acc
    },
    { p: 0, f: 0, c: 0, fb: 0 },
  )
  const mealDays = kcalByDate.size || 1

  // Remaining tracks that none of the dedicated charts claimed.
  const trackGroups = useMemo(() => {
    const byName = new Map<string, Track[]>()
    for (const t of tracks) {
      const g = groupForTrack(t.name, t.category)
      if (g === 'movement' || g === 'practice' || g === 'symptom') continue
      if (t.name === 'release') continue
      const arr = byName.get(t.name) ?? []
      arr.push(t)
      byName.set(t.name, arr)
    }
    return [...byName.entries()].map(([name, rows]) => ({
      name,
      unit: rows.find((r) => r.unit)?.unit ?? '',
      count: rows.length,
      series: rows.filter((r) => r.value != null).map((r) => ({ date: fmtDate(r.date), value: r.value as number })),
    }))
  }, [tracks])

  // Chips for the tap-to-log sheet: the standard items plus anything already logged.
  const logItems = useMemo(() => {
    const seen = new Map<string, string | null>()
    for (const d of QUICK_LOG_ITEMS) seen.set(d.key, null)
    for (const k of known) if (!seen.has(k.name)) seen.set(k.name, k.category)
    return [...seen.entries()].map(([name, category]) => ({ name, category }))
  }, [known])

  const hasAny = wb.length || gut.length || inf.length || meals.length || tracks.length || acts.length

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {RANGES.map((r) => (
          <button
            key={r.days}
            onClick={() => setDays(r.days)}
            className={`chip ${days === r.days ? '!border-brand-500 !text-brand-300' : ''}`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Tap any item to log it for a day with a slider. */}
      <div className="card">
        <div className="label mb-2">Tap to log</div>
        <div className="flex flex-wrap gap-1.5">
          {logItems.map((it) => (
            <button
              key={it.name}
              className="flex items-center gap-1.5 rounded-full bg-ink-800 px-2.5 py-1.5 text-xs text-ink-200 hover:bg-ink-700"
              onClick={() => setSheet({ name: it.name, category: it.category ?? categoryOf(it.name) })}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: colorForTrack(it.name) }} />
              {labelForTrack(it.name)}
            </button>
          ))}
        </div>
      </div>

      {!hasAny && (
        <div className="card text-center text-sm text-ink-400">
          No data yet. Add a log entry or a meal and your trends will appear here.
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Gut episodes" value={gut.length} />
        <Stat label="Infections" value={inf.length} />
        <Stat label="Warming bottle" value={gut.filter((g) => g.warming_bottle_needed).length} />
      </div>

      {(wb.length > 0 || hasRelease) && (
        <ChartCard title="Energy & mood">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={moodData} margin={{ left: -20, right: hasRelease ? -20 : 8, top: 8 }}>
              <CartesianGrid stroke="#1b2740" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#6b7a99', fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis yAxisId="l" domain={[0, 10]} tick={{ fill: '#6b7a99', fontSize: 11 }} />
              {hasRelease && (
                <YAxis yAxisId="r" orientation="right" domain={[0, 100]} reversed tick={{ fill: '#ec4899', fontSize: 10 }} />
              )}
              <Tooltip contentStyle={tooltipStyle} />
              <Line isAnimationActive={false} yAxisId="l" type="monotone" dataKey="energy" stroke="#2dd4bf" strokeWidth={2} dot={false} connectNulls />
              <Line isAnimationActive={false} yAxisId="l" type="monotone" dataKey="mood" stroke="#a78bfa" strokeWidth={2} dot={false} connectNulls />
              {hasRelease && (
                <Line
                  isAnimationActive={false}
                  yAxisId="r"
                  type="monotone"
                  dataKey="release"
                  stroke="#ec4899"
                  strokeWidth={2}
                  dot={releaseDot}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
          <Legend
            items={[
              ['#2dd4bf', 'Energy'],
              ['#a78bfa', 'Mood'],
              ...(hasRelease ? ([['#ec4899', 'Release 💦 (0% top)']] as [string, string][]) : []),
            ]}
          />
        </ChartCard>
      )}

      {stressData.some((d) => d.stress != null) && (
        <ChartCard title="Stress load" hint="low is good — high stress sits at the bottom">
          <ResponsiveContainer width="100%" height={150}>
            <LineChart data={stressData} margin={{ left: -20, right: 8, top: 8 }}>
              <CartesianGrid stroke="#1b2740" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#6b7a99', fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis domain={[0, 10]} reversed tick={{ fill: '#6b7a99', fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line isAnimationActive={false} type="monotone" dataKey="stress" stroke="#f59e0b" strokeWidth={2} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {hasIllness && (
        <ChartCard title="Illness & gut" hint="low is good; infection level carries forward until you log it gone">
          <ResponsiveContainer width="100%" height={170}>
            <LineChart data={illnessData} margin={{ left: -20, right: 8, top: 8 }}>
              <CartesianGrid stroke="#1b2740" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#6b7a99', fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis domain={[0, 10]} reversed tick={{ fill: '#6b7a99', fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <ReferenceLine y={4} stroke="#334155" strokeDasharray="3 3" />
              <Line isAnimationActive={false} type="monotone" dataKey="infection" name="Infection" stroke="#e66767" strokeWidth={2} dot={false} connectNulls />
              <Line isAnimationActive={false} type="monotone" dataKey="gutPain" name="Gut pain" stroke="#d95926" strokeWidth={2} dot={{ r: 2 }} connectNulls={false} />
              <Line isAnimationActive={false} type="monotone" dataKey="stool" name="Stool (Bristol)" stroke="#9085e9" strokeWidth={2} dot={{ r: 2 }} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
          <Legend items={[['#e66767', 'Infection'], ['#d95926', 'Gut pain'], ['#9085e9', 'Stool (Bristol, 4 ideal)']]} />
        </ChartCard>
      )}

      {movementSeries.length > 0 && (
        <ChartCard title="Movement & exercise (min)" hint="tap a day to log it">
          <PlateauChart
            dates={spine}
            series={movementSeries}
            onPickDay={(d) => setSheet({ name: movementSeries[0].key, category: 'activity', date: d })}
          />
        </ChartCard>
      )}

      {practiceSeries.length > 0 && (
        <ChartCard title="Meditation & breath work (min)" hint="tap a day to log it">
          <PlateauChart
            dates={spine}
            series={practiceSeries}
            onPickDay={(d) => setSheet({ name: practiceSeries[0].key, category: 'practice', date: d })}
          />
        </ChartCard>
      )}

      {painKeys.length > 0 && (
        <ChartCard title="Pain & discomfort (0-10)" hint="low is good — worse pain sits at the bottom">
          <ResponsiveContainer width="100%" height={170}>
            <LineChart data={painRows} margin={{ left: -20, right: 8, top: 8 }}>
              <CartesianGrid stroke="#1b2740" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#6b7a99', fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis domain={[0, 10]} reversed tick={{ fill: '#6b7a99', fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              {painKeys.map((k) => (
                <Line isAnimationActive={false}
                  key={k}
                  type="monotone"
                  dataKey={k}
                  name={labelForTrack(k)}
                  stroke={colorForTrack(k)}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-300">
            {painKeys.map((k) => (
              <button key={k} className="flex items-center gap-1.5 hover:text-white" onClick={() => setSheet({ name: k, category: 'symptom' })}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorForTrack(k) }} />
                {labelForTrack(k)}
              </button>
            ))}
          </div>
        </ChartCard>
      )}

      {kcalByDate.size > 0 && (
        <ChartCard title="Daily calories">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={calData} margin={{ left: -20, right: 8, top: 8 }}>
              <CartesianGrid stroke="#1b2740" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#6b7a99', fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tick={{ fill: '#6b7a99', fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar isAnimationActive={false} dataKey="kcal" fill="#0d9488" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-2 grid grid-cols-4 gap-2 text-center text-xs text-ink-300">
            <Avg label="Protein" v={totalMacro.p / mealDays} />
            <Avg label="Fat" v={totalMacro.f / mealDays} />
            <Avg label="Carbs" v={totalMacro.c / mealDays} />
            <Avg label="Fiber" v={totalMacro.fb / mealDays} />
          </div>
        </ChartCard>
      )}

      {trackGroups.map((g) => (
        <TrackCard key={g.name} group={g} onLog={() => setSheet({ name: g.name, category: null })} />
      ))}

      {sheet && (
        <QuickLogSheet
          name={sheet.name}
          category={sheet.category}
          dates={spine}
          initialDate={sheet.date}
          onClose={() => setSheet(null)}
          onChanged={() => setRefresh((k) => k + 1)}
        />
      )}
    </div>
  )
}

// Release rests at a constant 0% along the top of its axis, so dotting every day
// would draw a dotted rail across the chart. Only mark the days it actually happened.
function releaseDot(props: {
  cx?: number
  cy?: number
  index?: number
  payload?: { release?: number; rawDate?: string }
}) {
  const { cx, cy, payload, index } = props
  // Recharts calls this for every row, so each returned node needs its own key —
  // keying the empty case by date/index avoids duplicate-key warnings.
  const key = payload?.rawDate ?? `release-${index ?? 0}`
  const v = payload?.release ?? 0
  if (cx == null || cy == null || v <= 0) {
    return <circle key={key} cx={0} cy={0} r={0} fill="none" stroke="none" />
  }
  return <circle key={key} cx={cx} cy={cy} r={3} fill="#ec4899" stroke="#0b1120" strokeWidth={1} />
}

// One row per spine date with a column per track name (null where unlogged).
function buildRows(spine: string[], tracks: Track[], keys: string[]) {
  const byDate = new Map<string, Record<string, number>>()
  for (const t of tracks) {
    if (t.value == null || !keys.includes(t.name)) continue
    const row = byDate.get(t.date) ?? {}
    row[t.name] = t.value
    byDate.set(t.date, row)
  }
  return spine.map((d) => ({ date: fmtDate(d), rawDate: d, ...(byDate.get(d) ?? {}) }))
}

function categoryOf(name: string): string | null {
  const g = groupForTrack(name)
  if (g === 'symptom') return 'symptom'
  if (g === 'practice') return 'practice'
  if (g === 'movement') return 'activity'
  if (name === 'release') return 'release'
  return null
}

function TrackCard({
  group,
  onLog,
}: {
  group: { name: string; unit: string; count: number; series: { date: string; value: number }[] }
  onLog: () => void
}) {
  const title = labelForTrack(group.name) + (group.unit ? ` (${group.unit})` : '')
  const reversed = isLowerBetter(group.name)
  if (group.series.length >= 2) {
    const vals = group.series.map((s) => s.value)
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const pad = (max - min || Math.max(1, Math.abs(max) * 0.05)) * 0.5
    const domain: [number, number] = [Math.floor(min - pad), Math.ceil(max + pad)]
    return (
      <ChartCard title={title}>
        <ResponsiveContainer width="100%" height={150}>
          <LineChart data={group.series} margin={{ left: -20, right: 8, top: 8 }}>
            <CartesianGrid stroke="#1b2740" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: '#6b7a99', fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis domain={domain} reversed={reversed} tick={{ fill: '#6b7a99', fontSize: 11 }} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Line isAnimationActive={false} type="monotone" dataKey="value" stroke={colorForTrack(group.name)} strokeWidth={2} dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
        <button className="mt-1 text-xs text-ink-400 hover:text-white" onClick={onLog}>
          + Log {labelForTrack(group.name)}
        </button>
      </ChartCard>
    )
  }
  const latest = group.series.at(-1)
  return (
    <button className="card flex w-full items-center justify-between !py-3 text-left" onClick={onLog}>
      <div className="text-sm text-white">{title}</div>
      <div className="text-xs text-ink-300">
        {latest ? `latest ${latest.value}` : `${group.count}×`}
        {group.count > 1 && latest ? ` · ${group.count}×` : ''}
      </div>
    </button>
  )
}

const tooltipStyle = { background: '#111a2e', border: '1px solid #1b2740', borderRadius: 12, color: '#e6ecf5' }

function ChartCard({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <div className="label mb-0.5">{title}</div>
      {hint && <div className="mb-2 text-[10px] text-ink-500">{hint}</div>}
      {children}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card !p-3 text-center">
      <div className="text-2xl font-semibold text-white">{value}</div>
      <div className="text-[11px] text-ink-400">{label}</div>
    </div>
  )
}

function Avg({ label, v }: { label: string; v: number }) {
  return (
    <div>
      <div className="font-semibold text-white">{Math.round(v)}g</div>
      <div className="text-ink-400">{label}/day</div>
    </div>
  )
}

function Legend({ items }: { items: [string, string][] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-300">
      {items.map(([c, l]) => (
        <span key={l} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} /> {l}
        </span>
      ))}
    </div>
  )
}
