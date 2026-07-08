import { getDb, persist } from './sqlite'
import { uid } from '../lib/id'
import { nowISO, todayISO } from '../lib/dates'
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
    // one row per day: replace an existing same-day row
    const date = w.date ?? entryDate
    exec('DELETE FROM wellbeing WHERE date = ?', [date])
    exec('INSERT INTO wellbeing(id, entry_id, date, energy, mood, notes) VALUES (?,?,?,?,?,?)', [
      uid(), entryId, date, w.energy ?? null, w.mood ?? null, w.notes ?? null,
    ])
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

  await persist()
  return entryId
}

// Delete an entry and every category row it produced. Wellbeing/day_context
// rows are only removed if they still belong to this entry (a later entry for
// the same date would have replaced them, in which case they're left alone).
export async function deleteEntry(entryId: string): Promise<void> {
  exec('DELETE FROM activities WHERE entry_id = ?', [entryId])
  exec('DELETE FROM gut_events WHERE entry_id = ?', [entryId])
  exec('DELETE FROM infections WHERE entry_id = ?', [entryId])
  exec('DELETE FROM wellbeing WHERE entry_id = ?', [entryId])
  exec('DELETE FROM day_context WHERE entry_id = ?', [entryId])
  exec('DELETE FROM entries WHERE id = ?', [entryId])
  await persist()
}

// ---- Meals ----

export async function saveMeal(a: MealAnalysis, date: string, time: string | null, photoPath: string | null): Promise<string> {
  const id = uid()
  exec(
    `INSERT INTO meals(id, date, time, name, calories, protein_g, fat_g, carbs_g, fiber_g,
      ingredients, photo_path, confidence, confirmed) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)`,
    [
      id, date, time, a.name, a.calories, a.protein_g, a.fat_g, a.carbs_g, a.fiber_g,
      JSON.stringify(a.ingredients ?? []), photoPath, a.confidence,
    ],
  )
  await persist()
  return id
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

export function counts(): Record<string, number> {
  const t = ['entries', 'activities', 'gut_events', 'infections', 'wellbeing', 'day_context', 'meals', 'interpretations']
  const out: Record<string, number> = {}
  for (const name of t) {
    const r = all<{ n: number }>(`SELECT COUNT(*) as n FROM ${name}`)
    out[name] = r[0]?.n ?? 0
  }
  return out
}
