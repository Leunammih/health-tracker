// The model behind the Log tab's review step: what Claude extracted, laid next to
// what the day already holds, in a shape the user can correct before anything is
// written.
//
// Why this exists: the extraction used to go straight from "preview" to the
// database. Two failure modes fell out of that in real use — Claude filling in an
// energy and a mood that were never said, and the write then landing on top of
// values already entered by hand on the sliders. Neither is recoverable once
// saved. So every number gets an editor, every item gets an include toggle, and
// anything that would land on an existing value is flagged with that value and a
// one-tap way to keep it.
//
// Pure data + no React, so the applying half can be reasoned about (and reused)
// without the screen.

import { readMetric } from './metricStore'
import { canonicalTrackName, labelForTrack, scaleForTrack } from './metrics'
import type { DiaryExtraction } from '../types'

export interface ReviewField {
  key: string // unique within its item, e.g. 'energy'
  label: string
  value: number
  unit: string
  min: number
  max: number
  step: number
  // What this date already holds for the same thing, or null if nothing does.
  // Null also for fields with no day-level equivalent (a workout's duration is a
  // new row, not an overwrite), which is why "no conflict" and "no such metric"
  // deliberately look the same here — neither needs the user's attention.
  saved: number | null
}

export interface ReviewItem {
  id: string // 'wellbeing.0'
  section: string // 'Energy / Mood'
  date: string
  // The non-numeric part of the record, rendered as plain text.
  text: string
  include: boolean
  fields: ReviewField[]
}

const RATING = { unit: '/10', min: 0, max: 10, step: 1 }

function join(parts: (string | number | false | null | undefined)[]): string {
  return parts.filter(Boolean).map(String).join(' · ')
}

// The saved day value for a metric, or null when this field has no day-level metric.
function savedFor(date: string, metric: string | null): number | null {
  if (!metric) return null
  return readMetric(date, metric).value
}

