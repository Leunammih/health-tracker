import { useCallback, useMemo, useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
  ComposedChart, Area,
} from 'recharts'
import { daysAgoISO, dateSpine, fmtDate, sleepDurationMin } from '../lib/dates'
import {
  wellbeingSince, gutSince, infectionsSince, mealsSince, dayContextSince, tracksSince,
  activitiesSince, allTrackNames, eventsSince, activeSupplements, pausedSupplements,
  stoppedSupplements,
} from '../db/queries'
import {
  colorForTrack, labelForTrack, defForName, groupForTrack, isLowerBetter, QUICK_LOG_ITEMS,
  canonicalTrackName, chartPalette, scaleForTrack, displayScale, toDisplay, paletteGroup,
} from '../lib/metrics'
import { allGroups, assignMetricToGroup } from '../lib/groups'
import { assignMetricToChart, axisKindFor, chartFor, DUR_CHART, RATING_CHART } from '../lib/chartLayout'
import type { ChartOption } from '../components/MoveMetricSheet'
import { loadInsightsLayout, orderIds, setSectionCollapsed, moveSection, type InsightsLayout } from '../lib/insightsLayout'
import { loadHiddenMetrics, supplementMetricNames, isSuppressedMetric } from '../lib/hiddenMetrics'
import { useTheme } from '../lib/theme'
import PlateauChart, { type PlateauSeries } from '../components/PlateauChart'
import QuickLogSheet from '../components/QuickLogSheet'
import SleepSheet from '../components/SleepSheet'
import MoveMetricSheet from '../components/MoveMetricSheet'
import { MetricIcon, GroupIcon } from '../components/metricIcons'
import { IconMeal } from '../components/icons'
import heroResources from '../assets/hero-resources.jpg'
import { classifyMeal, FOOD_GROUP_KEYS, type FoodGroupBreakdown } from '../lib/foodGroups'
import { loadGoals } from '../lib/goals'
import type { Track, Meal, Ingredient } from '../types'

