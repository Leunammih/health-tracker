// Which exact chart a metric is drawn on inside its category (G-13).
//
// A category used to make its charts purely from shape: every duration in one
// plateau chart, every 0-10 rating in one line chart, everything else a small card
// of its own — so moving a metric could only ever pick the CATEGORY, and the unit
// decided the rest. Now a metric can be put on any chart in its category, including
// one with a different scale; that chart then draws one axis per scale.
//
// Stored in the DB's meta table (synced, like the category assignments in
// lib/groups.ts) as { metric: { group, chart } }. An assignment only counts while
// the metric is still in that group: moving it to another category from the Log
// tab silently returns it to that category's default chart rather than pointing at
// a chart id that means something else there.

import { getMeta, setMeta } from '../db/queries'
import { isLowerBetter, kindForTrack, labelForTrack, scaleForTrack } from './metrics'

const KEY = 'chart_assignments'

type Assignments = Record<string, { group: string; chart: string }>

function load(): Assignments {
  const raw = getMeta(KEY)
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Assignments) : {}
  } catch {
    return {}
  }
}

// Chart ids within a category. 'dur' and 'rating' are the two shared default
// charts; `card:<metric>` is the chart a metric gets on its own, which others can
// then be put on too.
export const DUR_CHART = 'dur'
export const RATING_CHART = 'rating'
export const ownChart = (metric: string) => `card:${metric}`

// ---- The fixed charts (G-15) ----
// Energy & mood, Stress load and Illness & gut predate categories. They are now
// ordinary charts that live in two fixed "hosts" — the Wellbeing & sleep and
// Illness & gut sections — and their items can be moved like any other. Each
// item's special behaviour travels with it (see the series built in InsightsTab):
// infection carries forward, stool marks 4 as ideal, release keeps its reversed
// 0-100% axis.
export const FX_WELLBEING = 'fx-wellbeing'
export const FX_ILLNESS = 'fx-illness'
export const FIXED_HOSTS: { key: string; label: string }[] = [
  { key: FX_WELLBEING, label: 'Wellbeing & sleep' },
  { key: FX_ILLNESS, label: 'Illness & gut' },
]
export const isFixedHost = (key: string) => key === FX_WELLBEING || key === FX_ILLNESS

// Illness & gut's "Gut pain" is a mirror of the Stomach pain metric, which also
// appears in its own category — a separate key so the mirror can be moved (or
// left) without touching Stomach pain itself.
export const GUT_PAIN_MIRROR = '~gutpain'

// Where each of those items lives until he moves it, and the names its original
// charts keep while they still hold any of their original items.
export const FIXED_DEFAULTS: Record<string, { group: string; chart: string }> = {
  energy: { group: FX_WELLBEING, chart: 'energy-mood' },
  mood: { group: FX_WELLBEING, chart: 'energy-mood' },
  release: { group: FX_WELLBEING, chart: 'energy-mood' },
  stress: { group: FX_WELLBEING, chart: 'stress' },
  infection: { group: FX_ILLNESS, chart: 'illness' },
  [GUT_PAIN_MIRROR]: { group: FX_ILLNESS, chart: 'illness' },
  stool: { group: FX_ILLNESS, chart: 'illness' },
}
export const FIXED_CHART_TITLES: Record<string, string> = {
  'energy-mood': 'Energy & mood',
  stress: 'Stress load',
  illness: 'Illness & gut',
}
export const isFixedItem = (metric: string) => metric in FIXED_DEFAULTS

export function chartMemberLabel(metric: string): string {
  return metric === GUT_PAIN_MIRROR ? 'Gut pain' : labelForTrack(metric)
}

// Which way is good, for deciding whether a shared 0-10 axis is drawn upside down.
// Stool is neither: 4 is ideal and both ends are bad, so it doesn't vote.
export function directionOf(metric: string): 'low' | 'high' | 'neutral' {
  if (metric === 'stool') return 'neutral'
  if (metric === GUT_PAIN_MIRROR) return 'low'
  return isLowerBetter(metric) ? 'low' : 'high'
}

