import { getDb, persist } from './sqlite'
import { uid } from '../lib/id'
import { nowISO, todayISO, daysAgoISO, expandDateRange, weekdayNums } from '../lib/dates'
import { canonicalTrackName, categoryForDef, defForName, rollupFor, scaleForTrack, storeForName } from '../lib/metrics'
import type {
  DiaryExtraction,
  Entry,
  Interpretation,
  Meal,
  MealAnalysis,
  Activity,
  GutEvent,
  Infection,
  Wellbeing,
  DayContext,
  Track,
  Segment,
  SegmentValue,
  HealthEvent,
} from '../types'

// Run a SELECT and return an array of plain objects.
export function all<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
  const db = getDb()
  const stmt = db.prepare(sql)
  stmt.bind(params as never)
  const rows: T[] = []
  while (stmt.step()) rows.push(stmt.getAsObject() as T)
  stmt.free()
  return rows
}

function exec(sql: string, params: unknown[]): void {
  getDb().run(sql, params as never)
}

function b(v: boolean | undefined): number | null {
  return v === undefined ? null : v ? 1 : 0
}
function tags(v: string[] | undefined): string | null {
  return v && v.length ? v.join(',') : null
}

// ---- Diary: persist a confirmed extraction as one entry + its category rows ----

export async function saveDiaryExtraction(
  rawText: string,
  source: 'voice' | 'text',
  data: DiaryExtraction,
  entryDate: string = todayISO(),
): Promise<string> {
  const entryId = uid()
  const created = nowISO()
  exec('INSERT INTO entries(id, created_at, entry_date, raw_text, source, processed) VALUES (?,?,?,?,?,1)', [
    entryId,
    created,
    entryDate,
    rawText,
    source,
  ])

  for (const a of data.activities ?? []) {
    exec(
      `INSERT INTO activities(id, entry_id, date, type, duration_min, intensity, felt_during,
        symptom_onset, symptoms, recovery_time, gentle_movement_effect, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        uid(), entryId, a.date ?? entryDate, a.type ?? null, a.duration_min ?? null,
        a.intensity ?? null, a.felt_during ?? null, a.symptom_onset ?? null, a.symptoms ?? null,
        a.recovery_time ?? null, a.gentle_movement_effect ?? null, a.notes ?? null,
      ],
    )
  }
  for (const g of data.gut_events ?? []) {
    exec(
      `INSERT INTO gut_events(id, entry_id, date, pain, bloating, preceded_by, stool_consistency,
        warming_bottle_needed, notes) VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        uid(), entryId, g.date ?? entryDate, g.pain ?? null, g.bloating ?? null,
        tags(g.preceded_by), g.stool_consistency ?? null, b(g.warming_bottle_needed), g.notes ?? null,
      ],
    )
  }
  for (const inf of data.infections ?? []) {
    exec(
      `INSERT INTO infections(id, entry_id, date, kind, severity, preceded_by, notes)
       VALUES (?,?,?,?,?,?,?)`,
      [uid(), entryId, inf.date ?? entryDate, inf.kind ?? null, inf.severity ?? null, tags(inf.preceded_by), inf.notes ?? null],
    )
  }
  for (const w of data.wellbeing ?? []) {
    // One row per day. Merge rather than replace: the extraction omits (rather than
    // nulls) anything the user didn't mention, so a diary entry that talks about mood
    // must not wipe an energy value a quick entry already saved for that day.
    const date = w.date ?? entryDate
    const prev = wellbeingOn(date)
    exec('DELETE FROM wellbeing WHERE date = ?', [date])
    exec(
      `INSERT INTO wellbeing(id, entry_id, date, energy, mood, notes, energy_notes, mood_notes)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        uid(), entryId, date,
        w.energy ?? prev?.energy ?? null,
        w.mood ?? prev?.mood ?? null,
        w.notes ?? prev?.notes ?? null,
        prev?.energy_notes ?? null,
        prev?.mood_notes ?? null,
      ],
    )
  }
  for (const d of data.day_context ?? []) {
    // Merge, for the same reason the wellbeing block above merges: the extraction
    // omits (rather than nulls) anything the user didn't mention, so an entry that
    // only talks about travel must not wipe a stress_load or tasks already recorded
    // for that day — by an earlier entry or by a manual quick entry.
    const date = d.date ?? entryDate
    const prev = dayContextOn(date)
    exec('DELETE FROM day_context WHERE date = ?', [date])
    exec(
      `INSERT INTO day_context(id, entry_id, date, tasks, travel, work, retreat, relaxation, stress_load, notes, stress_notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        uid(), entryId, date,
        d.tasks ?? prev?.tasks ?? null,
        d.travel ?? prev?.travel ?? null,
        d.work ?? prev?.work ?? null,
        d.retreat ?? prev?.retreat ?? null,
        d.relaxation ?? prev?.relaxation ?? null,
        d.stress_load ?? prev?.stress_load ?? null,
        d.notes ?? prev?.notes ?? null,
        prev?.stress_notes ?? null,
      ],
    )
  }
  for (const t of data.tracks ?? []) {
    if (!t.name) continue
    // A track may cover a single day, an explicit list of dates, or a recurrence
    // over a span (optionally limited to certain weekdays) — expand to dated rows.
    let dates: string[]
    if (t.dates?.length) {
      dates = t.dates
    } else if (t.recurrence?.start_date && t.recurrence?.end_date) {
      dates = expandDateRange(t.recurrence.start_date, t.recurrence.end_date, weekdayNums(t.recurrence.weekdays))
    } else {
      dates = [t.date ?? entryDate]
    }
    const name = canonicalTrackName(t.name)
    for (const date of dates) {
      // Replace, don't stack. Tracks are "one value per item per day" everywhere else
      // (see upsertTrackValue), and a bare INSERT here meant a quick-logged value plus
      // a diary mention of the same thing left two rows for one (date, name) — which
      // the practice/movement charts then silently summed while the single-row readers
      // returned whichever one came back first.
      exec('DELETE FROM tracks WHERE date = ? AND name = ?', [date, name])
      exec(
        `INSERT INTO tracks(id, entry_id, date, name, category, value, unit, time, notes)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [uid(), entryId, date, name, t.category ?? null, t.value ?? null, t.unit ?? null, t.time ?? null, t.notes ?? null],
      )
    }
  }

  await persist()
  return entryId
}

// Delete an entry and every category row it produced. Wellbeing/day_context
// rows are only removed if they still belong to this entry (a later entry for
// the same date would have replaced them, in which case they're left alone).
export async function deleteEntry(entryId: string): Promise<void> {
  await deleteEntryRows(entryId)
  exec('DELETE FROM entries WHERE id = ?', [entryId])
  await persist()
}

// Delete just the derived category rows for an entry (keeps the entries row).
// Used when re-analyzing an edited entry so it can be re-populated under the same id.
//
// A wellbeing/day_context/tracks row this deletes may be the same row a later
// segment write updated in place (writeWellbeingRollup etc. never change
// entry_id), so deleting it here can orphan segments that are still live — their
// rollup would just vanish. Capture which (date, metric) pairs are at risk before
// deleting, then re-materialise any that still have segments afterward.
export async function deleteEntryRows(entryId: string): Promise<void> {
  const wbDates = all<{ date: string }>('SELECT date FROM wellbeing WHERE entry_id = ?', [entryId]).map((r) => r.date)
  const dcDates = all<{ date: string }>('SELECT date FROM day_context WHERE entry_id = ?', [entryId]).map((r) => r.date)
  const trackRows = all<{ date: string; name: string }>('SELECT date, name FROM tracks WHERE entry_id = ?', [entryId])

  exec('DELETE FROM activities WHERE entry_id = ?', [entryId])
  exec('DELETE FROM gut_events WHERE entry_id = ?', [entryId])
  exec('DELETE FROM infections WHERE entry_id = ?', [entryId])
  exec('DELETE FROM wellbeing WHERE entry_id = ?', [entryId])
  exec('DELETE FROM day_context WHERE entry_id = ?', [entryId])
  exec('DELETE FROM tracks WHERE entry_id = ?', [entryId])

  for (const date of wbDates) {
    for (const key of ['energy', 'mood']) if (segmentsOn(date, key).length) await recomputeRollup(date, key)
  }
  for (const date of dcDates) {
    if (segmentsOn(date, 'stress').length) await recomputeRollup(date, 'stress')
  }
  for (const { date, name } of trackRows) {
    if (segmentsOn(date, name).length) await recomputeRollup(date, name)
  }
}

// ---- Meals ----

export async function saveMeal(
  a: MealAnalysis,
  date: string,
  time: string | null,
  photoPath: string | null,
  source: string,
  notes: string | null,
): Promise<string> {
  const id = uid()
  exec(
    `INSERT INTO meals(id, date, time, name, calories, protein_g, fat_g, carbs_g, fiber_g,
      ingredients, photo_path, confidence, confirmed, source, notes, meal_type, food_groups) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?)`,
    [
      id, date, time, a.name, a.calories, a.protein_g, a.fat_g, a.carbs_g, a.fiber_g,
      JSON.stringify(a.ingredients ?? []), photoPath, a.confidence, source, notes, a.meal_type ?? null,
      a.food_groups ? JSON.stringify(a.food_groups) : null,
    ],
  )
  await persist()
  return id
}

export async function updateMeal(
  id: string,
  a: MealAnalysis,
  date: string,
  time: string | null,
  photoPath: string | null,
  source: string,
  notes: string | null,
): Promise<void> {
  exec(
    `UPDATE meals SET date=?, time=?, name=?, calories=?, protein_g=?, fat_g=?, carbs_g=?, fiber_g=?,
      ingredients=?, photo_path=?, confidence=?, source=?, notes=?, meal_type=?, food_groups=? WHERE id=?`,
    [
      date, time, a.name, a.calories, a.protein_g, a.fat_g, a.carbs_g, a.fiber_g,
      JSON.stringify(a.ingredients ?? []), photoPath, a.confidence, source, notes, a.meal_type ?? null,
      a.food_groups ? JSON.stringify(a.food_groups) : null, id,
    ],
  )
  await persist()
}

export async function deleteMeal(id: string): Promise<void> {
  exec('DELETE FROM meals WHERE id = ?', [id])
  await persist()
}

// ---- Interpretations ----

export async function saveInterpretation(i: Omit<Interpretation, 'id'>): Promise<void> {
  exec(
    `INSERT INTO interpretations(id, created_at, period_covered, patterns, correlations, model, source_entry_ids)
     VALUES (?,?,?,?,?,?,?)`,
    [uid(), i.created_at, i.period_covered, i.patterns, i.correlations, i.model, i.source_entry_ids],
  )
  await persist()
}

// ---- Reads ----

export const recentEntries = (limit = 30) =>
  all<Entry>('SELECT * FROM entries ORDER BY created_at DESC LIMIT ?', [limit])

export interface EntryDetail {
  activities: Activity[]
  gut_events: GutEvent[]
  infections: Infection[]
  wellbeing: Wellbeing[]
  day_context: DayContext[]
  tracks: Track[]
}
// All derived rows produced by one entry (for the view/edit panel).
export function entryDetail(entryId: string): EntryDetail {
  return {
    activities: all<Activity>('SELECT * FROM activities WHERE entry_id = ? ORDER BY date', [entryId]),
    gut_events: all<GutEvent>('SELECT * FROM gut_events WHERE entry_id = ? ORDER BY date', [entryId]),
    infections: all<Infection>('SELECT * FROM infections WHERE entry_id = ? ORDER BY date', [entryId]),
    wellbeing: all<Wellbeing>('SELECT * FROM wellbeing WHERE entry_id = ? ORDER BY date', [entryId]),
    day_context: all<DayContext>('SELECT * FROM day_context WHERE entry_id = ? ORDER BY date', [entryId]),
    tracks: all<Track>('SELECT * FROM tracks WHERE entry_id = ? ORDER BY date', [entryId]),
  }
}
export const recentMeals = (limit = 30) =>
  all<Meal>('SELECT * FROM meals ORDER BY date DESC, time DESC LIMIT ?', [limit])
export const recentInterpretations = (limit = 20) =>
  all<Interpretation>('SELECT * FROM interpretations ORDER BY created_at DESC LIMIT ?', [limit])

export const activitiesSince = (dateISO: string) =>
  all<Activity>('SELECT * FROM activities WHERE date >= ? ORDER BY date', [dateISO])
export const gutSince = (dateISO: string) =>
  all<GutEvent>('SELECT * FROM gut_events WHERE date >= ? ORDER BY date', [dateISO])
export const infectionsSince = (dateISO: string) =>
  all<Infection>('SELECT * FROM infections WHERE date >= ? ORDER BY date', [dateISO])
export const wellbeingSince = (dateISO: string) =>
  all<Wellbeing>('SELECT * FROM wellbeing WHERE date >= ? ORDER BY date', [dateISO])
export const dayContextSince = (dateISO: string) =>
  all<DayContext>('SELECT * FROM day_context WHERE date >= ? ORDER BY date', [dateISO])
export const mealsSince = (dateISO: string) =>
  all<Meal>('SELECT * FROM meals WHERE date >= ? ORDER BY date', [dateISO])
export const tracksSince = (dateISO: string) =>
  all<Track>('SELECT * FROM tracks WHERE date >= ? ORDER BY date', [dateISO])
// Distinct track names logged since a date. Drives the Log tab's quick-entry panel:
// "everything I've been tracking lately", ready to fill in. Ordered by name, NOT by
// count — a count-based order reshuffles the panel every time a row is saved (an
// upsert changes COUNT(*)), which reads as sliders swapping places under your thumb.
export const trackNamesSince = (dateISO: string) =>
  all<{ name: string; category: string | null }>(
    `SELECT name, MAX(category) as category FROM tracks
     WHERE date >= ? GROUP BY name ORDER BY name`,
    [dateISO],
  )

// ---- Quick logging (sliders on Insights + the Log tab) ----

// Every track name ever logged, with its category — powers the tap-to-log picker
// so previously used items (including ad-hoc ones) stay one tap away.
export const allTrackNames = () =>
  all<{ name: string; category: string | null; n: number }>(
    'SELECT name, category, COUNT(*) as n FROM tracks GROUP BY name, category ORDER BY n DESC',
  )

// The actual write, shared by the public upsert below and by segment rollups
// (lib/metricStore.ts's segment layer calls this directly, skipping the public
// upsert's clearSegments — segments own the cell, they don't clear themselves).
// Quick-logging is "one value per item per day", so this replaces any existing row
// for that name+date rather than stacking duplicates the charts would then have to
// reconcile. A null value clears the day.
//
// `notes` is deliberately tri-state: omit it to KEEP whatever note is already on the
// row, pass null to clear it, pass a string to set it. Callers that only touch the
// value (the Insights tap-to-log sheet, the bulk apply-to-last-N-days helpers) must
// omit it, or the DELETE+INSERT below would silently drop the note.
async function writeTrackRollup(
  date: string,
  key: string,
  category: string | null,
  value: number | null,
  unit: string | null,
  notes?: string | null,
): Promise<void> {
  const keptNotes =
    notes === undefined
      ? all<{ notes: string | null }>(
          'SELECT notes FROM tracks WHERE date = ? AND name = ? LIMIT 1',
          [date, key],
        )[0]?.notes ?? null
      : notes
  exec('DELETE FROM tracks WHERE date = ? AND name = ?', [date, key])
  if (value != null) {
    exec(
      `INSERT INTO tracks(id, entry_id, date, name, category, value, unit, time, notes)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [uid(), null, date, key, category, value, unit, null, keptNotes],
    )
  }
  await persist()
}

