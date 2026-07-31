// Phase E: "you usually have X around now" — client-side frequency analysis over
// the existing `meals` table, no new storage. Groups repeat dishes by the current
// time-of-day bucket (reusing the `meal_type` field that already exists on every
// meal) and surfaces the ones logged often enough to be a real pattern.
import { todayISO } from './dates'
import type { Meal, MealType } from '../types'

export const LOOKBACK_DAYS = 60
const MIN_REPEATS = 2
const MAX_SUGGESTIONS = 3

const MEAL_TYPE_VALUES = new Set<string>(['breakfast', 'lunch', 'dinner', 'snack'])

// Which of the four meal_type buckets a clock hour falls into. There's no fifth
// "late night" bucket, so 22:00-03:59 folds into 'snack' along with the
// mid-afternoon gap — the closest fit of the four, not a fifth category.
export function mealTypeForHour(hour: number): MealType {
  if (hour >= 4 && hour < 11) return 'breakfast'
  if (hour >= 11 && hour < 15) return 'lunch'
  if (hour >= 15 && hour < 18) return 'snack'
  if (hour >= 18 && hour < 22) return 'dinner'
  return 'snack'
}

// A meal's bucket is its own `meal_type` when set; older meals (or ones saved
// before that field existed) fall back to deriving one from `time`. A meal with
// neither can't be placed in a time-of-day bucket at all, so it's excluded from
// pattern-matching — it still shows up fine in "Recent meals", just not here.
function bucketFor(m: Meal): MealType | null {
  if (m.meal_type && MEAL_TYPE_VALUES.has(m.meal_type)) return m.meal_type as MealType
  if (m.time) {
    const hour = Number(m.time.slice(0, 2))
    if (Number.isFinite(hour)) return mealTypeForHour(hour)
  }
  return null
}

export type MealSuggestion = {
  key: string
  template: Meal // most recent matching occurrence — re-saved as-is for the quick-add
  count: number
}

// `meals` should already be scoped to LOOKBACK_DAYS by the caller (mealsSince);
// kept as a plain array in, array out function so it's trivial to test and reuse.
export function suggestQuickAdds(meals: Meal[], now: Date = new Date()): MealSuggestion[] {
  const bucket = mealTypeForHour(now.getHours())
  const today = todayISO()

  type Group = { count: number; latest: Meal; loggedToday: boolean }
  const groups = new Map<string, Group>()

  for (const m of meals) {
    if (bucketFor(m) !== bucket) continue
    const name = (m.name ?? '').trim()
    if (!name) continue
    const key = name.toLowerCase()
    const existing = groups.get(key)
    const isNewer =
      !existing ||
      m.date > existing.latest.date ||
      (m.date === existing.latest.date && (m.time ?? '') > (existing.latest.time ?? ''))
    groups.set(key, {
      count: (existing?.count ?? 0) + 1,
      latest: isNewer ? m : existing.latest,
      loggedToday: (existing?.loggedToday ?? false) || m.date === today,
    })
  }

  return [...groups.entries()]
    // Already logged today under this same bucket+name — showing the suggestion
    // again is noise, not help; "Recent meals -> Duplicate" covers a genuine
    // second helping.
    .filter(([, g]) => g.count >= MIN_REPEATS && !g.loggedToday)
    .sort((a, b) => b[1].count - a[1].count || (a[1].latest.date < b[1].latest.date ? 1 : -1))
    .slice(0, MAX_SUGGESTIONS)
    .map(([key, g]) => ({ key, template: g.latest, count: g.count }))
}