const RANGES = [
  { label: '3d', days: 3 },
  { label: '7d', days: 7 },
  { label: '14d', days: 14 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
]

// Fixed (not hashed) — a small, always-present set of categories rather than an
// open-ended list of user-named tracks, so unlike chartPalette()'s hue arcs these
// are just picked once: meat sub-coloured by animal (beef red, chicken yellow,
// fish pink) as asked for, vegan/dairy in cool greens/violets to read as distinct
// from the meat family, "unclassified" a neutral grey rather than a hue at all.
const MACRO_COLORS = { protein: '#14b8a6', fat: '#eab308', carbs: '#38bdf8' }
const FOOD_GROUP_COLORS = {
  vegan: '#22c55e',
  dairy_eggs: '#a78bfa',
  meat_beef: '#ef4444',
  meat_chicken: '#facc15',
  meat_fish: '#ec4899',
  meat_other: '#f97316',
  unclassified: 'var(--faint)',
}

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
  // The metric currently in the "combine into another graph" picker — this is the
  // direct-from-Insights entry point for the ⇄ button; it opens MoveMetricSheet
  // with its category preselected the same way QuickEntryPanel's per-row move
  // already does, since "combine" and "move to a category" are the same operation
  // under the hood (a category's members always share one chart).
  const [combining, setCombining] = useState<{ name: string; from: string; chart: string } | null>(null)
  // Collapsed by default — the grid used to occupy the whole first screen before
  // any chart was visible.
  const [tapOpen, setTapOpen] = useState(false)
  // Order + fold state for the sections built below (Wellbeing & sleep, Illness &
  // gut, one per category, Nutrition) — separate from the Log tab's own collapsed
  // groups (lib/uiPrefs.ts): folding a chart while browsing Insights has no reason
  // to also fold the matching quick-entry group on the Log tab.
  const [sectionsLayout, setSectionsLayout] = useState<InsightsLayout>(() => loadInsightsLayout())
  const light = useTheme() === 'light'

  const since = daysAgoISO(days)

  const { wb, gut, inf, meals, ctx, tracks, acts, known, events, supplements } = useMemo(
    () => ({
      wb: wellbeingSince(since),
      gut: gutSince(since),
      inf: infectionsSince(since),
      meals: mealsSince(since),
      ctx: dayContextSince(since),
      tracks: tracksSince(since),
      acts: activitiesSince(since),
      known: allTrackNames(),
      events: eventsSince(since),
      supplements: [...activeSupplements(), ...pausedSupplements(), ...stoppedSupplements(50)],
    }),
    [since, refresh],
  )

  // Daily nutrition goals (Settings → Daily nutrition goals), drawn as a target
  // line on the calories chart. Null when unset — no line, chart unchanged.
  const goals = useMemo(() => loadGoals(), [refresh])

  // Reference-line markers for the "started X" events above, drawn ONLY on the
  // Illness & gut chart (his explicit call, 2026-08-21 — they used to also appear
  // on Energy & mood and on every custom category's rating chart, which read as
  // supplement clutter on charts that have nothing to do with supplements). Keyed
  // on the same formatted date string the categorical XAxis uses — Recharts
  // positions a ReferenceLine by matching x against an axis tick, so this must be
  // identical to what Illness & gut's dataKey="date" renders for that day.
  //
  // The label is drawn rotated inside the plot area, so it is truncated here: a real
  // event label is a sentence ("July 5 start: Creatine monohydrate 3 g per day by …")
  // and at full length it runs the height of the chart and over the data. The full
  // text stays readable in the Log tab's event list.
  //
  // Supplements draw their own start and stop lines, DERIVED here rather than
  // written as `events` rows when one is added. Deriving means they can never drift:
  // rename a supplement, correct its start date, or delete it, and the markers
  // follow with no bookkeeping, no extra column and nothing to migrate. It also
  // closes the gap where starting a supplement drew no line at all unless he
  // remembered to log the same thing twice.
  const eventMarkers = useMemo(() => {
    const trim = (t: string) => (t.length > 26 ? `${t.slice(0, 25).trimEnd()}…` : t)
    const rows = events.map((e) => ({ id: e.id, date: e.date, label: e.label }))
    for (const s of supplements) {
      if (s.start_date >= since) rows.push({ id: `sup-start-${s.id}`, date: s.start_date, label: `Started ${s.name}` })
      if (s.paused_since && s.paused_since >= since) rows.push({ id: `sup-pause-${s.id}`, date: s.paused_since, label: `Paused ${s.name}` })
      if (s.end_date && s.end_date >= since) rows.push({ id: `sup-stop-${s.id}`, date: s.end_date, label: `Stopped ${s.name}` })
    }
    return rows.map((r) => ({ id: r.id, x: fmtDate(r.date), label: trim(r.label) }))
  }, [events, supplements, since])

  // One shared X axis for every chart — a day with no entry still gets a column, so
  // the graphs stack into readable vertical columns for the same date.
  //
  // It starts at the first day that actually holds data, not at the range boundary.
  // Two reasons: 13 days of history inside a 30d window left ~55% of every chart
  // blank, and the plateau charts draw a missing day at 0, so the empty lead-in
  // rendered as a flat "did nothing" line across days that were never logged at all.
  // On a health tracker those are opposite claims — a sick day with no entry is not
  // a day of zero movement — so the axis stops where the record does.
  const spine = useMemo(() => {
    const dated: { date: string }[][] = [wb, gut, inf, meals, ctx, tracks, acts]
    // ISO dates sort lexicographically, so plain string compare finds the earliest.
    const earliest = dated
      .flat()
      .map((r) => r.date)
      .filter(Boolean)
      .reduce<string | null>((min, d) => (min === null || d < min ? d : min), null)
    return dateSpine(earliest !== null && earliest > since ? earliest : since)
  }, [wb, gut, inf, meals, ctx, tracks, acts, since])

  // Metrics with their own dedicated chart elsewhere on this page (Energy & mood,
  // Sleep, Stress, Illness & gut) must not ALSO appear in their category's generic
  // chart below, or the same number would be drawn twice. `stomach pain` is
  // deliberately NOT here — it appears in both the Pain-shaped chart below AND the
  // Illness & gut chart (see illnessData above), which is intentional.
  const DEDICATED = useMemo(
    () => new Set(['energy', 'mood', 'stress', 'release', 'infection', 'stool', 'warming bottle']),
    [],
  )

  // One real chart per CATEGORY rather than three hardcoded blocks keyed to the
  // literal names 'movement'/'practice'/'symptom'. Categories are user-defined (see
  // lib/groups.ts) — a group invented on the phone matches none of those literal
  // names, so routing has to come from what's actually IN the group, not its key:
  // every member a duration -> the same rounded-plateau chart Movement draws today;
  // every member a 0-10/percent rating -> the same multi-line chart Pain draws
  // today; anything mixed -> one small card per metric, as the old catch-all
  // "Other" section always did. This is what makes "create a category" mean
  // something in Insights instead of the item just falling into Other.
  // Each category's chart area used to be an all-or-nothing choice: every member a
  // duration -> one shared plateau, every member a rating -> one shared line chart,
  // ANYTHING else mixed in -> fall back to one small card per metric, no merging at
  // all. That was the bug: a category holding Brain clarity (rating) alongside
  // Computer time and Phone use (both duration) fell into the "anything else"
  // branch, so Computer time and Phone use stopped sharing a chart even though nothing
  // about them individually changed. Categories now bucket by SHAPE independently —
  // every duration member always shares one plateau, every rating member always
  // shares one line chart, and only what's left over (checkmarks, plain numbers,
  // measurements) falls back to individual cards. All three can render together
  // under the same heading.
  const groupCharts = useMemo(() => {
    const hidden = loadHiddenMetrics()
    const supplements = supplementMetricNames()

    const byGroup = new Map<string, Set<string>>()
    for (const t of tracks) {
      if (t.value == null || DEDICATED.has(t.name)) continue
      if (isSuppressedMetric(t.name, hidden, supplements)) continue
      const set = byGroup.get(groupForTrack(t.name, t.category)) ?? new Set<string>()
      set.add(t.name)
      byGroup.set(groupForTrack(t.name, t.category), set)
    }

    return allGroups().map((g): GroupCharts => {
      const names = [...(byGroup.get(g.key) ?? [])].sort()
      // Workouts (the `activities` table) always fold into the canonical 'movement'
      // key specifically, whatever it has been renamed to display as — they are not
      // part of the customisable-metric system, so they cannot be reassigned to a
      // different group the way a track can. They always sit on Movement's shared
      // duration chart.
      const isMovement = g.key === 'movement'
      if (!names.length && !(isMovement && acts.length)) return { key: g.key, label: g.label, icon: g.icon, charts: [] }

      // Duration values per series key: tracks, plus workouts on Movement.
      const durByName = new Map<string, Map<string, number>>()
      const addDur = (key: string, date: string, mins: number | null) => {
        if (!key || mins == null) return
        const m = durByName.get(key) ?? new Map<string, number>()
        m.set(date, (m.get(date) ?? 0) + mins)
        durByName.set(key, m)
      }
      const activityKeys = new Set<string>()
      if (isMovement) {
        for (const a of acts) {
          const key = defForName(a.type ?? '')?.key ?? (a.type ?? '').trim().toLowerCase()
          if (!key) continue
          activityKeys.add(key)
          addDur(key, a.date, a.duration_min)
        }
      }
      for (const t of tracks) if (names.includes(t.name) && axisKindFor(t.name) === 'duration') addDur(t.name, t.date, t.value)

      // Which chart each member is on: his explicit choice (lib/chartLayout.ts), else
      // the default for its shape. Workout-only keys always ride the shared one.
      const byChart = new Map<string, string[]>()
      const put = (chart: string, name: string) => {
        const list = byChart.get(chart) ?? []
        if (!list.includes(name)) list.push(name)
        byChart.set(chart, list)
      }
      for (const n of names) put(chartFor(n, g.key), n)
      for (const k of activityKeys) if (!names.includes(k)) put(DUR_CHART, k)

      const order = (id: string) => (id === DUR_CHART ? 0 : id === RATING_CHART ? 1 : 2)
      const charts = [...byChart.entries()]
        .sort(([a], [b]) => order(a) - order(b) || a.localeCompare(b))
        .map(([id, members]) => buildChart(g, id, members, durByName, activityKeys))
      return { key: g.key, label: g.label, icon: g.icon, charts }
    })

    function buildChart(
      g: { key: string; label: string },
      id: string,
      members: string[],
      durByName: Map<string, Map<string, number>>,
      activityKeys: Set<string>,
    ): CategoryChart {
      const kindOf = (m: string) => (activityKeys.has(m) && !tracks.some((t) => t.name === m) ? 'duration' : axisKindFor(m))
      const kinds = [...new Set(members.map(kindOf))]
      const palette = chartPalette(members, paletteGroup(g.key), light)
      // The two shared charts keep the category's name; any other chart is named by
      // what's on it, so two 0-10 charts in one category can't share a title.
      const named = id === DUR_CHART || id === RATING_CHART
      const memberTitle = members.length <= 2
        ? members.map(labelForTrack).join(' & ')
        : `${labelForTrack(members[0])}, ${labelForTrack(members[1])} +${members.length - 2}`
      const base = named ? g.label : memberTitle

      if (kinds.length === 1 && kinds[0] === 'duration') {
        // Members store minutes either way — only their preferred DISPLAY unit can
        // differ (an hours-mode metric like Computer time still stores raw minutes,
        // see G-7a). Hours only when every member prefers it, and never on Movement,
        // whose workouts are plain minutes.
        const hours = g.key !== 'movement' && members.every((n) => displayScale(scaleForTrack(n, null)).unit === 'h')
        const factor = hours ? 60 : 1
        const series: PlateauSeries[] = members
          .filter((k) => durByName.has(k))
          .map((key) => ({
            key,
            label: labelForTrack(key),
            color: palette[key],
            values: spine.map((d) => {
              const v = durByName.get(key)!.get(d)
              return v == null ? null : v / factor
            }),
          }))
        const unit = hours ? 'h' : 'min'
        return { id, title: `${base} (${unit})`, members, kind: 'duration', duration: series, durationUnit: unit }
      }

      if (kinds.length === 1 && kinds[0] === 'rating') {
        // Reversed only when EVERY member is lowerIsBetter — a mixed chart draws
        // right-way-up rather than picking a direction that misrepresents half of it.
        const reversed = members.every((n) => isLowerBetter(n))
        return {
          id, title: `${base} (0-10)`, members, kind: 'rating',
          rating: { keys: members, rows: buildRows(spine, tracks, members), palette, reversed },
        }
      }

      if (members.length === 1) {
        const name = members[0]
        const rowsForName = tracks.filter((t) => t.name === name && t.value != null)
        const scale = scaleForTrack(name, rowsForName.find((r) => r.category)?.category ?? null)
        return {
          id, title: labelForTrack(name), members, kind: 'card',
          card: {
            name,
            unit: displayScale(scale).unit,
            count: rowsForName.length,
            series: rowsForName.map((r) => ({ date: fmtDate(r.date), rawDate: r.date, value: toDisplay(r.value as number, scale) })),
          },
        }
      }

      // Different scales on one chart: one axis per scale family, in order of first
      // appearance — the first on the left, the second on the right, any more
      // stacked beside those (the move sheet warns before it comes to that).
      const axisIds = kinds
      const axes: MixedAxis[] = axisIds.map((k, i) => {
        const of = members.filter((m) => kindOf(m) === k)
        const sample = of[0]
        const orientation: 'left' | 'right' = i % 2 === 0 ? 'left' : 'right'
        const side = i < 2 ? orientation : `far ${orientation}`
        if (k === 'duration') {
          const hours = of.every((n) => !activityKeys.has(n) && displayScale(scaleForTrack(n, null)).unit === 'h')
          return { id: k, label: hours ? 'h' : 'min', orientation, side, domain: [0, 'auto'], factor: hours ? 60 : 1 }
        }
        if (k === 'rating') return { id: k, label: '0-10', orientation, side, domain: [0, 10], reversed: of.every((n) => isLowerBetter(n)) }
        if (k === 'bool') return { id: k, label: 'yes/no', orientation, side, domain: [0, 1] }
        // Weight and other plain numbers: fitted to the data, not from 0 — 78 kg on a
        // 0-80 axis is a flat line along the top.
        return { id: k, label: displayScale(scaleForTrack(sample, null)).unit || labelForTrack(sample), orientation, side, domain: ['auto', 'auto'] }
      })
      const rows = spine.map((d) => {
        const row: Record<string, number | string | null> = { date: fmtDate(d), rawDate: d }
        for (const m of members) {
          const k = kindOf(m)
          if (k === 'duration') {
            const v = durByName.get(m)?.get(d)
            row[m] = v == null ? null : v / (axes.find((a) => a.id === k)!.factor ?? 1)
          } else {
            const t = tracks.find((x) => x.name === m && x.date === d && x.value != null)
            row[m] = t ? toDisplay(t.value as number, scaleForTrack(m, t.category)) : null
          }
        }
        return row
      })
      const series = members.map((m) => ({
        key: m,
        label: labelForTrack(m),
        color: palette[m],
        axis: kindOf(m),
        shape: (kindOf(m) === 'duration' ? 'bar' : kindOf(m) === 'bool' ? 'dot' : 'line') as 'bar' | 'line' | 'dot',
      }))
      return {
        id, title: `${base} (${axes.map((a) => a.label).join(' · ')})`, members, kind: 'mixed',
        mixed: { rows, series, axes },
      }
    }
  }, [tracks, acts, spine, light, DEDICATED])

  // Every chart in each category with what's on it, for the move sheet's second step.
  const chartsByGroup = useMemo(() => {
    const map: Record<string, ChartOption[]> = {}
    for (const gc of groupCharts) map[gc.key] = gc.charts.map((c) => ({ id: c.id, title: c.title, members: c.members }))
    return map
  }, [groupCharts])

  // Category first, then the exact chart inside it (lib/chartLayout.ts).
  async function moveMetricToChart(name: string, group: string, chart: string) {
    if (groupForTrack(name) !== group) await assignMetricToGroup(name, group)
    await assignMetricToChart(name, group, chart)
    setCombining(null)
    setRefresh((k) => k + 1)
  }

  // --- sleep: duration (computed from bedtime/wake, never stored) + felt quality,
  // both spine-aligned. High is good for both, so neither axis is reversed.
  const sleepByDate = new Map(wb.map((w) => [w.date, w]))
  const sleepData = spine.map((d) => {
    const w = sleepByDate.get(d)
    const mins = w?.sleep_start && w?.sleep_end ? sleepDurationMin(w.sleep_start, w.sleep_end) : null
    const bed = clockOffset(w?.sleep_start)
    const wake = clockOffset(w?.sleep_end)
    return {
      date: fmtDate(d),
      hours: mins != null ? Math.round((mins / 60) * 10) / 10 : null,
      quality: w?.sleep_quality ?? null,
      bed,
      wake,
      // The shaded band between the two — the night itself.
      night: bed != null && wake != null ? [bed, wake] : null,
    }
  })
  const hasSleep = sleepData.some((r) => r.hours != null || r.quality != null)
  const hasSleepTimes = sleepData.some((r) => r.bed != null || r.wake != null)
  // Clock axis fitted to his actual nights (padded half an hour), so a 23:00-07:30
  // routine isn't squashed into a 24h scale.
  const clockVals = sleepData.flatMap((r) => [r.bed, r.wake]).filter((v): v is number => v != null)
  // Snapped to the tick step (2h, or 4h for a wide spread) so the ticks read
  // 22:00 / 00:00 / 02:00… and both ends of the axis carry a label.
  const clockLo = clockVals.length ? Math.min(...clockVals) - 0.5 : 10
  const clockHi = clockVals.length ? Math.max(...clockVals) + 0.5 : 20
  const clockStep = clockHi - clockLo > 10 ? 4 : 2
  const clockDomain: [number, number] = [
    Math.max(0, Math.floor(clockLo / clockStep) * clockStep),
    Math.min(24, Math.ceil(clockHi / clockStep) * clockStep),
  ]
  const clockTicks: number[] = []
  for (let t = clockDomain[0]; t <= clockDomain[1]; t += clockStep) clockTicks.push(t)
  const [sleepSheet, setSleepSheet] = useState<{ date?: string } | null>(null)
  // Recharts reports the tapped column by index into the data, which is the spine.
  const openSleepAt = (state: { activeTooltipIndex?: number } | null) => {
    const i = state?.activeTooltipIndex
    if (i != null && spine[i]) setSleepSheet({ date: spine[i] })
  }
  const colSleepHours = colorForTrack('sleep hours')
  const colSleepQuality = colorForTrack('sleep quality')
  // Bedtime/wake get the two sleep hues, matched by meaning: going to bed with felt
  // quality's colour would suggest a link that isn't there, so bedtime takes the
  // hours colour (the night starts) and wake a lighter text tone.
  const colSleepBed = colSleepHours
  const colSleepWake = 'var(--text)'

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
  const colEnergy = colorForTrack('energy')
  const colMood = colorForTrack('mood')
  const colRelease = colorForTrack('release')
  // Release rests at a constant 0% along the top of its axis, so dotting every
  // day would draw a dotted rail across the chart. Only mark days it actually
  // happened — a closure so it can use the theme-aware release colour above.
  const releaseDot = useCallback(
    (props: { cx?: number; cy?: number; index?: number; payload?: { release?: number; rawDate?: string } }) => {
      const { cx, cy, payload, index } = props
      // Recharts calls this for every row, so each returned node needs its own
      // key — keying the empty case by date/index avoids duplicate-key warnings.
      const key = payload?.rawDate ?? `release-${index ?? 0}`
      const v = payload?.release ?? 0
      if (cx == null || cy == null || v <= 0) {
        return <circle key={key} cx={0} cy={0} r={0} fill="none" stroke="none" />
      }
      return <circle key={key} cx={cx} cy={cy} r={3} fill={colRelease} stroke="var(--bg)" strokeWidth={1} />
    },
    [colRelease],
  )

  const ctxByDate = new Map(ctx.map((c) => [c.date, c]))
  const stressData = spine.map((d) => ({ date: fmtDate(d), stress: ctxByDate.get(d)?.stress_load ?? null }))
  const colStress = colorForTrack('stress')

  // --- illness: infection severity carried forward until logged as gone (0),
  // plus gut pain and Bristol stool consistency on the same reversed axis.
  // Sources are diary-extracted infections/gut_events AND manually tap-logged
  // 'infection'/'stool'/'stomach pain' tracks (src/lib/metrics.ts) — either can set
  // a day's value, and both participate in infection's carry-forward walk below.
  // Gut pain has no dedicated track of its own — "gut pain" tap-logs against the
  // existing 'stomach pain' metric, which already fuzzy-matches "gut" in its regex.
  const illnessData = useMemo(() => {
    const infByDate = new Map<string, number>()
    for (const i of inf) {
      const s = severityScore(i.severity)
      if (s != null) infByDate.set(i.date, s)
    }
    for (const t of tracks) if (t.name === 'infection' && t.value != null) infByDate.set(t.date, t.value)
    const gutByDate = new Map(gut.map((g) => [g.date, g]))
    const gutPainTrackByDate = new Map(
      tracks.filter((t) => t.name === 'stomach pain' && t.value != null).map((t) => [t.date, t.value as number]),
    )
    const stoolTrackByDate = new Map(
      tracks.filter((t) => t.name === 'stool' && t.value != null).map((t) => [t.date, t.value as number]),
    )
    let carried: number | null = null
    return spine.map((d) => {
      if (infByDate.has(d)) carried = infByDate.get(d) as number
      const g = gutByDate.get(d)
      return {
        date: fmtDate(d),
        rawDate: d,
        infection: carried,
        gutPain: gutPainTrackByDate.get(d) ?? g?.pain ?? null,
        stool: stoolTrackByDate.get(d) ?? g?.stool_consistency ?? null,
      }
    })
  }, [inf, gut, tracks, spine])

  const hasIllness = illnessData.some((r) => r.infection != null || r.gutPain != null || r.stool != null)
  const illnessPalette = useMemo(
    () => chartPalette(['Infection', 'Gut pain', 'Stool'], 'illness', light),
    [light],
  )

  // --- calories, and the macro/food-group 100%-stacked bars, all on the shared
  // spine. Bar A splits calories into protein/fat/carbs by calorie share (4/4/9
  // kcal per g) rather than against the meal's own `calories` field, so it always
  // sums to 100 by construction even if that field disagrees by a few kcal from
  // rounding. Bar B splits into food-group source, weighted by each meal's
  // calories (a garnish shouldn't count the same as the meal itself) — using
  // Claude's per-meal estimate when stored, falling back to a keyword
  // classification of the ingredient list (lib/foodGroups.ts) for meals saved
  // before that field existed. A day with meals but nothing classifiable gets a
  // flat "unclassified" segment instead of silently vanishing; a day with no
  // meals at all just renders empty, same as the calories bar beside it.
  const { kcalByDate, calData, totalMacro, mealDays, mealBarsData } = useMemo(() => {
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

    const mealsByDate = new Map<string, Meal[]>()
    for (const m of meals) {
      const arr = mealsByDate.get(m.date) ?? []
      arr.push(m)
      mealsByDate.set(m.date, arr)
    }

    const mealBarsData = spine.map((d) => {
      const dayMeals = mealsByDate.get(d) ?? []

      let pKcal = 0, fKcal = 0, cKcal = 0
      for (const m of dayMeals) {
        pKcal += (m.protein_g ?? 0) * 4
        fKcal += (m.fat_g ?? 0) * 9
        cKcal += (m.carbs_g ?? 0) * 4
      }
      const macroTotal = pKcal + fKcal + cKcal

      const fg = { vegan: 0, dairy_eggs: 0, meat_beef: 0, meat_chicken: 0, meat_fish: 0, meat_other: 0 }
      for (const m of dayMeals) {
        const breakdown: FoodGroupBreakdown = m.food_groups
          ? JSON.parse(m.food_groups)
          : classifyMeal(parseMealIngredients(m.ingredients))
        const weight = m.calories && m.calories > 0 ? m.calories : 1
        for (const k of FOOD_GROUP_KEYS) fg[k] += breakdown[k] * weight
      }
      const fgTotal = FOOD_GROUP_KEYS.reduce((s, k) => s + fg[k], 0)

      return {
        date: fmtDate(d),
        protein: macroTotal ? (pKcal / macroTotal) * 100 : 0,
        fat: macroTotal ? (fKcal / macroTotal) * 100 : 0,
        carbs: macroTotal ? (cKcal / macroTotal) * 100 : 0,
        macroUnclassified: !macroTotal && dayMeals.length ? 100 : 0,
        vegan: fgTotal ? (fg.vegan / fgTotal) * 100 : 0,
        dairy_eggs: fgTotal ? (fg.dairy_eggs / fgTotal) * 100 : 0,
        meat_beef: fgTotal ? (fg.meat_beef / fgTotal) * 100 : 0,
        meat_chicken: fgTotal ? (fg.meat_chicken / fgTotal) * 100 : 0,
        meat_fish: fgTotal ? (fg.meat_fish / fgTotal) * 100 : 0,
        meat_other: fgTotal ? (fg.meat_other / fgTotal) * 100 : 0,
        fgUnclassified: !fgTotal && dayMeals.length ? 100 : 0,
      }
    })

    return { kcalByDate, calData, totalMacro, mealDays, mealBarsData }
  }, [meals, spine])

  // How the range went against the calorie goal. Counted over days that actually
  // have meals logged, not the whole spine — a day with no entry is missing data,
  // not a day of zero calories, and counting it as "under goal" would flatter the
  // number exactly when the log is least complete.
  const goalSummary = useMemo(() => {
    if (goals.calories == null || kcalByDate.size === 0) return null
    const totals = [...kcalByDate.values()]
    const within = totals.filter((k) => k <= goals.calories!).length
    return `Dashed line: your ${goals.calories.toLocaleString()} kcal goal — ${within} of ${totals.length} logged day${totals.length > 1 ? 's' : ''} at or under it.`
  }, [goals.calories, kcalByDate])

  // Chips for the tap-to-log sheet: the standard items plus anything already logged.
  // Keyed by canonical name, so a stored spelling variant ("breathwork") folds into
  // the registry entry it matches instead of listing twice under the same label.
  // Supplements and hand-hidden names are excluded, same as in the Log tab's quick
  // entry — a supplement is not something to rate on a slider in either place.
  const logItems = useMemo(() => {
    const hidden = loadHiddenMetrics()
    const supplements = supplementMetricNames()
    const seen = new Map<string, string | null>()
    for (const d of QUICK_LOG_ITEMS) seen.set(d.key, null)
    for (const k of known) {
      const key = canonicalTrackName(k.name)
      if (!seen.has(key)) seen.set(key, k.category)
    }
    return [...seen.entries()]
      .filter(([name]) => !isSuppressedMetric(name, hidden, supplements))
      .map(([name, category]) => ({ name, category }))
  }, [known])

  const hasAny = wb.length || gut.length || inf.length || meals.length || tracks.length || acts.length

  // Which section labels actually have something under them, so a section with
  // every chart hidden (no data yet) doesn't leave a floating empty header.
  const hasWellbeingSection = wb.length > 0 || hasRelease || hasSleep || stressData.some((d) => d.stress != null)

  // A faint texture, not a photo: every card below is fully opaque (bg-ink-800 /
  // its parchment equivalent), so this only ever shows through the gaps between
  // them. The tint is a same-color wash over the image rather than a plain
  // opacity — an opacity-faded image still reads as "a photo," where a heavy
  // tint reads as texture and can't compete with chart legibility. Uses the
  // rgb()-with-slash form (not comma rgba()) per the project's colour-var
  // convention — see tailwind.config.js's withOpacity() comment.
  const bgTint = light ? 0.94 : 0.9

  // Every foldable/reorderable block on this page, built once here so the render
  // below is just "walk them in order". Gated exactly as each block always was
  // (hasWellbeingSection, hasIllness, a non-empty groupCharts entry, meals logged)
  // — a section with nothing in it still doesn't appear, unchanged from before this
  // existed. Fixed ids are namespaced (`section-…`) apart from category-chart ids
  // (`cat-…`) so a category literally named "Nutrition" can never collide with the
  // built-in Nutrition section.
  const sectionList: { id: string; title: string; icon: React.ReactNode; body: React.ReactNode }[] = []

  if (hasWellbeingSection) {
    sectionList.push({
      id: 'section-wellbeing-sleep',
      title: 'Wellbeing & sleep',
      icon: <GroupIcon group="wellbeing" />,
      body: (
        <>
          {(wb.length > 0 || hasRelease) && (
            <ChartCard title="Energy & mood">
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={moodData} margin={{ left: -20, right: hasRelease ? -20 : 8, top: 8 }}>
                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: 'var(--faint)', fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis yAxisId="l" domain={[0, 10]} tick={{ fill: 'var(--faint)', fontSize: 11 }} />
                  {hasRelease && (
                    <YAxis yAxisId="r" orientation="right" domain={[0, 100]} reversed tick={{ fill: colRelease, fontSize: 10 }} />
                  )}
                  <Tooltip contentStyle={tooltipStyle} formatter={roundTip} />
                  <Line isAnimationActive={false} yAxisId="l" type="monotone" dataKey="energy" stroke={colEnergy} strokeWidth={2} dot={false} connectNulls />
                  <Line isAnimationActive={false} yAxisId="l" type="monotone" dataKey="mood" stroke={colMood} strokeWidth={2} dot={false} connectNulls />
                  {hasRelease && (
                    <Line
                      isAnimationActive={false}
                      yAxisId="r"
                      type="monotone"
                      dataKey="release"
                      stroke={colRelease}
                      strokeWidth={2}
                      dot={releaseDot}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
              <Legend
                items={[
                  { color: colEnergy, label: 'Energy', key: 'energy' },
                  { color: colMood, label: 'Mood', key: 'mood' },
                  ...(hasRelease ? [{ color: colRelease, label: 'Release 💦 (0% top)', key: 'release' }] : []),
                ]}
                onPick={(key) => setSheet({ name: key, category: categoryOf(key) })}
              />
            </ChartCard>
          )}

          {hasSleep && (
            <ChartCard title="Sleep" hint="high is good — more sleep and better felt quality both sit at the top · tap a day to edit">
              <ResponsiveContainer width="100%" height={170}>
                <LineChart data={sleepData} margin={{ left: -20, right: -20, top: 8 }} onClick={openSleepAt} style={{ cursor: 'pointer' }}>
                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: 'var(--faint)', fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis yAxisId="l" domain={[0, 12]} tick={{ fill: 'var(--faint)', fontSize: 11 }} />
                  <YAxis yAxisId="r" orientation="right" domain={[0, 10]} tick={{ fill: colSleepQuality, fontSize: 10 }} />
                  <Tooltip contentStyle={tooltipStyle} formatter={roundTip} />
                  <Line isAnimationActive={false} yAxisId="l" type="monotone" dataKey="hours" name="Hours asleep" stroke={colSleepHours} strokeWidth={2} dot={{ r: 2 }} connectNulls={false} />
                  <Line isAnimationActive={false} yAxisId="r" type="monotone" dataKey="quality" name="Felt quality" stroke={colSleepQuality} strokeWidth={2} dot={{ r: 2 }} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
              <Legend
                items={[
                  { color: colSleepHours, label: 'Hours asleep' },
                  { color: colSleepQuality, label: 'Felt quality (0-10)' },
                ]}
              />
              {hasSleepTimes && (
                <>
                  {/* Same date axis and margins as the chart above, so a column here
                      is the same night as the column over it. Evening at the top,
                      morning at the bottom: the band reads as the night going down
                      the page, and a later bedtime visibly pushes it lower. */}
                  <div className="mb-1 mt-4 text-[10px] uppercase tracking-wide text-ink-500">Bedtime → wake</div>
                  <ResponsiveContainer width="100%" height={150}>
                    <ComposedChart data={sleepData} margin={{ left: -20, right: -20, top: 4 }} onClick={openSleepAt} style={{ cursor: 'pointer' }}>
                      <CartesianGrid stroke="var(--line)" vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: 'var(--faint)', fontSize: 11 }} interval="preserveStartEnd" />
                      <YAxis yAxisId="t" reversed domain={clockDomain} ticks={clockTicks} interval={0} tickFormatter={fmtClockOffset} tick={{ fill: 'var(--faint)', fontSize: 10 }} />
                      {/* Mirror axis, hidden: keeps the plot exactly as wide as the one above. */}
                      <YAxis yAxisId="r" orientation="right" domain={[0, 10]} tick={false} axisLine={false} />
                      <Tooltip contentStyle={tooltipStyle} formatter={clockTip} />
                      <Area isAnimationActive={false} yAxisId="t" type="monotone" dataKey="night" name="Night" stroke="none" fill={colSleepHours} fillOpacity={0.18} connectNulls={false} legendType="none" tooltipType="none" />
                      <Line isAnimationActive={false} yAxisId="t" type="monotone" dataKey="bed" name="Bedtime" stroke={colSleepBed} strokeWidth={2} dot={{ r: 2 }} connectNulls={false} />
                      <Line isAnimationActive={false} yAxisId="t" type="monotone" dataKey="wake" name="Woke" stroke={colSleepWake} strokeWidth={2} dot={{ r: 2 }} connectNulls={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                  <Legend
                    items={[
                      { color: colSleepBed, label: 'Bedtime' },
                      { color: colSleepWake, label: 'Woke' },
                    ]}
                  />
                </>
              )}
              <button type="button" className="mt-3 text-xs text-brand-400 underline" onClick={() => setSleepSheet({})}>
                Edit sleep…
              </button>
            </ChartCard>
          )}

          {stressData.some((d) => d.stress != null) && (
            <ChartCard title="Stress load" hint="low is good — high stress sits at the bottom">
              <ResponsiveContainer width="100%" height={150}>
                <LineChart data={stressData} margin={{ left: -20, right: 8, top: 8 }}>
                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: 'var(--faint)', fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis domain={[0, 10]} reversed tick={{ fill: 'var(--faint)', fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} formatter={roundTip} />
                  <Line isAnimationActive={false} type="monotone" dataKey="stress" stroke={colStress} strokeWidth={2} dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
              <button
                className="mt-1 text-xs text-ink-400 hover:text-cream"
                onClick={() => setSheet({ name: 'stress', category: null })}
              >
                + Log stress
              </button>
            </ChartCard>
          )}
        </>
      ),
    })
  }

  // The three fixed counters (Gut episodes / Infections / Warming bottle) that used
  // to sit above this chart are gone — removed outright, not relocated, per his
  // explicit call. The chart itself is untouched.
  if (hasIllness) {
    sectionList.push({
      id: 'section-illness-gut',
      title: 'Illness & gut',
      icon: <GroupIcon group="symptom" />,
      body: (
        <ChartCard title="Illness & gut" hint="low is good; infection level carries forward until you log it gone">
          <ResponsiveContainer width="100%" height={170}>
            <LineChart data={illnessData} margin={{ left: -20, right: 8, top: 8 }}>
              <CartesianGrid stroke="var(--line)" vertical={false} />
              {eventMarkers.map((m) => (
                <ReferenceLine key={m.id} x={m.x} stroke="var(--accent)" strokeDasharray="2 2" label={{ value: m.label, fontSize: 9, fill: 'var(--faint)', angle: -90, position: 'insideTopRight' }} />
              ))}
              <XAxis dataKey="date" tick={{ fill: 'var(--faint)', fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis domain={[0, 10]} reversed tick={{ fill: 'var(--faint)', fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} formatter={roundTip} />
              <ReferenceLine y={4} stroke="var(--accent)" strokeDasharray="4 3" strokeOpacity={0.6} />
              <Line isAnimationActive={false} type="monotone" dataKey="infection" name="Infection" stroke={illnessPalette.Infection} strokeWidth={2} dot={false} connectNulls />
              <Line isAnimationActive={false} type="monotone" dataKey="gutPain" name="Gut pain" stroke={illnessPalette['Gut pain']} strokeWidth={2} dot={{ r: 2 }} connectNulls={false} />
              <Line isAnimationActive={false} type="monotone" dataKey="stool" name="Stool (Bristol)" stroke={illnessPalette.Stool} strokeWidth={2} dot={{ r: 2 }} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
          <Legend
            items={[
              { color: illnessPalette.Infection, label: 'Infection', key: 'infection' },
              // "Gut pain" has no dedicated track — it routes to the existing
              // "stomach pain" metric (see the illnessData comment above).
              { color: illnessPalette['Gut pain'], label: 'Gut pain', key: 'stomach pain' },
              { color: illnessPalette.Stool, label: 'Stool (Bristol, 4 ideal)', key: 'stool' },
            ]}
            onPick={(key) => setSheet({ name: key, category: categoryOf(key) })}
          />
        </ChartCard>
      ),
    })
  }

  // One entry per category, in the order this render's groupCharts already
  // resolved — see that memo for how each bucket (duration/rating/cards) is built
  // independently from what's actually logged in the category, so more than one can
  // render together under the same heading. A renamed or newly-created category
  // shows up here automatically.
  for (const gc of groupCharts) {
    if (!gc.charts.length) continue
    sectionList.push({
      id: `cat-${gc.key}`,
      title: gc.label,
      icon: <GroupIcon group={gc.key} icon={gc.icon} size={12} />,
      body: (
        <>
          {gc.charts.map((c) => {
            const move = (key: string) => setCombining({ name: key, from: gc.key, chart: c.id })
            if (c.kind === 'duration' && c.duration) {
              return (
                <ChartCard key={c.id} title={c.title} hint="tap a day, or a name below, to log it">
                  <PlateauChart
                    dates={spine}
                    series={c.duration}
                    unit={c.durationUnit}
                    onPickDay={(d) => setSheet({ name: c.duration![0].key, category: categoryOf(c.duration![0].key), date: d })}
                    onPickSeries={(key) => setSheet({ name: key, category: categoryOf(key) })}
                    onCombineSeries={move}
                  />
                </ChartCard>
              )
            }
            if (c.kind === 'rating' && c.rating) {
              const r = c.rating
              return (
                <ChartCard key={c.id} title={c.title} hint={r.reversed ? 'low is good — worse sits at the bottom' : undefined}>
                  <ResponsiveContainer width="100%" height={170}>
                    <LineChart data={r.rows} margin={{ left: -20, right: 8, top: 8 }}>
                      <CartesianGrid stroke="var(--line)" vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: 'var(--faint)', fontSize: 11 }} interval="preserveStartEnd" />
                      <YAxis domain={[0, 10]} reversed={r.reversed} tick={{ fill: 'var(--faint)', fontSize: 11 }} />
                      <Tooltip contentStyle={tooltipStyle} formatter={roundTip} />
                      {r.keys.map((k) => (
                        <Line isAnimationActive={false} key={k} type="monotone" dataKey={k} name={labelForTrack(k)}
                          stroke={r.palette[k]} strokeWidth={2} dot={{ r: 2 }} connectNulls />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                  <SeriesLegend
                    items={r.keys.map((k) => ({ key: k, color: r.palette[k] }))}
                    onPick={(k) => setSheet({ name: k, category: categoryOf(k) })}
                    onMove={move}
                  />
                </ChartCard>
              )
            }
            if (c.kind === 'mixed' && c.mixed) {
              return (
                <MixedChart
                  key={c.id}
                  title={c.title}
                  data={c.mixed}
                  onPickDay={(d) => setSheet({ name: c.members[0], category: categoryOf(c.members[0]), date: d })}
                  onPick={(k) => setSheet({ name: k, category: categoryOf(k) })}
                  onMove={move}
                />
              )
            }
            if (c.card) {
              return (
                <TrackCard
                  key={c.id}
                  group={c.card}
                  spine={spine}
                  onLog={() => setSheet({ name: c.card!.name, category: null })}
                  onMove={() => move(c.card!.name)}
                />
              )
            }
            return null
          })}
        </>
      ),
    })
  }

  if (kcalByDate.size > 0) {
    sectionList.push({
      id: 'section-nutrition',
      title: 'Nutrition',
      icon: <IconMeal width={14} height={14} />,
      body: (
        <>
          <ChartCard title="Daily calories">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={calData} margin={{ left: -20, right: 8, top: 8 }}>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: 'var(--faint)', fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fill: 'var(--faint)', fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} formatter={roundTip} />
                <Bar isAnimationActive={false} dataKey="kcal" fill="var(--accent-deep)" radius={[4, 4, 0, 0]} />
                {/* extendDomain, so a goal set above the tallest bar still shows —
                    Recharts otherwise clips a reference line outside the auto Y
                    domain. No text label: at phone width it lands on top of the
                    bars; the caption under the chart names the goal instead. */}
                {goals.calories != null && (
                  <ReferenceLine y={goals.calories} ifOverflow="extendDomain" stroke="var(--accent)" strokeDasharray="4 3" />
                )}
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-2 grid grid-cols-4 gap-2 text-center text-xs text-ink-300">
              <Avg label="Protein" v={totalMacro.p / mealDays} goal={goals.protein_g} />
              <Avg label="Fat" v={totalMacro.f / mealDays} />
              <Avg label="Carbs" v={totalMacro.c / mealDays} />
              <Avg label="Fiber" v={totalMacro.fb / mealDays} />
            </div>
            {goalSummary && <p className="mt-2 text-xs text-ink-400">{goalSummary}</p>}
          </ChartCard>

          <ChartCard title="Macros & food groups" hint="two 100% bars per day, side by side">
            <ResponsiveContainer width="100%" height={170}>
              {/* Left margin -8, not the -20 every other chart here uses: this is
                  the one chart with a 4-character axis label ("100%"), and -20
                  left it clipped/overlapping under the hover cursor. tickFormatter
                  instead of the `unit` prop for the same reason — sidesteps
                  whatever Recharts does internally to append a unit string. */}
              <BarChart data={mealBarsData} margin={{ left: -8, right: 8, top: 8 }}>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: 'var(--faint)', fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis domain={[0, 100]} tick={{ fill: 'var(--faint)', fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                <Tooltip content={<MealBarsTooltip />} cursor={{ fill: 'var(--faint)', fillOpacity: 0.08 }} />
                <Bar isAnimationActive={false} stackId="macro" dataKey="protein" fill={MACRO_COLORS.protein} />
                <Bar isAnimationActive={false} stackId="macro" dataKey="fat" fill={MACRO_COLORS.fat} />
                <Bar isAnimationActive={false} stackId="macro" dataKey="carbs" fill={MACRO_COLORS.carbs} />
                <Bar isAnimationActive={false} stackId="macro" dataKey="macroUnclassified" fill={FOOD_GROUP_COLORS.unclassified} />
                <Bar isAnimationActive={false} stackId="food" dataKey="vegan" fill={FOOD_GROUP_COLORS.vegan} />
                <Bar isAnimationActive={false} stackId="food" dataKey="dairy_eggs" fill={FOOD_GROUP_COLORS.dairy_eggs} />
                <Bar isAnimationActive={false} stackId="food" dataKey="meat_beef" fill={FOOD_GROUP_COLORS.meat_beef} />
                <Bar isAnimationActive={false} stackId="food" dataKey="meat_chicken" fill={FOOD_GROUP_COLORS.meat_chicken} />
                <Bar isAnimationActive={false} stackId="food" dataKey="meat_fish" fill={FOOD_GROUP_COLORS.meat_fish} />
                <Bar isAnimationActive={false} stackId="food" dataKey="meat_other" fill={FOOD_GROUP_COLORS.meat_other} radius={[3, 3, 0, 0]} />
                <Bar isAnimationActive={false} stackId="food" dataKey="fgUnclassified" fill={FOOD_GROUP_COLORS.unclassified} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <Legend
              items={[
                { color: MACRO_COLORS.protein, label: 'Protein' },
                { color: MACRO_COLORS.fat, label: 'Fat' },
                { color: MACRO_COLORS.carbs, label: 'Carbs' },
              ]}
            />
            <Legend
              items={[
                { color: FOOD_GROUP_COLORS.vegan, label: 'Vegan' },
                { color: FOOD_GROUP_COLORS.dairy_eggs, label: 'Dairy & eggs' },
                { color: FOOD_GROUP_COLORS.meat_beef, label: 'Beef' },
                { color: FOOD_GROUP_COLORS.meat_chicken, label: 'Chicken' },
                { color: FOOD_GROUP_COLORS.meat_fish, label: 'Fish' },
                { color: FOOD_GROUP_COLORS.meat_other, label: 'Other meat' },
              ]}
            />
          </ChartCard>
        </>
      ),
    })
  }

  const orderedSectionIds = orderIds(sectionList.map((sec) => sec.id), sectionsLayout)
  const sectionsById = new Map(sectionList.map((sec) => [sec.id, sec]))

  async function toggleSection(id: string) {
    setSectionsLayout(await setSectionCollapsed(id, !sectionsLayout.collapsed.includes(id)))
  }
  async function moveSectionBy(id: string, delta: -1 | 1) {
    setSectionsLayout(await moveSection(id, delta, sectionList.map((sec) => sec.id)))
  }

  return (
    <div
      className="space-y-4"
      style={{
        backgroundImage: `linear-gradient(rgb(var(--bg-rgb) / ${bgTint}), rgb(var(--bg-rgb) / ${bgTint})), url(${heroResources})`,
        backgroundSize: 'cover',
        backgroundPosition: 'top center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <div className="flex gap-2">
        {RANGES.map((r) => (
          <button key={r.days} onClick={() => setDays(r.days)} className={days === r.days ? 'chip-on' : 'chip'}>
            {r.label}
          </button>
        ))}
      </div>

      {/* Tap any item to log it for a day with a slider. Big square-ish tiles,
          not cramped chips — few taps, forgiving targets while unwell. Collapsed
          by default so it doesn't push every chart below the fold. */}
      <div className="card">
        <button
          className="flex w-full items-center justify-between"
          aria-expanded={tapOpen}
          onClick={() => setTapOpen((o) => !o)}
        >
          <span className="label !mb-0">Tap to log</span>
          <span className="text-ink-400">{tapOpen ? '▾' : '▸'}</span>
        </button>
        {tapOpen && (
          <div className="mt-2 grid grid-cols-4 gap-2">
            {logItems.map((it) => (
              <button
                key={it.name}
                className="flex min-h-[58px] flex-col items-center justify-center gap-1.5 rounded-2xl bg-ink-900/60 px-1 py-2.5 text-center hover:bg-ink-700"
                onClick={() => setSheet({ name: it.name, category: it.category ?? categoryOf(it.name) })}
              >
                <MetricIcon name={it.name} category={it.category} color={colorForTrack(it.name)} size={20} />
                <span className="text-[11px] leading-tight text-ink-300">{labelForTrack(it.name)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {!hasAny && (
        <div className="card text-center text-sm text-ink-400">
          No data yet. Add a log entry or a meal and your trends will appear here.
        </div>
      )}

      {orderedSectionIds.map((id, i) => {
        const sec = sectionsById.get(id)
        if (!sec) return null
        const isCollapsed = sectionsLayout.collapsed.includes(id)
        return (
          <div key={id}>
            <SectionLabel
              title={sec.title}
              icon={sec.icon}
              collapsed={isCollapsed}
              onToggle={() => void toggleSection(id)}
              onMoveUp={i > 0 ? () => void moveSectionBy(id, -1) : undefined}
              onMoveDown={i < orderedSectionIds.length - 1 ? () => void moveSectionBy(id, 1) : undefined}
            />
            {!isCollapsed && sec.body}
          </div>
        )
      })}

      {sleepSheet && (
        <SleepSheet
          dates={spine}
          initialDate={sleepSheet.date}
          onClose={() => setSleepSheet(null)}
          onChanged={() => setRefresh((k) => k + 1)}
        />
      )}

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

      {combining && (
        <MoveMetricSheet
          metric={combining.name}
          currentGroup={combining.from}
          groups={allGroups()}
          membersByGroup={Object.fromEntries(Object.entries(chartsByGroup).map(([k, cs]) => [k, cs.flatMap((c) => c.members)]))}
          charts={chartsByGroup}
          currentChart={combining.chart}
          onMove={() => {}}
          onMoveToChart={(group, chart) => void moveMetricToChart(combining.name, group, chart)}
          onClose={() => setCombining(null)}
        />
      )}
    </div>
  )
}

function parseMealIngredients(json: string | null): Ingredient[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
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
  spine,
  onLog,
  onMove,
}: {
  group: { name: string; unit: string; count: number; series: { date: string; rawDate: string; value: number }[] }
  spine: string[]
  onLog: () => void
  onMove?: () => void
}) {
  const title = labelForTrack(group.name) + (group.unit ? ` (${group.unit})` : '')
  const reversed = isLowerBetter(group.name)
  if (group.series.length >= 2) {
    const vals = group.series.map((s) => s.value)
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const pad = (max - min || Math.max(1, Math.abs(max) * 0.05)) * 0.5
    const domain: [number, number] = [Math.floor(min - pad), Math.ceil(max + pad)]
    // Aligned to the shared spine (like every other chart in this tab) rather than
    // just the days this track was actually logged, so it stacks into the same
    // vertical columns as everything else for the same date.
    const byDate = new Map(group.series.map((s) => [s.rawDate, s.value]))
    const data = spine.map((d) => ({ date: fmtDate(d), value: byDate.get(d) ?? null }))
    return (
      <ChartCard title={title}>
        <ResponsiveContainer width="100%" height={150}>
          <LineChart data={data} margin={{ left: -20, right: 8, top: 8 }}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: 'var(--faint)', fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis domain={domain} reversed={reversed} tick={{ fill: 'var(--faint)', fontSize: 11 }} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} formatter={roundTip} />
            <Line isAnimationActive={false} type="monotone" dataKey="value" stroke={colorForTrack(group.name)} strokeWidth={2} dot={{ r: 2 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
        <div className="mt-1 flex items-center gap-3">
          <button className="text-xs text-ink-400 hover:text-cream" onClick={onLog}>
            + Log {labelForTrack(group.name)}
          </button>
          {onMove && (
            <button className="text-xs text-ink-500 hover:text-cream" title="Move to another graph" onClick={onMove}>
              ⇄ Combine
            </button>
          )}
        </div>
      </ChartCard>
    )
  }
  const latest = group.series.at(-1)
  return (
    <div className="card flex w-full items-center justify-between !py-3">
      <button className="flex-1 text-left" onClick={onLog}>
        <div className="text-sm text-cream">{title}</div>
        <div className="text-xs text-ink-300">
          {latest ? `latest ${latest.value}` : `${group.count}×`}
          {group.count > 1 && latest ? ` · ${group.count}×` : ''}
        </div>
      </button>
      {onMove && (
        <button className="pl-2 text-ink-500 hover:text-cream" title="Move to another graph" onClick={onMove}>
          ⇄
        </button>
      )}
    </div>
  )
}

const tooltipStyle = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, color: 'var(--text)' }

// Segment rollups (a day logged morning *and* evening averages the two) and
// computed values arrive as long floats — nothing wants "6.666666666666667" in a
// tooltip. One decimal is past the precision any of these metrics actually has.
const roundTip = (v: number | string): number | string => (typeof v === 'number' ? Math.round(v * 10) / 10 : v)

// Bed and wake times on one continuous axis: hours since 12:00 noon, so a night
// that crosses midnight (23:30 → 07:00) stays one unbroken span instead of jumping
// from 23 to 7. 23:30 → 11.5, 01:00 → 13, 07:00 → 19.
function clockOffset(t: string | null | undefined): number | null {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return (((h - 12 + 24) % 24) * 60 + m) / 60
}

function fmtClockOffset(v: number): string {
  const total = Math.round(v * 60)
  const h = (Math.floor(total / 60) + 12) % 24
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

const clockTip = (v: number | string | (number | string)[]): string | number => (typeof v === 'number' ? fmtClockOffset(v) : Array.isArray(v) ? '' : v)

const MEAL_BAR_LABELS: Record<string, string> = {
  protein: 'Protein',
  fat: 'Fat',
  carbs: 'Carbs',
  macroUnclassified: 'Unclassified',
  vegan: 'Vegan',
  dairy_eggs: 'Dairy & eggs',
  meat_beef: 'Beef',
  meat_chicken: 'Chicken',
  meat_fish: 'Fish',
  meat_other: 'Other meat',
  fgUnclassified: 'Unclassified',
}
const MACRO_STACK_KEYS = new Set(['protein', 'fat', 'carbs', 'macroUnclassified'])

type TipItem = { dataKey?: string | number; value?: number | string; color?: string }

// The stacked meal bars carry eleven series, most of them zero on any given day,
// and the percentages are computed to full float precision. Recharts' default
// tooltip renders every one of them at full length — on a phone that covers the
// whole chart. This one rounds to a tenth of a percent, uses real names instead of
// dataKeys, drops slices that round to nothing, and keeps the two stacks apart.
function MealBarsTooltip({ active, payload, label }: { active?: boolean; payload?: TipItem[]; label?: string }) {
  if (!active || !payload?.length) return null
  const rows = payload
    .map((p) => ({
      key: String(p.dataKey ?? ''),
      value: typeof p.value === 'number' ? p.value : 0,
      color: p.color,
    }))
    .filter((r) => r.value >= 0.05)
  if (!rows.length) return null

  const section = (title: string, items: typeof rows) =>
    items.length > 0 && (
      <div className="mt-1.5 first:mt-0">
        <div className="text-[10px] uppercase tracking-wide text-ink-400">{title}</div>
        {items.map((r) => (
          <div key={r.key} className="flex items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.color }} />
            <span className="text-ink-300">{MEAL_BAR_LABELS[r.key] ?? r.key}</span>
            <span className="ml-auto tabular-nums text-cream">{r.value.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    )

  return (
    <div style={tooltipStyle} className="min-w-[9rem] px-3 py-2 text-xs">
      <div className="mb-1 font-semibold text-cream">{label}</div>
      {section('Macros', rows.filter((r) => MACRO_STACK_KEYS.has(r.key)))}
      {section('Food groups', rows.filter((r) => !MACRO_STACK_KEYS.has(r.key)))}
    </div>
  )
}

// Groups the flat run of ChartCards into a deliberate reading order (Wellbeing &
// sleep → Illness & gut → Movement & practice → Pain → Nutrition → Other) instead
// of one undifferentiated stack. Callers only render this when the section has at
// least one visible chart under it, so a header is never left floating over nothing.
// Every Insights section's heading: click the title to fold/unfold, small ▲▼ to
// move it up or down the whole page — same visual language as the pen/+ pair on
// every Log-tab category heading (QuickEntryPanel), so "tap the heading to arrange
// things" reads as one consistent idea across both screens rather than two.
function SectionLabel({
  title,
  icon,
  collapsed,
  onToggle,
  onMoveUp,
  onMoveDown,
}: {
  title: string
  icon?: React.ReactNode
  collapsed?: boolean
  onToggle?: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
}) {
  return (
    <div className="flex items-center gap-1 pt-1">
      <button
        type="button"
        aria-expanded={!collapsed}
        onClick={onToggle}
        className="flex flex-1 items-center gap-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-widest text-ink-500 hover:text-ink-300"
      >
        {icon}
        <span>{title}</span>
        <span className="ml-auto text-ink-500">{collapsed ? '▸' : '▾'}</span>
      </button>
      {onMoveUp && (
        <button
          type="button"
          aria-label={`Move ${title} up`}
          onClick={onMoveUp}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-ink-700 text-[10px] text-ink-400 hover:text-cream"
        >
          ▲
        </button>
      )}
      {onMoveDown && (
        <button
          type="button"
          aria-label={`Move ${title} down`}
          onClick={onMoveDown}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-ink-700 text-[10px] text-ink-400 hover:text-cream"
        >
          ▼
        </button>
      )}
    </div>
  )
}

function ChartCard({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <div className="label mb-0.5">{title}</div>
      {hint && <div className="mb-2 text-[10px] text-ink-500">{hint}</div>}
      {children}
    </div>
  )
}

function Avg({ label, v, goal }: { label: string; v: number; goal?: number | null }) {
  return (
    <div>
      <div className="font-semibold text-cream">{Math.round(v)}g</div>
      <div className="text-ink-400">{label}/day</div>
      {goal != null && <div className="text-ink-400">of {Math.round(goal)}g</div>}
    </div>
  )
}

// `key` is the metric name to open in the tap-to-log sheet; entries without one (or
// when `onPick` isn't given) render as a plain swatch, not a button.
function Legend({
  items,
  onPick,
}: {
  items: { color: string; label: string; key?: string }[]
  onPick?: (key: string) => void
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-300">
      {items.map((it) =>
        onPick && it.key ? (
          <button key={it.label} className="flex items-center gap-1.5 hover:text-cream" onClick={() => onPick(it.key!)}>
            <MetricIcon name={it.key} color={it.color} size={14} /> {it.label}
          </button>
        ) : (
          <span key={it.label} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: it.color }} /> {it.label}
          </span>
        ),
      )}
    </div>
  )
}

// ---- Category charts (G-13) ----

interface MixedAxis {
  id: string
  label: string
  orientation: 'left' | 'right'
  side: string // 'left' / 'right' / 'far left' / 'far right', for the legend
  domain: [number | 'auto', number | 'auto']
  reversed?: boolean
  factor?: number // minutes → shown unit, duration axes only
}

interface MixedData {
  rows: Record<string, number | string | null>[]
  series: { key: string; label: string; color: string; axis: string; shape: 'bar' | 'line' | 'dot' }[]
  axes: MixedAxis[]
}

interface CategoryChart {
  id: string
  title: string
  members: string[]
  kind: 'duration' | 'rating' | 'card' | 'mixed'
  duration?: PlateauSeries[]
  durationUnit?: 'min' | 'h'
  rating?: { keys: string[]; rows: ReturnType<typeof buildRows>; palette: Record<string, string>; reversed: boolean }
  card?: { name: string; unit: string; count: number; series: { date: string; rawDate: string; value: number }[] }
  mixed?: MixedData
}

interface GroupCharts {
  key: string
  label: string
  icon?: string
  charts: CategoryChart[]
}

// Legend for a chart: tap a name to log it, ⇄ to move it to another chart.
function SeriesLegend({
  items,
  onPick,
  onMove,
}: {
  items: { key: string; color: string; note?: string }[]
  onPick: (key: string) => void
  onMove: (key: string) => void
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-300">
      {items.map((it) => (
        <span key={it.key} className="flex items-center gap-1">
          <button className="flex items-center gap-1.5 hover:text-cream" onClick={() => onPick(it.key)}>
            <MetricIcon name={it.key} color={it.color} size={14} />
            {labelForTrack(it.key)}
            {it.note && <span className="text-ink-500">{it.note}</span>}
          </button>
          <button className="text-ink-500 hover:text-cream" title={`Move ${labelForTrack(it.key)} to another graph`} onClick={() => onMove(it.key)}>
            ⇄
          </button>
        </span>
      ))}
    </div>
  )
}

// A chart holding more than one kind of scale — minutes next to a 0-10 rating, say.
// One Y axis per scale (first left, second right, any further ones beside those);
// minutes draw as bars so they don't read as another 0-10 line, ratings and other
// numbers as lines, yes/no as dots. Each legend entry says which axis it's read
// against, since colour alone can't.
function MixedChart({
  title,
  data,
  onPickDay,
  onPick,
  onMove,
}: {
  title: string
  data: MixedData
  onPickDay: (date: string) => void
  onPick: (key: string) => void
  onMove: (key: string) => void
}) {
  const left = data.axes.filter((a) => a.orientation === 'left').length
  const right = data.axes.filter((a) => a.orientation === 'right').length
  return (
    <ChartCard title={title} hint="tap a day, or a name below, to log it · each scale has its own axis">
      <ResponsiveContainer width="100%" height={180}>
        <ComposedChart
          data={data.rows}
          margin={{ left: -20 + (left - 1) * 4, right: right ? -20 + (right - 1) * 4 : 8, top: 8 }}
          onClick={(st: { activeTooltipIndex?: number } | null) => {
            const i = st?.activeTooltipIndex
            const d = i != null ? data.rows[i]?.rawDate : null
            if (typeof d === 'string') onPickDay(d)
          }}
          style={{ cursor: 'pointer' }}
        >
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: 'var(--faint)', fontSize: 11 }} interval="preserveStartEnd" />
          {data.axes.map((a) => {
            const color = data.series.find((s) => s.axis === a.id)?.color ?? 'var(--faint)'
            return (
              <YAxis
                key={a.id}
                yAxisId={a.id}
                orientation={a.orientation}
                domain={a.domain}
                reversed={a.reversed}
                allowDecimals={a.id !== 'bool'}
                ticks={a.id === 'bool' ? [0, 1] : undefined}
                tickFormatter={a.id === 'bool' ? (v: number) => (v ? 'yes' : 'no') : undefined}
                tick={{ fill: data.axes.length > 1 ? color : 'var(--faint)', fontSize: 10 }}
              />
            )
          })}
          <Tooltip contentStyle={tooltipStyle} formatter={roundTip} />
          {data.series.map((s) =>
            s.shape === 'bar' ? (
              <Bar isAnimationActive={false} key={s.key} yAxisId={s.axis} dataKey={s.key} name={s.label} fill={s.color} radius={[3, 3, 0, 0]} maxBarSize={10} />
            ) : (
              <Line
                isAnimationActive={false}
                key={s.key}
                yAxisId={s.axis}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.shape === 'dot' ? 'none' : s.color}
                strokeWidth={2}
                dot={{ r: s.shape === 'dot' ? 3.5 : 2, fill: s.color, stroke: s.color }}
                connectNulls
              />
            ),
          )}
        </ComposedChart>
      </ResponsiveContainer>
      <SeriesLegend
        items={data.series.map((s) => {
          const a = data.axes.find((x) => x.id === s.axis)
          return { key: s.key, color: s.color, note: a ? `(${a.label}${data.axes.length > 1 ? `, ${a.side}` : ''})` : undefined }
        })}
        onPick={onPick}
        onMove={onMove}
      />
    </ChartCard>
  )
}