// Set one value for one item on one day directly — i.e. an explicit "whole day"
// statement, which overrides and clears any morning/afternoon/evening segments
// already on record for it (see clearSegments below).
export async function upsertTrackValue(
  date: string,
  name: string,
  category: string | null,
  value: number | null,
  unit: string | null,
  notes?: string | null,
): Promise<void> {
  const key = canonicalTrackName(name)
  clearSegments(date, key)
  await writeTrackRollup(date, key, category, value, unit, notes)
}

// The value of `name` on `date`, or null if that day has no entry for it.
export function trackValueOn(date: string, name: string): number | null {
  const r = all<{ value: number | null }>(
    'SELECT value FROM tracks WHERE date = ? AND name = ? LIMIT 1',
    [date, name.trim().toLowerCase()],
  )
  return r[0]?.value ?? null
}

// Value + note in one read, for prefilling a quick-entry row.
export function trackRowOn(date: string, name: string): { value: number | null; notes: string | null } | null {
  const r = all<{ value: number | null; notes: string | null }>(
    'SELECT value, notes FROM tracks WHERE date = ? AND name = ? LIMIT 1',
    [date, name.trim().toLowerCase()],
  )
  return r[0] ?? null
}

// The most recent value at or before `date` — used both for infection carry-forward
// and to default a quick-log slider to the previous day's value.
export function lastTrackValueOnOrBefore(date: string, name: string): number | null {
  const r = all<{ value: number | null }>(
    'SELECT value FROM tracks WHERE date <= ? AND name = ? AND value IS NOT NULL ORDER BY date DESC LIMIT 1',
    [date, name.trim().toLowerCase()],
  )
  return r[0]?.value ?? null
}

