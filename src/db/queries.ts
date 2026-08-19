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
  Supplement,
  Food,
  FoodUsageRow,
  MealItem,
  MealType,
} from '../types'
import type { BuildItem } from '../lib/mealBuild'
import { gramsOf, itemMacros } from '../lib/mealBuild'

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
      `INSERT INTO wellbeing(id, entry_id, date, energy, mood, notes, energy_notes, mood_notes,
        sleep_start, sleep_end, sleep_quality)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        uid(), entryId, date,
        w.energy ?? prev?.energy ?? null,
        w.mood ?? prev?.mood ?? null,
        w.notes ?? prev?.notes ?? null,
        prev?.energy_notes ?? null,
        prev?.mood_notes ?? null,
        // EVERY column on this table has to be listed here, not just the ones the
        // extraction can set. This is a DELETE + INSERT, so a column left off the
        // INSERT is silently destroyed — which is exactly what happened to the three
        // sleep columns (added in schema v9, never added here): any dictated entry
        // mentioning energy or mood wiped that day's saved bedtime, wake time and
        // felt quality. Adding a column to `wellbeing` means adding it here too.
        prev?.sleep_start ?? null,
        prev?.sleep_end ?? null,
        prev?.sleep_quality ?? null,
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
      // Lists every column on the table on purpose — see the note in the wellbeing
      // block above. A DELETE + INSERT that omits one destroys it.
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
        `INSERT INTO tracks(id, entry_id, date, name, category, value, unit, time, notes, intensity)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [uid(), entryId, date, name, t.category ?? null, t.value ?? null, t.unit ?? null, t.time ?? null, t.notes ?? null, null],
      )
    }
  }

  await persist()
  return entryId
}

