import { useCallback, useMemo, useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
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
import { allGroups } from '../lib/groups'
import { loadInsightsLayout, orderIds, setSectionCollapsed, moveSection, type InsightsLayout } from '../lib/insightsLayout'
import { loadHiddenMetrics, supplementMetricNames, isSuppressedMetric } from '../lib/hiddenMetrics'
import { useTheme } from '../lib/theme'
import PlateauChart, { type PlateauSeries } from '../components/PlateauChart'
import QuickLogSheet from '../components/QuickLogSheet'
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

  // Reference-line markers for the "started X" events above, keyed on the same
  // formatted date string the categorical XAxis uses — Recharts positions a
  // ReferenceLine by matching x against an axis tick, so this must be identical to
  // what each chart's dataKey="date" renders for that day.
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

    return allGroups().map((g) => {
      const names = [...(byGroup.get(g.key) ?? [])].sort()
      // Workouts (the `activities` table) always fold into the canonical 'movement'
      // key specifically, whatever it has been renamed to display as — they are not
      // part of the customisable-metric system, so they cannot be reassigned to a
      // different group the way a track can.
      const isMovement = g.key === 'movement'

      if (!names.length && !(isMovement && acts.length)) {
        return { key: g.key, label: g.label, icon: g.icon, shape: 'empty' as const }
      }

      const allMinutes = names.length > 0 && names.every((n) => scaleForTrack(n, null).unit === 'min')
      if (isMovement || allMinutes) {
        const byName = new Map<string, Map<string, number>>()
        const add = (key: string, date: string, mins: number | null) => {
          if (!key || mins == null) return
          const m = byName.get(key) ?? new Map<string, number>()
          m.set(date, (m.get(date) ?? 0) + mins)
          byName.set(key, m)
        }
        if (isMovement) {
          for (const a of acts) add(defForName(a.type ?? '')?.key ?? (a.type ?? '').trim().toLowerCase(), a.date, a.duration_min)
        }
        for (const t of tracks) if (names.includes(t.name)) add(t.name, t.date, t.value)
        const keys = [...byName.keys()]
        if (!keys.length) return { key: g.key, label: g.label, icon: g.icon, shape: 'empty' as const }
        // Spread this chart's own series evenly across the group's hue arc —
        // guaranteed-distinct within this chart, not just a per-name hash.
        const palette = chartPalette(keys, paletteGroup(g.key), light)
        const plateau: PlateauSeries[] = keys.map((key) => ({
          key,
          label: labelForTrack(key),
          color: palette[key],
          values: spine.map((d) => byName.get(key)!.get(d) ?? null),
        }))
        return { key: g.key, label: g.label, icon: g.icon, shape: 'duration' as const, plateau }
      }

      const allRating = names.every((n) => {
        const u = scaleForTrack(n, null).unit
        return u === '/10' || u === '%'
      })
      if (allRating) {
        const rows = buildRows(spine, tracks, names)
        const palette = chartPalette(names, paletteGroup(g.key), light)
        // Reversed only when EVERY member is lowerIsBetter — a mixed group draws
        // right-way-up rather than picking a direction that misrepresents half of it.
        const reversed = names.every((n) => isLowerBetter(n))
        return { key: g.key, label: g.label, icon: g.icon, shape: 'rating' as const, keys: names, rows, palette, reversed }
      }

      // Mixed shape: one small card per metric — the same treatment the old
      // catch-all "Other" section always gave a leftover metric.
      const cards = names.map((name) => {
        const rowsForName = tracks.filter((t) => t.name === name && t.value != null)
        const scale = scaleForTrack(name, rowsForName.find((r) => r.category)?.category ?? null)
        return {
          name,
          unit: displayScale(scale).unit,
          count: rowsForName.length,
          series: rowsForName.map((r) => ({ date: fmtDate(r.date), rawDate: r.date, value: toDisplay(r.value as number, scale) })),
        }
      })
      return { key: g.key, label: g.label, icon: g.icon, shape: 'mixed' as const, cards }
    })
  }, [tracks, acts, spine, light, DEDICATED])

  // --- sleep: duration (computed from bedtime/wake, never stored) + felt quality,
  // both spine-aligned. High is good for both, so neither axis is reversed.
  const sleepByDate = new Map(wb.map((w) => [w.date, w]))
  const sleepData = spine.map((d) => {
    const w = sleepByDate.get(d)
    const mins = w?.sleep_start && w?.sleep_end ? sleepDurationMin(w.sleep_start, w.sleep_end) : null
    return {
      date: fmtDate(d),
      hours: mins != null ? Math.round((mins / 60) * 10) / 10 : null,
      quality: w?.sleep_quality ?? null,
    }
  })
  const hasSleep = sleepData.some((r) => r.hours != null || r.quality != null)
  const colSleepHours = colorForTrack('sleep hours')
  const colSleepQuality = colorForTrack('sleep quality')

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
                  {eventMarkers.map((m) => (
                    <ReferenceLine key={m.id} x={m.x} yAxisId="l" stroke="var(--accent)" strokeDasharray="2 2" label={{ value: m.label, fontSize: 9, fill: 'var(--faint)', angle: -90, position: 'insideTopRight' }} />
                  ))}
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
            <ChartCard title="Sleep" hint="high is good — more sleep and better felt quality both sit at the top">
              <ResponsiveContainer width="100%" height={170}>
                <LineChart data={sleepData} margin={{ left: -20, right: -20, top: 8 }}>
                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: 'var(--faint)', fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis yAxisId="l" domain={[0, 12]} tick={{ fill: 'var(--faint)', fontSize: 11 }} />
                  <YAxis yAxisId="r" orientation="right" domain={[0, 10]} tick={{ fill: colSleepQuality, fontSize: 10 }} />
                  <Tooltip contentStyle={tooltipStyle} formatter={roundTip} />
                  <Line isAnimationActive={false} yAxisId="l" type="monotone" dataKey="hours" stroke={colSleepHours} strokeWidth={2} dot={{ r: 2 }} connectNulls={false} />
                  <Line isAnimationActive={false} yAxisId="r" type="monotone" dataKey="quality" stroke={colSleepQuality} strokeWidth={2} dot={{ r: 2 }} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
              <Legend
                items={[
                  { color: colSleepHours, label: 'Hours asleep' },
                  { color: colSleepQuality, label: 'Felt quality (0-10)' },
                ]}
              />
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
  // resolved — see that memo for how the chart shape (duration/rating/mixed) is
  // chosen from what's actually logged in the category. A renamed or newly-created
  // category shows up here automatically.
  for (const gc of groupCharts) {
    if (gc.shape === 'empty') continue
    sectionList.push({
      id: `cat-${gc.key}`,
      title: gc.label,
      icon: <GroupIcon group={gc.key} icon={gc.icon} size={12} />,
      body: (
        <>
          {gc.shape === 'duration' && (
            <ChartCard title={`${gc.label} (min)`} hint="tap a day, or a name below, to log it">
              <PlateauChart
                dates={spine}
                series={gc.plateau}
                onPickDay={(d) => setSheet({ name: gc.plateau[0].key, category: categoryOf(gc.plateau[0].key), date: d })}
                onPickSeries={(key) => setSheet({ name: key, category: categoryOf(key) })}
              />
            </ChartCard>
          )}

          {gc.shape === 'rating' && (
            <ChartCard
              title={`${gc.label} (0-10)`}
              hint={gc.reversed ? 'low is good — worse sits at the bottom' : undefined}
            >
              <ResponsiveContainer width="100%" height={170}>
                <LineChart data={gc.rows} margin={{ left: -20, right: 8, top: 8 }}>
                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  {eventMarkers.map((m) => (
                    <ReferenceLine key={m.id} x={m.x} stroke="var(--accent)" strokeDasharray="2 2" label={{ value: m.label, fontSize: 9, fill: 'var(--faint)', angle: -90, position: 'insideTopRight' }} />
                  ))}
                  <XAxis dataKey="date" tick={{ fill: 'var(--faint)', fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis domain={[0, 10]} reversed={gc.reversed} tick={{ fill: 'var(--faint)', fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} formatter={roundTip} />
                  {gc.keys.map((k) => (
                    <Line isAnimationActive={false}
                      key={k}
                      type="monotone"
                      dataKey={k}
                      name={labelForTrack(k)}
                      stroke={gc.palette[k]}
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-300">
                {gc.keys.map((k) => (
                  <button key={k} className="flex items-center gap-1.5 hover:text-cream" onClick={() => setSheet({ name: k, category: categoryOf(k) })}>
                    <MetricIcon name={k} color={gc.palette[k]} size={14} />
                    {labelForTrack(k)}
                  </button>
                ))}
              </div>
            </ChartCard>
          )}

          {gc.shape === 'mixed' && gc.cards.map((c) => (
            <TrackCard key={c.name} group={c} spine={spine} onLog={() => setSheet({ name: c.name, category: null })} />
          ))}
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
}: {
  group: { name: string; unit: string; count: number; series: { date: string; rawDate: string; value: number }[] }
  spine: string[]
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
        <button className="mt-1 text-xs text-ink-400 hover:text-cream" onClick={onLog}>
          + Log {labelForTrack(group.name)}
        </button>
      </ChartCard>
    )
  }
  const latest = group.series.at(-1)
  return (
    <button className="card flex w-full items-center justify-between !py-3 text-left" onClick={onLog}>
      <div className="text-sm text-cream">{title}</div>
      <div className="text-xs text-ink-300">
        {latest ? `latest ${latest.value}` : `${group.count}×`}
        {group.count > 1 && latest ? ` · ${group.count}×` : ''}
      </div>
    </button>
  )
}

const tooltipStyle = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, color: 'var(--text)' }

// Segment rollups (a day logged morning *and* evening averages the two) and
// computed values arrive as long floats — nothing wants "6.666666666666667" in a
// tooltip. One decimal is past the precision any of these metrics actually has.
const roundTip = (v: number | string): number | string => (typeof v === 'number' ? Math.round(v * 10) / 10 : v)

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