// ---- Wellbeing (energy / mood) ----
// Energy and mood live in their own table rather than `tracks`, one row per day
// holding both. Quick entries therefore have to write a single COLUMN without
// disturbing its sibling — hence UPDATE in place rather than the DELETE+INSERT
// used elsewhere.

export type WellbeingField = 'energy' | 'mood'

// Column names are resolved through this whitelist and never interpolated from
// caller input.
const WB_COLS: Record<WellbeingField, { value: string; notes: string }> = {
  energy: { value: 'energy', notes: 'energy_notes' },
  mood: { value: 'mood', notes: 'mood_notes' },
}

export function wellbeingOn(date: string): Wellbeing | null {
  return all<Wellbeing>('SELECT * FROM wellbeing WHERE date = ? LIMIT 1', [date])[0] ?? null
}

// Most recent value of one field at or before `date` — the "default to your last
// value" behaviour for a quick-entry slider.
export function lastWellbeingOnOrBefore(date: string, field: WellbeingField): number | null {
  const col = WB_COLS[field].value
  const r = all<{ v: number | null }>(
    `SELECT ${col} AS v FROM wellbeing WHERE date <= ? AND ${col} IS NOT NULL ORDER BY date DESC LIMIT 1`,
    [date],
  )
  return r[0]?.v ?? null
}