// The scale family a metric's values live on — two metrics with the same one can
// share an axis. Anything else only shares with its own unit;
// a unitless number is assumed to share with nothing.
export type AxisKind = string
export function axisKindFor(metric: string): AxisKind {
  // Bristol 1-7 has always been drawn on the shared 0-10 axis (with its ideal-4
  // line); the gut-pain mirror is a 0-10 pain score.
  if (metric === 'stool' || metric === GUT_PAIN_MIRROR) return 'rating'
  if (kindForTrack(metric) === 'bool') return 'bool'
  const unit = scaleForTrack(metric, null).unit
  if (unit === 'min') return 'duration'
  if (unit === '/10') return 'rating'
  // Percentages used to share the 0-10 chart, which drew 60% off the top of it.
  if (unit === '%') return 'percent'
  return unit ? `unit:${unit}` : `metric:${metric}`
}

export function defaultChartFor(metric: string): string {
  const k = axisKindFor(metric)
  if (k === 'duration') return DUR_CHART
  if (k === 'rating') return RATING_CHART
  return ownChart(metric)
}

// Where an item is drawn: {host, chart}. A host is a category key or one of the
// fixed hosts. `category` is the item's own category (null for the fixed items,
// which have none on the Insights side). A category item's choice counts while it
// stays in that category, or when it points at a fixed chart; a fixed item's
// counts wherever it points, as long as that host still exists.
export function placementFor(
  metric: string,
  category: string | null,
  hostExists: (key: string) => boolean,
): { group: string; chart: string } {
  const def = defaultPlacement(metric, category)
  const a = load()[metric]
  if (!a || !hostExists(a.group)) return def
  if (isFixedItem(metric) || isFixedHost(a.group) || a.group === category) return a
  return def
}

export function defaultPlacement(metric: string, category: string | null): { group: string; chart: string } {
  return FIXED_DEFAULTS[metric] ?? { group: category ?? 'other', chart: defaultChartFor(metric) }
}

// Writing the item's default place clears the entry, so "put it back where it
// would have gone anyway" leaves no stored override behind.
export async function assignMetricToChart(metric: string, group: string, chart: string, isDefault: boolean): Promise<void> {
  const next = load()
  if (isDefault) delete next[metric]
  else next[metric] = { group, chart }
  await setMeta(KEY, Object.keys(next).length ? JSON.stringify(next) : null)
}

export async function clearChartAssignment(metric: string): Promise<void> {
  const next = load()
  if (!(metric in next)) return
  delete next[metric]
  await setMeta(KEY, Object.keys(next).length ? JSON.stringify(next) : null)
}

// ---- Does this combination make sense? ----

export interface Verdict {
  level: 'same' | 'axis' | 'warn'
  text: string           // short badge
  detail?: string        // the warning itself, shown before "Move anyway"
  note?: string          // worth knowing, not a reason to stop
}

const MAX_SERIES = 6

// What putting `metric` on a chart that already holds `members` would look like.
export function combineVerdict(metric: string, members: string[]): Verdict {
  const all = [...new Set([...members, metric])]
  const kinds = new Set(all.map(axisKindFor))
  const n = kinds.size
  const problems: string[] = []
  if (kinds.has('bool') && n > 1) {
    problems.push('A yes/no item has no scale to line up with the others — it would only show as 0 or 1 on an axis of its own.')
  }
  if (n >= 3) problems.push(`This chart would need ${n} different axes, which gets hard to read on a phone.`)
  if (all.length > MAX_SERIES) problems.push(`That makes ${all.length} lines on one chart — crowded enough that individual days get hard to pick out.`)

  // Same 0-10 axis, opposite meaning: pain (low is good) next to clarity (high is
  // good) is drawn right way up, so one of them reads upside down.
  const ratings = all.filter((m) => axisKindFor(m) === 'rating')
  const mixedDirection = ratings.some((m) => directionOf(m) === 'low') && ratings.some((m) => directionOf(m) === 'high')
  const note = mixedDirection
    ? 'Some of these are "low is good" and some "high is good" — they share one 0-10 axis drawn the normal way up.'
    : undefined

  if (problems.length) return { level: 'warn', text: n >= 3 ? `${n} axes` : 'doesn’t fit well', detail: problems.join(' '), note }
  if (n === 2) return { level: 'axis', text: 'adds a 2nd axis', note }
  return { level: 'same', text: 'same scale', note }
}
