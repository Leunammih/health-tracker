// One-time backfill: mine historical meals.ingredients JSON so the tap-to-build
// ingredient grid isn't empty on day one. Produces `foods` rows with real usage
// history (seed_count/seed_slots/seed_last_used) but NO macros — exactly the state
// a food is in until describeFoods() or a manual edit fills them in. Never touches
// meals or existing food macros.
import { getMeta, setMeta, mealsForFoodSeed, bulkUpsertBackfillFoods, type BackfillFoodEntry } from '../db/queries'
import { parseIngredients } from './meals'
import { mealTypeForHour } from './mealPatterns'
import type { MealType } from '../types'

const FLAG = 'foods_backfill_v1'
const MIN_REPEATS = 2 // a food eaten once historically is noise, not a pattern worth a grid slot
const MAX_FOODS = 120

const MEAL_TYPE_VALUES = new Set<string>(['breakfast', 'lunch', 'dinner', 'snack'])

// Trim, lowercase, collapse whitespace, strip a leading quantity ('2 eggs' ->
// 'eggs') and trailing punctuation. Deliberately NOT stemmed or de-pluralised —
// 'oats' -> 'oat' would collide with an unrelated food family — so this stays a
// literal normalisation, not a fuzzy one.
function normaliseKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[\d.,/½¼¾ ]+/, '')
    .replace(/[.,;:]+$/, '')
}

// A name that reads like a whole dish ("chicken and rice", "salad with feta")
// isn't a single ingredient — skip it rather than pollute the grid with compound
// entries that don't compose with anything else.
function looksLikeDish(key: string): boolean {
  return /\b(with|and)\b|[,+]/.test(key)
}

// Which slot a meal's ingredients count toward: the meal's own meal_type if valid,
// else derived from its time via the same hour buckets QuickAddMeals uses. A meal
// with neither contributes to overall seed_count but not to any specific slot.
function slotFor(mealType: string | null, time: string | null): MealType | null {
  if (mealType && MEAL_TYPE_VALUES.has(mealType)) return mealType as MealType
  if (time) {
    const hour = Number(time.slice(0, 2))
    if (Number.isFinite(hour)) return mealTypeForHour(hour)
  }
  return null
}

// In-flight guard: React 18 StrictMode double-invokes effects in dev, so two
// calls can land before either has written the `meta` flag — without this, both
// would tally history independently and bulkUpsertBackfillFoods's merge path
// would add each food's count in twice. Sharing one in-flight promise per page
// session closes that race (a genuine cross-tab race is out of scope, same as
// every other unsynchronised write in this single-user local-first app).
let inFlight: Promise<number> | null = null

export function ensureFoodSeed(): Promise<number> {
  if (!inFlight) inFlight = runBackfill().finally(() => { inFlight = null })
  return inFlight
}

// Idempotent: a `meta` flag (rides inside the .db file, so it syncs — a second
// device never re-mines) short-circuits every call after the first. Returns how
// many NEW food rows were created (0 if the backfill already ran, or if nothing in
// history repeated enough to qualify).
async function runBackfill(): Promise<number> {
  if (getMeta(FLAG)) return 0

  type Tally = { count: number; slots: Partial<Record<MealType, number>>; last: string; display: string }
  const tally = new Map<string, Tally>()

  for (const m of mealsForFoodSeed()) {
    const slot = slotFor(m.meal_type, m.time)
    for (const ing of parseIngredients(m.ingredients)) {
      const raw = ing.name.trim()
      if (!raw) continue
      const key = normaliseKey(raw)
      if (!key || key.length > 40 || looksLikeDish(key)) continue

      const existing = tally.get(key)
      if (existing) {
        existing.count++
        if (slot) existing.slots[slot] = (existing.slots[slot] ?? 0) + 1
        if (m.date > existing.last) existing.last = m.date
      } else {
        tally.set(key, { count: 1, slots: slot ? { [slot]: 1 } : {}, last: m.date, display: raw })
      }
    }
  }

  const entries: BackfillFoodEntry[] = [...tally.values()]
    .filter((t) => t.count >= MIN_REPEATS)
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_FOODS)
    .map((t) => ({ name: t.display, count: t.count, slots: t.slots, lastUsed: t.last }))

  const created = entries.length ? await bulkUpsertBackfillFoods(entries) : 0
  await setMeta(FLAG, '1')
  return created
}