// The actual write, shared by the public upsert below and by segment rollups.
async function writeWellbeingRollup(
  date: string,
  field: WellbeingField,
  value: number | null,
  notes?: string | null,
): Promise<void> {
  const col = WB_COLS[field]
  const prev = wellbeingOn(date)
  if (prev) {
    const nextNotes = notes === undefined ? (field === 'energy' ? prev.energy_notes : prev.mood_notes) : notes
    exec(`UPDATE wellbeing SET ${col.value} = ?, ${col.notes} = ? WHERE id = ?`, [value, nextNotes, prev.id])
    // Drop a row that no longer carries anything at all.
    const other = field === 'energy' ? prev.mood : prev.energy
    const otherNote = field === 'energy' ? prev.mood_notes : prev.energy_notes
    if (value == null && other == null && !nextNotes && !otherNote && !prev.notes) {
      exec('DELETE FROM wellbeing WHERE id = ?', [prev.id])
    }
  } else {
    exec(
      `INSERT INTO wellbeing(id, entry_id, date, energy, mood, notes, energy_notes, mood_notes)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        uid(), null, date,
        field === 'energy' ? value : null,
        field === 'mood' ? value : null,
        null,
        field === 'energy' ? (notes ?? null) : null,
        field === 'mood' ? (notes ?? null) : null,
      ],
    )
  }
  await persist()
}

// Set one field (and optionally its note) for one day directly, overriding and
// clearing any segments already on record for it. `notes` is tri-state exactly as
// in upsertTrackValue: omit to keep, null to clear, string to set.
export async function upsertWellbeingField(
  date: string,
  field: WellbeingField,
  value: number | null,
  notes?: string | null,
): Promise<void> {
  clearSegments(date, field)
  await writeWellbeingRollup(date, field, value, notes)
}

// ---- Single time-events ("started magnesium", "began a new diet") ----
// A one-off marker, not a metric trended over time — rendered as reference lines
// across Insights charts so a regimen change is visible against the trends.

export const eventsSince = (dateISO: string) =>
  all<HealthEvent>('SELECT * FROM events WHERE date >= ? ORDER BY date', [dateISO])

export async function saveEvent(date: string, kind: string | null, label: string, notes: string | null = null): Promise<string> {
  const id = uid()
  exec('INSERT INTO events(id, entry_id, date, kind, label, notes) VALUES (?,?,?,?,?,?)', [id, null, date, kind, label.trim(), notes])
  await persist()
  return id
}

export async function deleteEvent(id: string): Promise<void> {
  exec('DELETE FROM events WHERE id = ?', [id])
  await persist()
}

// ---- Sleep ----
// Bedtime/wake time/felt quality live on `wellbeing` alongside energy and mood
// (one row per day); duration is computed from the two times, not stored.

export function sleepOn(date: string): { sleep_start: string | null; sleep_end: string | null; sleep_quality: number | null } | null {
  const wb = wellbeingOn(date)
  return wb ? { sleep_start: wb.sleep_start, sleep_end: wb.sleep_end, sleep_quality: wb.sleep_quality } : null
}

export async function upsertSleep(
  date: string,
  sleepStart: string | null,
  sleepEnd: string | null,
  sleepQuality: number | null,
): Promise<void> {
  const prev = wellbeingOn(date)
  if (prev) {
    exec('UPDATE wellbeing SET sleep_start = ?, sleep_end = ?, sleep_quality = ? WHERE id = ?', [sleepStart, sleepEnd, sleepQuality, prev.id])
    const empty =
      sleepStart == null && sleepEnd == null && sleepQuality == null &&
      prev.energy == null && prev.mood == null && !prev.energy_notes && !prev.mood_notes && !prev.notes
    if (empty) exec('DELETE FROM wellbeing WHERE id = ?', [prev.id])
  } else if (sleepStart != null || sleepEnd != null || sleepQuality != null) {
    exec(
      `INSERT INTO wellbeing(id, entry_id, date, energy, mood, notes, energy_notes, mood_notes, sleep_start, sleep_end, sleep_quality)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [uid(), null, date, null, null, null, null, null, sleepStart, sleepEnd, sleepQuality],
    )
  }
  await persist()
}

