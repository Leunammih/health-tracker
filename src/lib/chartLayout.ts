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
import { isLowerBetter, kindForTrack, scaleForTrack } from './metrics'

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

// The scale family a metric's values live on — two metrics with the same one can
// share an axis. Ratings and percentages share the 0-10 rating chart today, so
// they count as one family here too. Anything else only shares with its own unit;
// a unitless number is assumed to share with nothing.
export type AxisKind = string
export function axisKindFor(metric: string): AxisKind {
  if (kindForTrack(metric) === 'bool') return 'bool'
  const unit = scaleForTrack(metric, null).unit
  if (unit === 'min') return 'duration'
  if (unit === '/10' || unit === '%') return 'rating'
  return unit ? `unit:${unit}` : `metric:${metric}`
}

export function defaultChartFor(metric: string): string {
  const k = axisKindFor(metric)
  if (k === 'duration') return DUR_CHART
  if (k === 'rating') return RATING_CHART
  return ownChart(metric)
}

export function chartFor(metric: string, group: string): string {
  const a = load()[metric]
  return a && a.group === group ? a.chart : defaultChartFor(metric)
}

// Writing the metric's own default chart clears the entry, so "put it back where it
// would have gone anyway" leaves no stored override behind.
export async function assignMetricToChart(metric: string, group: string, chart: string): Promise<void> {
  const next = load()
  if (chart === defaultChartFor(metric)) delete next[metric]
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
  const mixedDirection = ratings.some((m) => isLowerBetter(m)) && ratings.some((m) => !isLowerBetter(m))
  const note = mixedDirection
    ? 'Some of these are "low is good" and some "high is good" — they share one 0-10 axis drawn the normal way up.'
    : undefined

  if (problems.length) return { level: 'warn', text: n >= 3 ? `${n} axes` : 'doesn’t fit well', detail: problems.join(' '), note }
  if (n === 2) return { level: 'axis', text: 'adds a 2nd axis', note }
  return { level: 'same', text: 'same scale', note }
}
