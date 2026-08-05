// "Your usual breakfast ingredients" — ranks foods for one meal slot by blending
// live usage (from meal_items, self-correcting as meals are edited/deleted) with
// frozen backfill history (seed_count/seed_slots, for meals logged before the
// builder existed and will never have meal_items rows).
//
// A sibling to mealPatterns.ts, not an extension of it: that module groups whole
// *meals* in memory and returns a template to re-save verbatim; this groups
// *foods* via a SQL JOIN (queries.ts's foodUsageForSlot) and returns rows to
// compose a meal FROM. Different input, output and lifecycle — but the hour-to-
// slot boundaries must stay identical, so this imports mealTypeForHour rather than
// redefining it.
import { mealTypeForHour } from './mealPatterns'
import type { Food, FoodUsageRow, MealType } from '../types'

export { mealTypeForHour }

export const FOOD_LOOKBACK_DAYS = 90 // longer than mealPatterns' 60: a single
// ingredient repeats less often than a whole dish, so it needs a wider window to
// accumulate enough signal.
export const SLOT_GRID_SIZE = 10

function parseSlots(json: string | null): Partial<Record<MealType, number>> {
  if (!json) return {}
  try {
    const parsed = JSON.parse(json)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function daysBetween(fromISO: string, toISO: string): number {
  const from = new Date(fromISO + 'T00:00:00').getTime()
  const to = new Date(toISO + 'T00:00:00').getTime()
  if (Number.isNaN(from) || Number.isNaN(to)) return Infinity
  return Math.max(0, Math.round((to - from) / 86_400_000))
}

// Ranks foods already scoped to one slot (the caller passes foodUsageForSlot's
// result) by a blend of live use and recency, with a smaller weight for frozen
// backfill history — which is inferred from free text, not a real logged use.
// Multiplicative on recency so ten uses six weeks ago rank below six uses
// yesterday, not above them. `today` is passed in (not read from Date.now())
// so this stays a pure, testable function.
export function rankFoodsForSlot(rows: FoodUsageRow[], slot: MealType, today: string): Food[] {
  return rows
    .map((r) => {
      const seedForSlot = parseSlots(r.seed_slots)[slot] ?? 0
      const seedScore = seedForSlot + r.seed_count * 0.15 // a whisper of credit for
      // any-slot history, so a food seeded with no slot info at all (old meals
      // with neither meal_type nor time) isn't invisible to every grid.
      const recency = r.last_used ? Math.max(0, 1 - daysBetween(r.last_used, today) / FOOD_LOOKBACK_DAYS) : 0
      const score = r.uses * (1 + recency) + seedScore * 0.5
      return { food: r as Food, score }
    })
    .filter((x) => x.score > 0)
    // Stable tiebreak: without it, equal-score foods reorder on every re-render as
    // floating point / insertion order shifts, which reads as the grid reshuffling
    // under your thumb — the same hazard queries.ts's trackNamesSince avoids.
    .sort((a, b) => b.score - a.score || a.food.name.localeCompare(b.food.name))
    .map((x) => x.food)
}
