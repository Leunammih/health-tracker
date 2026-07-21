import { getDb, persist } from './sqlite'
import { uid } from '../lib/id'
import { nowISO, todayISO, daysAgoISO, expandDateRange, weekdayNums } from '../lib/dates'
import { canonicalTrackName } from '../lib/metrics'
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
    const date = d.date ?? entryDate
    exec('DELETE FROM day_context WHERE date = ?', [date])
    exec(
      `INSERT INTO day_context(id, entry_id, date, tasks, travel, work, retreat, relaxation, stress_load, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [uid(), entryId, date, d.tasks ?? null, d.travel ?? null, d.work ?? null, d.retreat ?? null, d.relaxation ?? null, d.stress_load ?? null, d.notes ?? null],
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
  deleteEntryRows(entryId)
  exec('DELETE FROM entries WHERE id = ?', [entryId])
  await persist()
}

// Delete just the derived category rows for an entry (keeps the entries row).
// Used when re-analyzing an edited entry so it can be re-populated under the same id.
export function deleteEntryRows(entryId: string): void {
  exec('DELETE FROM activities WHERE entry_id = ?', [entryId])
  exec('DELETE FROM gut_events WHERE entry_id = ?', [entryId])
  exec('DELETE FROM infections WHERE entry_id = ?', [entryId])
  exec('DELETE FROM wellbeing WHERE entry_id = ?', [entryId])
  exec('DELETE FROM day_context WHERE entry_id = ?', [entryId])
  exec('DELETE FROM tracks WHERE entry_id = ?', [entryId])
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
      ingredients, photo_path, confidence, confirmed, source, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`,
    [
      id, date, time, a.name, a.calories, a.protein_g, a.fat_g, a.carbs_g, a.fiber_g,
      JSON.stringify(a.ingredients ?? []), photoPath, a.confidence, source, notes,
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
      ingredients=?, photo_path=?, confidence=?, source=?, notes=? WHERE id=?`,
    [
      date, time, a.name, a.calories, a.protein_g, a.fat_g, a.carbs_g, a.fiber_g,
      JSON.stringify(a.ingredients ?? []), photoPath, a.confidence, source, notes, id,
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

// Set one value for one item on one day. Quick-logging is "one value per item per
// day", so this replaces any existing row for that name+date rather than stacking
// duplicates the charts would then have to reconcile. A null value clears the day.
//
// `notes` is deliberately tri-state: omit it to KEEP whatever note is already on the
// row, pass null to clear it, pass a string to set it. Callers that only touch the
// value (the Insights tap-to-log sheet, the bulk apply-to-last-N-days helpers) must
// omit it, or the DELETE+INSERT below would silently drop the note.
export async function upsertTrackValue(
  date: string,
  name: string,
  category: string | null,
  value: number | null,
  unit: string | null,
  notes?: string | null,
): Promise<void> {
  const key = canonicalTrackName(name)
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

// Set one field (and optionally its note) for one day. `notes` is tri-state exactly
// as in upsertTrackValue: omit to keep, null to clear, string to set.
export async function upsertWellbeingField(
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
  const t = ['entries', 'activities', 'gut_events', 'infections', 'wellbeing', 'day_context', 'meals', 'tracks', 'interpretations']
  const out: Record<string, number> = {}
  for (const name of t) {
    const r = all<{ n: number }>(`SELECT COUNT(*) as n FROM ${name}`)
    out[name] = r[0]?.n ?? 0
  }
  return out
}