export function buildReview(data: DiaryExtraction, entryDate: string): ReviewItem[] {
  const items: ReviewItem[] = []

  data.activities?.forEach((a, i) => {
    const date = a.date ?? entryDate
    const fields: ReviewField[] = []
    if (a.duration_min != null) {
      fields.push({
        key: 'duration_min', label: 'Duration', value: a.duration_min,
        unit: 'min', min: 0, max: 300, step: 5,
        // An activity is always a new row, never an overwrite of a day value.
        saved: null,
      })
    }
    items.push({
      id: `activities.${i}`, section: 'Activity', date, include: true, fields,
      text: join([
        a.type, a.intensity, a.symptoms && `→ ${a.symptoms}`,
        a.recovery_time && `recovery ${a.recovery_time}`,
        a.gentle_movement_effect && a.gentle_movement_effect !== 'unknown' && `gentle: ${a.gentle_movement_effect}`,
        a.notes,
      ]) || 'Activity',
    })
  })

  data.gut_events?.forEach((g, i) => {
    const date = g.date ?? entryDate
    const fields: ReviewField[] = []
    // Gut pain and stool have day-level twins the Insights charts already merge
    // with these rows (see illnessData in InsightsTab), so a conflict is real.
    if (g.pain != null) fields.push({ key: 'pain', label: 'Gut pain', value: g.pain, ...RATING, saved: savedFor(date, 'stomach pain') })
    if (g.bloating != null) fields.push({ key: 'bloating', label: 'Bloating', value: g.bloating, ...RATING, saved: null })
    if (g.stool_consistency != null) {
      const s = scaleForTrack('stool', null)
      fields.push({ key: 'stool_consistency', label: 'Stool (Bristol)', value: g.stool_consistency, unit: s.unit, min: s.min, max: s.max, step: s.step, saved: savedFor(date, 'stool') })
    }
    items.push({
      id: `gut_events.${i}`, section: 'Gut episode', date, include: true, fields,
      text: join([
        g.warming_bottle_needed && 'warming bottle',
        g.preceded_by?.length && `before: ${g.preceded_by.join(', ')}`,
        g.notes,
      ]) || 'Gut episode',
    })
  })

  data.infections?.forEach((inf, i) => {
    items.push({
      id: `infections.${i}`, section: 'Infection', date: inf.date ?? entryDate, include: true, fields: [],
      text: join([inf.kind, inf.severity, inf.preceded_by?.length && `before: ${inf.preceded_by.join(', ')}`, inf.notes]) || 'Infection',
    })
  })

  data.wellbeing?.forEach((w, i) => {
    const date = w.date ?? entryDate
    const fields: ReviewField[] = []
    if (w.energy != null) fields.push({ key: 'energy', label: 'Energy', value: w.energy, ...RATING, saved: savedFor(date, 'energy') })
    if (w.mood != null) fields.push({ key: 'mood', label: 'Mood', value: w.mood, ...RATING, saved: savedFor(date, 'mood') })
    items.push({
      id: `wellbeing.${i}`, section: 'Energy / Mood', date, include: true, fields,
      text: w.notes ?? '',
    })
  })

  data.day_context?.forEach((d, i) => {
    const date = d.date ?? entryDate
    const fields: ReviewField[] = []
    if (d.stress_load != null) fields.push({ key: 'stress_load', label: 'Stress', value: d.stress_load, ...RATING, saved: savedFor(date, 'stress') })
    items.push({
      id: `day_context.${i}`, section: 'Day context', date, include: true, fields,
      text: join([d.work, d.travel, d.retreat, d.relaxation, d.tasks, d.notes]),
    })
  })

  data.tracks?.forEach((t, i) => {
    const date = t.date ?? entryDate
    const name = t.name ? canonicalTrackName(t.name) : ''
    const fields: ReviewField[] = []
    if (t.value != null && name) {
      const s = scaleForTrack(name, t.category ?? null)
      fields.push({
        key: 'value', label: labelForTrack(name), value: t.value,
        unit: s.unit, min: s.min, max: s.max, step: s.step,
        // A recurrence or an explicit date list writes many days, so there is no
        // single "the saved value" to compare against — flag nothing rather than
        // flag the wrong day.
        saved: t.recurrence || t.dates?.length ? null : savedFor(date, name),
      })
    }
    items.push({
      id: `tracks.${i}`, section: 'Tracked', date, include: true, fields,
      text: join([
        name ? labelForTrack(name) : 'Unnamed',
        t.recurrence && `${t.recurrence.start_date} → ${t.recurrence.end_date}${t.recurrence.weekdays?.length ? ` (${t.recurrence.weekdays.join(', ')})` : ''}`,
        t.dates?.length && `${t.dates.length} dates`,
        t.time && `at ${t.time}`,
        t.notes,
      ]),
    })
  })

  return items
}

// How many included fields would land on top of a different value already stored
// for that day. Drives the warning banner above the list.
export function conflictCount(items: ReviewItem[]): number {
  return items
    .filter((it) => it.include)
    .reduce((n, it) => n + it.fields.filter((f) => f.saved != null && f.saved !== f.value).length, 0)
}

// Rebuild the extraction from the reviewed state: excluded items are dropped
// entirely, edited numbers replace what Claude returned. `follow_up_questions` and
// `summary` pass through untouched — nothing writes them.
export function applyReview(data: DiaryExtraction, items: ReviewItem[]): DiaryExtraction {
  const byId = new Map(items.map((it) => [it.id, it]))

  function take<T extends object>(section: string, rows: T[] | undefined): T[] {
    return (rows ?? []).flatMap((row, i) => {
      const it = byId.get(`${section}.${i}`)
      if (it && !it.include) return []
      if (!it) return [row]
      const patch: Record<string, number> = {}
      for (const f of it.fields) patch[f.key] = f.value
      return [{ ...row, ...patch }]
    })
  }

  return {
    ...data,
    activities: take('activities', data.activities),
    gut_events: take('gut_events', data.gut_events),
    infections: take('infections', data.infections),
    wellbeing: take('wellbeing', data.wellbeing),
    day_context: take('day_context', data.day_context),
    tracks: take('tracks', data.tracks),
  }
}