// ---- Day context (stress load) ----
// Stress lives on day_context alongside six whole-day text columns, so like
// wellbeing it needs a column-level upsert that leaves its siblings alone.

export type DayContextField = 'stress'

const DC_COLS: Record<DayContextField, { value: string; notes: string }> = {
  stress: { value: 'stress_load', notes: 'stress_notes' },
}

// Free-text day descriptors that must survive a stress-only edit.
const DC_TEXT_COLS = ['tasks', 'travel', 'work', 'retreat', 'relaxation', 'notes'] as const

export function dayContextOn(date: string): DayContext | null {
  return all<DayContext>('SELECT * FROM day_context WHERE date = ? LIMIT 1', [date])[0] ?? null
}

export function lastDayContextOnOrBefore(date: string, field: DayContextField): number | null {
  const col = DC_COLS[field].value
  const r = all<{ v: number | null }>(
    `SELECT ${col} AS v FROM day_context WHERE date <= ? AND ${col} IS NOT NULL ORDER BY date DESC LIMIT 1`,
    [date],
  )
  return r[0]?.v ?? null
}

// The actual write, shared by the public upsert below and by segment rollups.
async function writeDayContextRollup(
  date: string,
  field: DayContextField,
  value: number | null,
  notes?: string | null,
): Promise<void> {
  const col = DC_COLS[field]
  const prev = dayContextOn(date)
  if (prev) {
    const nextNotes = notes === undefined ? prev.stress_notes : notes
    exec(`UPDATE day_context SET ${col.value} = ?, ${col.notes} = ? WHERE id = ?`, [value, nextNotes, prev.id])
    // Drop a row that no longer carries anything at all.
    const hasText = DC_TEXT_COLS.some((c) => prev[c])
    if (value == null && !nextNotes && !hasText) {
      exec('DELETE FROM day_context WHERE id = ?', [prev.id])
    }
  } else {
    exec(
      `INSERT INTO day_context(id, entry_id, date, tasks, travel, work, retreat, relaxation, stress_load, notes, stress_notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [uid(), null, date, null, null, null, null, null, value, null, notes ?? null],
    )
  }
  await persist()
}

// Same tri-state `notes` contract as upsertTrackValue / upsertWellbeingField. A
// direct set overrides and clears any segments already on record for it.
export async function upsertDayContextField(
  date: string,
  field: DayContextField,
  value: number | null,
  notes?: string | null,
): Promise<void> {
  clearSegments(date, field)
  await writeDayContextRollup(date, field, value, notes)
}

// ---- Segment values (time-of-day sub-day entries) ----
// A day's energy/mood/exercise/etc can be logged once ("whole day") or split into
// morning/afternoon/evening segments (schema.ts's segment_values table). Segment
// rows are additive and own the cell they belong to: writing one recomputes the
// day's rollup through the private write*Rollup primitive for wherever this metric
// lives, so every chart and read path only ever sees the rollup and stays
// unchanged. The three public upserts above clear a metric's segments before
// writing a direct value — enforced there, not in the UI, so no future caller can
// create drift between segments and the rollup they're supposed to own.

const SEGMENT_ORDER = "CASE segment WHEN 'morning' THEN 0 WHEN 'afternoon' THEN 1 WHEN 'evening' THEN 2 ELSE 3 END"

function clearSegments(date: string, metric: string): void {
  exec('DELETE FROM segment_values WHERE date = ? AND metric = ?', [date, metric])
}

export function segmentsOn(date: string, metric: string): SegmentValue[] {
  return all<SegmentValue>(
    `SELECT * FROM segment_values WHERE date = ? AND metric = ? ORDER BY ${SEGMENT_ORDER}`,
    [date, canonicalTrackName(metric)],
  )
}

// Write one segment's value (or clear it, with value null) and recompute the day's
// rollup. `notes` is tri-state like the other upserts.
export async function upsertSegmentValue(
  date: string,
  segment: Segment,
  metric: string,
  value: number | null,
  notes?: string | null,
): Promise<void> {
  const key = canonicalTrackName(metric)
  const keptNotes =
    notes === undefined
      ? all<{ notes: string | null }>(
          'SELECT notes FROM segment_values WHERE date = ? AND segment = ? AND metric = ?',
          [date, segment, key],
        )[0]?.notes ?? null
      : notes
  exec('DELETE FROM segment_values WHERE date = ? AND segment = ? AND metric = ?', [date, segment, key])
  if (value != null) {
    exec(
      'INSERT INTO segment_values(id, date, segment, metric, value, notes) VALUES (?,?,?,?,?,?)',
      [uid(), date, segment, key, value, keptNotes],
    )
  }
  await recomputeRollup(date, key)
}

// Recompute a day's rollup from whatever segments still exist (avg/sum/last — see
// rollupFor()) and write it through the metric's private, non-clearing primitive.
// Called after every segment write, including a clear: the last segment
// disappearing must null the rollup, not leave a stale value or a false zero — a
// day with nothing logged is not the same claim as a day of zero minutes.
async function recomputeRollup(date: string, key: string): Promise<void> {
  const rows = segmentsOn(date, key).filter((r) => r.value != null)
  const rollup = rollupFor(key)
  const value =
    rows.length === 0
      ? null
      : rollup === 'sum'
        ? rows.reduce((sum, r) => sum + (r.value as number), 0)
        : rollup === 'last'
          ? (rows[rows.length - 1].value as number)
          : Math.round((rows.reduce((sum, r) => sum + (r.value as number), 0) / rows.length) * 10) / 10
  const note = rows.length ? (rows[rows.length - 1].notes ?? null) : null

  const store = storeForName(key)
  if (store === 'wellbeing') {
    await writeWellbeingRollup(date, key as WellbeingField, value, note)
  } else if (store === 'day_context') {
    await writeDayContextRollup(date, key as DayContextField, value, note)
  } else {
    const def = defForName(key)
    const category = def ? categoryForDef(def) : null
    const scale = scaleForTrack(key, null)
    await writeTrackRollup(date, key, category, value, value == null ? null : scale.unit, note)
  }
}

// Dates in range that already have at least one entry/track/meal — used to mark
// the day strip so you can see at a glance which days are already covered.
export function loggedDates(sinceISO: string): Set<string> {
  const rows = all<{ date: string }>(
    `SELECT entry_date AS date FROM entries WHERE entry_date >= ?
     UNION SELECT date FROM tracks WHERE date >= ?
     UNION SELECT date FROM meals WHERE date >= ?`,
    [sinceISO, sinceISO, sinceISO],
  )
  return new Set(rows.map((r) => r.date).filter(Boolean))
}

// ---- Next-day soreness check-ins ----
// Workouts from the last few days (not today) we haven't yet asked about recovery for.
export function pendingCheckins(): Activity[] {
  const from = daysAgoISO(4)
  const to = daysAgoISO(1)
  return all<Activity>(
    `SELECT * FROM activities WHERE recovery_checked = 0 AND date >= ? AND date <= ?
     ORDER BY date DESC`,
    [from, to],
  )
}

export async function recordCheckin(activityId: string, note: string): Promise<void> {
  const rows = all<Activity>('SELECT * FROM activities WHERE id = ?', [activityId])
  const existing = rows[0]?.notes?.trim()
  const merged = [existing, `Recovery (${todayISO()}): ${note.trim()}`].filter(Boolean).join(' | ')
  exec('UPDATE activities SET notes = ?, recovery_checked = 1 WHERE id = ?', [merged, activityId])
  await persist()
}

export async function dismissCheckin(activityId: string): Promise<void> {
  exec('UPDATE activities SET recovery_checked = 1 WHERE id = ?', [activityId])
  await persist()
}

export function counts(): Record<string, number> {
  const t = ['entries', 'activities', 'gut_events', 'infections', 'wellbeing', 'day_context', 'meals', 'tracks', 'interpretations', 'segment_values', 'events']
  const out: Record<string, number> = {}
  for (const name of t) {
    const r = all<{ n: number }>(`SELECT COUNT(*) as n FROM ${name}`)
    out[name] = r[0]?.n ?? 0
  }
  return out
}