// Save a dictation as plain text, with nothing derived from it.
//
// `entries.processed` has existed since the first schema and has always been
// written as 1, because the only save path ran through Claude. This is what the
// column was for: a note kept verbatim, no API key, no network, and — the point —
// NOTHING written to tracks / wellbeing / day_context, so capturing a thought
// cannot move a number in the tracking. Process it later with "Edit & re-analyze"
// if it turns out to be worth extracting.
export async function saveRawEntry(
  rawText: string,
  source: 'voice' | 'text',
  entryDate: string = todayISO(),
): Promise<string> {
  const entryId = uid()
  exec('INSERT INTO entries(id, created_at, entry_date, raw_text, source, processed) VALUES (?,?,?,?,?,0)', [
    entryId,
    nowISO(),
    entryDate,
    rawText,
    source,
  ])
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
  // Columns on these two tables that a diary extraction can NEVER set — sleep has no
  // field in DIARY_TOOL at all, and the *_notes columns belong to the quick-entry
  // sliders. They only sit on this row because it is one-row-per-day, so they are not
  // "everything logged from this entry" and must survive its deletion. Captured
  // before the DELETE and re-materialised after it.
  const wbKept = all<{
    date: string; energy_notes: string | null; mood_notes: string | null
    sleep_start: string | null; sleep_end: string | null; sleep_quality: number | null
  }>(
    `SELECT date, energy_notes, mood_notes, sleep_start, sleep_end, sleep_quality
     FROM wellbeing WHERE entry_id = ?`,
    [entryId],
  )
  const dcKept = all<{ date: string; stress_notes: string | null }>(
    'SELECT date, stress_notes FROM day_context WHERE entry_id = ?',
    [entryId],
  )
  const wbDates = wbKept.map((r) => r.date)
  const dcDates = dcKept.map((r) => r.date)
  const trackRows = all<{ date: string; name: string }>('SELECT date, name FROM tracks WHERE entry_id = ?', [entryId])

  exec('DELETE FROM activities WHERE entry_id = ?', [entryId])
  exec('DELETE FROM gut_events WHERE entry_id = ?', [entryId])
  exec('DELETE FROM infections WHERE entry_id = ?', [entryId])
  exec('DELETE FROM wellbeing WHERE entry_id = ?', [entryId])
  exec('DELETE FROM day_context WHERE entry_id = ?', [entryId])
  exec('DELETE FROM tracks WHERE entry_id = ?', [entryId])

  for (const r of wbKept) {
    if (r.sleep_start == null && r.sleep_end == null && r.sleep_quality == null && !r.energy_notes && !r.mood_notes) continue
    exec(
      `INSERT INTO wellbeing(id, entry_id, date, energy, mood, notes, energy_notes, mood_notes,
        sleep_start, sleep_end, sleep_quality)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [uid(), null, r.date, null, null, null, r.energy_notes, r.mood_notes, r.sleep_start, r.sleep_end, r.sleep_quality],
    )
  }
  for (const r of dcKept) {
    if (!r.stress_notes) continue
    exec(
      `INSERT INTO day_context(id, entry_id, date, tasks, travel, work, retreat, relaxation, stress_load, notes, stress_notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [uid(), null, r.date, null, null, null, null, null, null, null, r.stress_notes],
    )
  }

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

// Non-persisting bodies shared by saveMeal/updateMeal (the photo/dictation/multi-
// meal/quick-add path) and saveBuiltMeal/updateBuiltMeal (the tap-to-build path) —
// both write the exact same `meals` columns, so every existing reader (Insights,
// classifyMeal, CSV/JSON export, quick-add) keeps working unchanged either way.
// Split out so a builder save writes `meals` + `meal_items` under ONE persist(),
// not two — persist() exports the whole DB, so two calls per save would double
// every write's cost on a phone for no reason.
function insertMealRow(
  id: string,
  a: MealAnalysis,
  date: string,
  time: string | null,
  photoPath: string | null,
  source: string,
  notes: string | null,
): void {
  exec(
    `INSERT INTO meals(id, date, time, name, calories, protein_g, fat_g, carbs_g, fiber_g,
      ingredients, photo_path, confidence, confirmed, source, notes, meal_type, food_groups) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?)`,
    [
      id, date, time, a.name, a.calories, a.protein_g, a.fat_g, a.carbs_g, a.fiber_g,
      JSON.stringify(a.ingredients ?? []), photoPath, a.confidence, source, notes, a.meal_type ?? null,
      a.food_groups ? JSON.stringify(a.food_groups) : null,
    ],
  )
}

function updateMealRow(
  id: string,
  a: MealAnalysis,
  date: string,
  time: string | null,
  photoPath: string | null,
  source: string,
  notes: string | null,
): void {
  exec(
    `UPDATE meals SET date=?, time=?, name=?, calories=?, protein_g=?, fat_g=?, carbs_g=?, fiber_g=?,
      ingredients=?, photo_path=?, confidence=?, source=?, notes=?, meal_type=?, food_groups=? WHERE id=?`,
    [
      date, time, a.name, a.calories, a.protein_g, a.fat_g, a.carbs_g, a.fiber_g,
      JSON.stringify(a.ingredients ?? []), photoPath, a.confidence, source, notes, a.meal_type ?? null,
      a.food_groups ? JSON.stringify(a.food_groups) : null, id,
    ],
  )
}

export async function saveMeal(
  a: MealAnalysis,
  date: string,
  time: string | null,
  photoPath: string | null,
  source: string,
  notes: string | null,
): Promise<string> {
  const id = uid()
  insertMealRow(id, a, date, time, photoPath, source, notes)
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
  updateMealRow(id, a, date, time, photoPath, source, notes)
  // A meal previously built with the tap-to-build builder may have meal_items rows
  // underneath it. The plain review form is authoritative when it's the one being
  // used to save — leaving old items in place would describe a breakdown that no
  // longer matches these totals, which is worse than having no breakdown at all.
  exec('DELETE FROM meal_items WHERE meal_id = ?', [id])
  await persist()
}

export async function deleteMeal(id: string): Promise<void> {
  // sql.js runs with foreign keys off, so this cascade has to happen in code.
  exec('DELETE FROM meal_items WHERE meal_id = ?', [id])
  exec('DELETE FROM meals WHERE id = ?', [id])
  await persist()
}

// ---- Tap-to-build meal builder: foods + meal_items ----

function writeMealItems(mealId: string, items: BuildItem[]): void {
  items.forEach((item, i) => {
    const grams = gramsOf(item)
    const m = itemMacros(item)
    exec(
      `INSERT INTO meal_items(id, meal_id, food_id, name, grams, servings, unit_label, prep,
        calories, protein_g, fat_g, carbs_g, fiber_g, position) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        uid(), mealId, item.foodId, item.name, grams,
        item.mode === 'servings' ? item.servings : null,
        item.servingLabel, item.prep,
        m.calories, m.protein_g, m.fat_g, m.carbs_g, m.fiber_g, i,
      ],
    )
  })
}

export async function saveBuiltMeal(
  a: MealAnalysis,
  items: BuildItem[],
  date: string,
  time: string | null,
  notes: string | null,
): Promise<string> {
  const id = uid()
  insertMealRow(id, a, date, time, null, 'builder', notes)
  writeMealItems(id, items)
  await persist()
  return id
}

export async function updateBuiltMeal(
  id: string,
  a: MealAnalysis,
  items: BuildItem[],
  date: string,
  time: string | null,
  photoPath: string | null,
  notes: string | null,
): Promise<void> {
  updateMealRow(id, a, date, time, photoPath, 'builder', notes)
  exec('DELETE FROM meal_items WHERE meal_id = ?', [id])
  writeMealItems(id, items)
  await persist()
}

export const mealItems = (mealId: string) =>
  all<MealItem>('SELECT * FROM meal_items WHERE meal_id = ? ORDER BY position', [mealId])

export function mealItemCount(mealId: string): number {
  const r = all<{ n: number }>('SELECT COUNT(*) AS n FROM meal_items WHERE meal_id = ?', [mealId])
  return r[0]?.n ?? 0
}

export const normaliseFoodKey = (name: string): string =>
  name.trim().toLowerCase().replace(/\s+/g, ' ').replace(/^[\d.,/½¼¾ ]+/, '').replace(/[.,;:]+$/, '')

// Lookup by normalised name — the enforcement point for food uniqueness, since
// name_key deliberately has NO unique index (see the comment on the `foods` table
// in schema.ts: a unique constraint there would make one duplicate row permanently
// break Dropbox sync in one direction). Every food-creation path must call this
// first.
export function findFoodByKey(name: string): Food | null {
  const key = normaliseFoodKey(name)
  if (!key) return null
  const rows = all<Food>('SELECT * FROM foods WHERE name_key = ? AND archived = 0 LIMIT 1', [key])
  return rows[0] ?? null
}

export const allFoods = (includeArchived = false) =>
  all<Food>(includeArchived ? 'SELECT * FROM foods ORDER BY name' : 'SELECT * FROM foods WHERE archived = 0 ORDER BY name')

// Barcode-first lookup for the scanner — uses idx_foods_barcode, so a re-scan of
// an already-known product costs a local read, not another Open Food Facts call.
export function findFoodByBarcode(barcode: string): Food | null {
  if (!barcode) return null
  const rows = all<Food>('SELECT * FROM foods WHERE barcode = ? AND archived = 0 LIMIT 1', [barcode])
  return rows[0] ?? null
}

export const foodsByIds = (ids: string[]): Map<string, Food> => {
  if (!ids.length) return new Map()
  const placeholders = ids.map(() => '?').join(',')
  const rows = all<Food>(`SELECT * FROM foods WHERE id IN (${placeholders})`, ids)
  return new Map(rows.map((f) => [f.id, f]))
}

// Insert a brand-new food row (caller must have already checked findFoodByKey).
export async function insertFood(f: Omit<Food, 'id' | 'name_key' | 'created_at'>): Promise<Food> {
  const id = uid()
  const created_at = nowISO()
  const name_key = normaliseFoodKey(f.name)
  exec(
    `INSERT INTO foods(id, name, name_key, kcal_100g, protein_100g, fat_100g, carbs_100g, fiber_100g,
      serving_g, serving_label, food_groups, brand, barcode, source, seed_count, seed_slots,
      seed_last_used, created_at, archived) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, f.name, name_key, f.kcal_100g, f.protein_100g, f.fat_100g, f.carbs_100g, f.fiber_100g,
      f.serving_g, f.serving_label, f.food_groups, f.brand, f.barcode, f.source, f.seed_count,
      f.seed_slots, f.seed_last_used, created_at, f.archived,
    ],
  )
  await persist()
  return { id, name_key, created_at, ...f }
}

// Update an existing food's editable fields (from the picker sheet, or when
// describeFoods() fills in macros for a previously macro-less backfilled row).
export async function updateFood(id: string, patch: Partial<Food>): Promise<void> {
  const current = all<Food>('SELECT * FROM foods WHERE id = ?', [id])[0]
  if (!current) return
  const next = { ...current, ...patch }
  const name_key = patch.name ? normaliseFoodKey(patch.name) : current.name_key
  exec(
    `UPDATE foods SET name=?, name_key=?, kcal_100g=?, protein_100g=?, fat_100g=?, carbs_100g=?, fiber_100g=?,
      serving_g=?, serving_label=?, food_groups=?, brand=?, barcode=?, source=?, seed_count=?, seed_slots=?,
      seed_last_used=?, archived=? WHERE id=?`,
    [
      next.name, name_key, next.kcal_100g, next.protein_100g, next.fat_100g, next.carbs_100g, next.fiber_100g,
      next.serving_g, next.serving_label, next.food_groups, next.brand, next.barcode, next.source,
      next.seed_count, next.seed_slots, next.seed_last_used, next.archived, id,
    ],
  )
  await persist()
}

// Merge a losing food into a winner (same normalised name, created independently —
// e.g. "Avocado" typed twice before a rename collided). Re-points every meal_items
// row, sums usage history, and removes the loser, so the two don't split the
// ranking in foodUsageForSlot and both under-rank forever.
export async function mergeFoods(winnerId: string, loserId: string): Promise<void> {
  if (winnerId === loserId) return
  const winner = all<Food>('SELECT * FROM foods WHERE id = ?', [winnerId])[0]
  const loser = all<Food>('SELECT * FROM foods WHERE id = ?', [loserId])[0]
  if (!winner || !loser) return
  exec('UPDATE meal_items SET food_id = ? WHERE food_id = ?', [winnerId, loserId])
  const winnerSlots = (JSON.parse(winner.seed_slots || '{}') || {}) as Record<string, number>
  const loserSlots = (JSON.parse(loser.seed_slots || '{}') || {}) as Record<string, number>
  const mergedSlots: Record<string, number> = { ...winnerSlots }
  for (const k of Object.keys(loserSlots)) mergedSlots[k] = (mergedSlots[k] ?? 0) + loserSlots[k]
  const mergedLastUsed =
    !winner.seed_last_used || (loser.seed_last_used && loser.seed_last_used > winner.seed_last_used)
      ? loser.seed_last_used
      : winner.seed_last_used
  // A scan-created loser carries a barcode/brand the winner (typically an older
  // manual/backfill row) never had — without this, dedupeFoods (which runs on
  // every Meals-tab mount) would silently delete the barcode on the very next
  // load, and the next scan would miss the local hit and re-fetch Open Food Facts.
  const mergedBrand = winner.brand ?? loser.brand
  const mergedBarcode = winner.barcode ?? loser.barcode
  exec(
    'UPDATE foods SET seed_count = ?, seed_slots = ?, seed_last_used = ?, brand = ?, barcode = ? WHERE id = ?',
    [winner.seed_count + loser.seed_count, JSON.stringify(mergedSlots), mergedLastUsed, mergedBrand, mergedBarcode, winnerId],
  )
  exec('DELETE FROM foods WHERE id = ?', [loserId])
  await persist()
}

// Every food, with how often it's actually been used in a given meal slot inside
// the lookback window. The slot filter lives in the LEFT JOIN's ON clause, not
// WHERE — filtering a LEFT JOIN in WHERE silently turns it into an INNER JOIN and
// drops every food with zero uses in this slot, including every backfilled food,
// whose whole point is to rank on seed_count before they have any live use at all.
// The CASE mirrors lib/mealPatterns.ts's mealTypeForHour() hour buckets — keep the
// two in sync if those boundaries ever change.
export function foodUsageForSlot(slot: MealType, sinceISO: string): FoodUsageRow[] {
  return all<FoodUsageRow>(
    `SELECT f.*,
            COUNT(mi.id) AS uses,
            MAX(m.date)  AS last_used
       FROM foods f
       LEFT JOIN meal_items mi ON mi.food_id = f.id
       LEFT JOIN meals m
              ON m.id = mi.meal_id
             AND m.date >= ?
             AND COALESCE(
                   NULLIF(m.meal_type, ''),
                   CASE
                     WHEN m.time IS NULL THEN NULL
                     WHEN CAST(substr(m.time,1,2) AS INTEGER) BETWEEN 4  AND 10 THEN 'breakfast'
                     WHEN CAST(substr(m.time,1,2) AS INTEGER) BETWEEN 11 AND 14 THEN 'lunch'
                     WHEN CAST(substr(m.time,1,2) AS INTEGER) BETWEEN 15 AND 17 THEN 'snack'
                     WHEN CAST(substr(m.time,1,2) AS INTEGER) BETWEEN 18 AND 21 THEN 'dinner'
                     ELSE 'snack'
                   END
                 ) = ?
      WHERE f.archived = 0
      GROUP BY f.id`,
    [sinceISO, slot],
  )
}

// ---- One-time foods backfill (lib/foodSeed.ts) ----

// Every meal that has a real (non-empty) ingredients list to mine. insertMealRow
// always writes at least '[]', so this excludes meals saved before the ingredients
// column existed or written directly via raw SQL (e.g. devtools' seed()).
export const mealsForFoodSeed = () =>
  all<{ date: string; time: string | null; meal_type: string | null; ingredients: string }>(
    "SELECT date, time, meal_type, ingredients FROM meals WHERE ingredients IS NOT NULL AND ingredients != '[]'",
  )

export interface BackfillFoodEntry {
  name: string
  count: number
  slots: Partial<Record<MealType, number>>
  lastUsed: string
}

// Insert or merge a batch of backfill-mined foods in as few persist() calls as
// possible (two: one for any new/updated rows, one from setMeta's own write when
// the caller marks the backfill done) rather than one per food — persist() exports
// the whole database, so a per-row loop would cost the same as saving ~120 meals.
// Each entry is looked up by normalised key first, so a food the user already
// created manually (or a previous partial run left behind) gets its usage history
// merged in rather than duplicated — see findFoodByKey's comment on why name_key
// has no unique index to enforce this at the DB level instead.
export async function bulkUpsertBackfillFoods(entries: BackfillFoodEntry[]): Promise<number> {
  let created = 0
  for (const e of entries) {
    const existing = findFoodByKey(e.name)
    if (existing) {
      const slots = { ...(JSON.parse(existing.seed_slots || '{}') as Record<string, number>) }
      for (const k of Object.keys(e.slots)) slots[k] = (slots[k] ?? 0) + (e.slots[k as MealType] ?? 0)
      const lastUsed =
        !existing.seed_last_used || e.lastUsed > existing.seed_last_used ? e.lastUsed : existing.seed_last_used
      exec('UPDATE foods SET seed_count = seed_count + ?, seed_slots = ?, seed_last_used = ? WHERE id = ?', [
        e.count, JSON.stringify(slots), lastUsed, existing.id,
      ])
    } else {
      exec(
        `INSERT INTO foods(id, name, name_key, source, seed_count, seed_slots, seed_last_used, created_at, archived)
         VALUES (?,?,?,?,?,?,?,?,0)`,
        [uid(), e.name, normaliseFoodKey(e.name), 'backfill', e.count, JSON.stringify(e.slots), e.lastUsed, nowISO()],
      )
      created++
    }
  }
  if (entries.length) await persist()
  return created
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
//
// ONE row per name. The same name can carry different categories across its history
// (dictation filed "shaking" as a practice on some days and with no category on
// others), and grouping by name+category returned it twice — the picker then took
// whichever row happened to come first and could pick the category-less one, which
// scales the slider as a 0-10 rating rather than minutes. MAX() ignores NULLs, so a
// name that was ever categorised keeps that category. Matches trackNamesSince().
export const allTrackNames = () =>
  all<{ name: string; category: string | null; n: number }>(
    'SELECT name, MAX(category) as category, COUNT(*) as n FROM tracks GROUP BY name ORDER BY n DESC',
  )

// The actual write, shared by the public upsert below and by segment rollups
// (lib/metricStore.ts's segment layer calls this directly, skipping the public
// upsert's clearSegments — segments own the cell, they don't clear themselves).
// Quick-logging is "one value per item per day", so this replaces any existing row
// for that name+date rather than stacking duplicates the charts would then have to
// reconcile. A null value clears the day.
//
// `notes` and `intensity` are deliberately tri-state: omit to KEEP whatever is
// already on the row, pass null to clear, pass a value to set. Callers that only
// touch the value (the Insights tap-to-log sheet, the bulk apply-to-last-N-days
// helpers) must omit them, or the DELETE+INSERT below would silently drop them.
async function writeTrackRollup(
  date: string,
  key: string,
  category: string | null,
  value: number | null,
  unit: string | null,
  notes?: string | null,
  intensity?: number | null,
): Promise<void> {
  const prev =
    notes === undefined || intensity === undefined
      ? all<{ notes: string | null; intensity: number | null }>(
          'SELECT notes, intensity FROM tracks WHERE date = ? AND name = ? LIMIT 1',
          [date, key],
        )[0]
      : undefined
  const keptNotes = notes === undefined ? prev?.notes ?? null : notes
  const keptIntensity = intensity === undefined ? prev?.intensity ?? null : intensity
  exec('DELETE FROM tracks WHERE date = ? AND name = ?', [date, key])
  if (value != null) {
    exec(
      `INSERT INTO tracks(id, entry_id, date, name, category, value, unit, time, notes, intensity)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [uid(), null, date, key, category, value, unit, null, keptNotes, keptIntensity],
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
  intensity?: number | null,
): Promise<void> {
  const key = canonicalTrackName(name)
  clearSegments(date, key)
  await writeTrackRollup(date, key, category, value, unit, notes, intensity)
}

// The value of `name` on `date`, or null if that day has no entry for it.
export function trackValueOn(date: string, name: string): number | null {
  const r = all<{ value: number | null }>(
    'SELECT value FROM tracks WHERE date = ? AND name = ? LIMIT 1',
    [date, name.trim().toLowerCase()],
  )
  return r[0]?.value ?? null
}

// Value + note + intensity in one read, for prefilling a quick-entry row.
export function trackRowOn(
  date: string,
  name: string,
): { value: number | null; notes: string | null; intensity: number | null } | null {
  const r = all<{ value: number | null; notes: string | null; intensity: number | null }>(
    'SELECT value, notes, intensity FROM tracks WHERE date = ? AND name = ? LIMIT 1',
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

// ---- Supplements: ongoing regimens with a start, an optional end, and a
// recurring "is it working?" check-in — unlike `events`, which is a one-off
// point-in-time marker with no lifecycle of its own. ----

export function activeSupplements(): Supplement[] {
  return all<Supplement>('SELECT * FROM supplements WHERE end_date IS NULL ORDER BY start_date DESC')
}

export function stoppedSupplements(limit = 10): Supplement[] {
  return all<Supplement>(
    'SELECT * FROM supplements WHERE end_date IS NOT NULL ORDER BY end_date DESC LIMIT ?',
    [limit],
  )
}

// Every supplement name ever entered, stopped ones included — used to keep a
// supplement that also landed in `tracks` (dictation: "took digestive enzymes")
// out of the metric sliders, where it would pose as something to rate 0-10.
export function allSupplementNames(): string[] {
  return all<{ name: string }>('SELECT name FROM supplements').map((r) => r.name)
}

export async function saveSupplement(
  name: string,
  composition: string | null,
  photoPath: string | null,
  startDate: string,
  checkinDays: number,
): Promise<string> {
  const id = uid()
  exec(
    `INSERT INTO supplements(id, name, composition, photo_path, start_date, checkin_days)
     VALUES (?,?,?,?,?,?)`,
    [id, name.trim(), composition?.trim() || null, photoPath, startDate, checkinDays],
  )
  await persist()
  return id
}

// Change a supplement in place. Until now the card only offered Stop and Delete, so
// a typo in a name, a wrong start date, or a dose he only worked out later meant
// deleting the row and losing its accumulated check-in notes with it.
//
// Only the keys present in `patch` are written — passing `end_date: null` restarts a
// stopped supplement, whereas omitting it leaves the stop date alone. Column names
// come from this whitelist and are never interpolated from caller input.
const SUPPLEMENT_COLS = ['name', 'composition', 'photo_path', 'start_date', 'end_date', 'checkin_days'] as const
export type SupplementPatch = Partial<Pick<Supplement, (typeof SUPPLEMENT_COLS)[number]>>

export async function updateSupplement(id: string, patch: SupplementPatch): Promise<void> {
  const cols = SUPPLEMENT_COLS.filter((c) => c in patch)
  if (!cols.length) return
  exec(
    `UPDATE supplements SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
    [...cols.map((c) => patch[c] ?? null), id],
  )
  await persist()
}

export async function stopSupplement(id: string, endDate: string = todayISO()): Promise<void> {
  exec('UPDATE supplements SET end_date = ? WHERE id = ?', [endDate, id])
  await persist()
}

export async function deleteSupplement(id: string): Promise<void> {
  exec('DELETE FROM supplements WHERE id = ?', [id])
  await persist()
}

// Active supplements whose check-in interval has elapsed since the last one (or
// since starting, if never checked). Mirrors pendingCheckins()'s "the queue IS the
// query" shape rather than a stored due-date, so changing checkin_days on an
// existing supplement takes effect immediately.
export function pendingSupplementCheckins(): Supplement[] {
  return all<Supplement>(
    `SELECT * FROM supplements
     WHERE end_date IS NULL
       AND date(COALESCE(last_checkin, start_date), '+' || checkin_days || ' days') <= date(?)
     ORDER BY start_date`,
    [todayISO()],
  )
}

export async function recordSupplementCheckin(id: string, note: string): Promise<void> {
  const rows = all<Supplement>('SELECT * FROM supplements WHERE id = ?', [id])
  const existing = rows[0]?.notes?.trim()
  const merged = [existing, `Check-in (${todayISO()}): ${note.trim()}`].filter(Boolean).join(' | ')
  exec('UPDATE supplements SET notes = ?, last_checkin = ? WHERE id = ?', [merged, todayISO(), id])
  await persist()
}

export async function dismissSupplementCheckin(id: string): Promise<void> {
  exec('UPDATE supplements SET last_checkin = ? WHERE id = ?', [todayISO(), id])
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
  intensity?: number | null,
): Promise<void> {
  const key = canonicalTrackName(metric)
  const prev =
    notes === undefined || intensity === undefined
      ? all<{ notes: string | null; intensity: number | null }>(
          'SELECT notes, intensity FROM segment_values WHERE date = ? AND segment = ? AND metric = ?',
          [date, segment, key],
        )[0]
      : undefined
  const keptNotes = notes === undefined ? prev?.notes ?? null : notes
  const keptIntensity = intensity === undefined ? prev?.intensity ?? null : intensity
  exec('DELETE FROM segment_values WHERE date = ? AND segment = ? AND metric = ?', [date, segment, key])
  if (value != null) {
    exec(
      'INSERT INTO segment_values(id, date, segment, metric, value, notes, intensity) VALUES (?,?,?,?,?,?,?)',
      [uid(), date, segment, key, value, keptNotes, keptIntensity],
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
  // Same rule as the note: the day inherits the most recent segment's intensity.
  // Averaging "low morning, high evening" into "medium" would describe a session
  // that never happened.
  const intensity = rows.length ? (rows[rows.length - 1].intensity ?? null) : null

  const store = storeForName(key)
  if (store === 'wellbeing') {
    await writeWellbeingRollup(date, key as WellbeingField, value, note)
  } else if (store === 'day_context') {
    await writeDayContextRollup(date, key as DayContextField, value, note)
  } else {
    const def = defForName(key)
    const category = def ? categoryForDef(def) : null
    const scale = scaleForTrack(key, null)
    await writeTrackRollup(date, key, category, value, value == null ? null : scale.unit, note, intensity)
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

// ---- meta: small key/value settings that belong to the DATA, not the device ----
// `meta` already existed for `schema_version`. Anything stored here rides along
// with the .db file, so it syncs through Dropbox and survives an export/import —
// unlike lib/storage.ts's Settings (localStorage, deliberately per-device: API
// key, model, theme, Dropbox config).
export function getMeta(key: string): string | null {
  const rows = all<{ value: string | null }>('SELECT value FROM meta WHERE key = ?', [key])
  return rows[0]?.value ?? null
}

export async function setMeta(key: string, value: string | null): Promise<void> {
  if (value === null) exec('DELETE FROM meta WHERE key = ?', [key])
  else exec('INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)', [key, value])
  await persist()
}

export function counts(): Record<string, number> {
  const t = ['entries', 'activities', 'gut_events', 'infections', 'wellbeing', 'day_context', 'meals', 'tracks', 'interpretations', 'segment_values', 'events', 'supplements', 'foods', 'meal_items']
  const out: Record<string, number> = {}
  for (const name of t) {
    const r = all<{ n: number }>(`SELECT COUNT(*) as n FROM ${name}`)
    out[name] = r[0]?.n ?? 0
  }
  return out
}
