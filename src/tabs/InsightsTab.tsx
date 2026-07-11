import { useMemo, useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { daysAgoISO, fmtDate } from '../lib/dates'
import { wellbeingSince, gutSince, infectionsSince, mealsSince, dayContextSince, tracksSince } from '../db/queries'
import type { Track } from '../types'

const RANGES = [
  { label: '14d', days: 14 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
]

export default function InsightsTab() {
  const [days, setDays] = useState(30)
  const since = daysAgoISO(days)

  const { wb, gut, inf, meals, ctx, tracks } = useMemo(
    () => ({
      wb: wellbeingSince(since),
      gut: gutSince(since),
      inf: infectionsSince(since),
      meals: mealsSince(since),
      ctx: dayContextSince(since),
      tracks: tracksSince(since),
    }),
    [since],
  )

  // Group tracks by name; numeric ones get a line chart, the rest a count.
  const trackGroups = useMemo(() => {
    const byName = new Map<string, Track[]>()
    for (const t of tracks) {
      const arr = byName.get(t.name) ?? []
      arr.push(t)
      byName.set(t.name, arr)
    }
    return [...byName.entries()].map(([name, rows]) => {
      const numeric = rows.filter((r) => r.value != null)
      return {
        name,
        unit: rows.find((r) => r.unit)?.unit ?? '',
        count: rows.length,
        series: numeric.map((r) => ({ date: fmtDate(r.date), value: r.value as number })),
      }
    })
  }, [tracks])

  const moodData = wb.map((w) => ({ date: fmtDate(w.date), energy: w.energy, mood: w.mood }))
  const stressData = ctx.map((c) => ({ date: fmtDate(c.date), stress: c.stress_load }))

  // daily calories
  const byDay = new Map<string, number>()
  for (const m of meals) byDay.set(m.date, (byDay.get(m.date) ?? 0) + (m.calories ?? 0))
  const calData = [...byDay.entries()].sort().map(([d, kcal]) => ({ date: fmtDate(d), kcal }))

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
  const mealDays = byDay.size || 1

  const hasAny = wb.length || gut.length || inf.length || meals.length || tracks.length

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

      {moodData.length > 0 && (
        <ChartCard title="Energy & mood">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={moodData} margin={{ left: -20, right: 8, top: 8 }}>
              <CartesianGrid stroke="#1b2740" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#6b7a99', fontSize: 11 }} />
              <YAxis domain={[0, 10]} tick={{ fill: '#6b7a99', fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="energy" stroke="#2dd4bf" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="mood" stroke="#a78bfa" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          <Legend items={[['#2dd4bf', 'Energy'], ['#a78bfa', 'Mood']]} />
        </ChartCard>
      )}

      {stressData.some((d) => d.stress != null) && (
        <ChartCard title="Stress load">
          <ResponsiveContainer width="100%" height={150}>
            <LineChart data={stressData} margin={{ left: -20, right: 8, top: 8 }}>
              <CartesianGrid stroke="#1b2740" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#6b7a99', fontSize: 11 }} />
              <YAxis domain={[0, 10]} tick={{ fill: '#6b7a99', fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="stress" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {calData.length > 0 && (
        <ChartCard title="Daily calories">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={calData} margin={{ left: -20, right: 8, top: 8 }}>
              <CartesianGrid stroke="#1b2740" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#6b7a99', fontSize: 11 }} />
              <YAxis tick={{ fill: '#6b7a99', fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="kcal" fill="#0d9488" radius={[4, 4, 0, 0]} />
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
        <TrackCard key={g.name} group={g} />
      ))}
    </div>
  )
}

function TrackCard({ group }: { group: { name: string; unit: string; count: number; series: { date: string; value: number }[] } }) {
  const title = group.name.charAt(0).toUpperCase() + group.name.slice(1) + (group.unit ? ` (${group.unit})` : '')
  if (group.series.length >= 2) {
    // Fit the Y-axis to the data range (with padding) so narrow-band series like
    // weight or a steady meditation time actually show their variation.
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
            <XAxis dataKey="date" tick={{ fill: '#6b7a99', fontSize: 11 }} />
            <YAxis domain={domain} tick={{ fill: '#6b7a99', fontSize: 11 }} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Line type="monotone" dataKey="value" stroke="#38bdf8" strokeWidth={2} dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    )
  }
  // Not enough numeric points to chart — show a compact summary instead.
  const latest = group.series.at(-1)
  return (
    <div className="card flex items-center justify-between !py-3">
      <div className="text-sm text-white">{title}</div>
      <div className="text-xs text-ink-300">
        {latest ? `latest ${latest.value}` : `${group.count}×`}
        {group.count > 1 && latest ? ` · ${group.count}×` : ''}
      </div>
    </div>
  )
}

const tooltipStyle = { background: '#111a2e', border: '1px solid #1b2740', borderRadius: 12, color: '#e6ecf5' }

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <div className="label mb-2">{title}</div>
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
    <div className="mt-2 flex gap-4 text-xs text-ink-300">
      {items.map(([c, l]) => (
        <span key={l} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} /> {l}
        </span>
      ))}
    </div>
  )
}
