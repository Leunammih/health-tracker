// Pure arithmetic + shaping for the tap-to-build ingredient meal builder. No DB
// access and no React here — callers (queries.ts, MealBuilder.tsx) do the I/O and
// hand this module plain data. The one bridge to the rest of the app is
// buildToAnalysis(), which produces the exact MealAnalysis shape saveMeal/
// updateMeal already expect, so Insights/classifyMeal/exports/quick-add all keep
// working unchanged on a meal built this way.
import { uid } from './id'
import { classifyIngredient, FOOD_GROUP_KEYS, type FoodGroupBreakdown, type FoodGroupKey } from './foodGroups'
import { parseFoodGroups } from './meals'
import type { Food, Ingredient, Meal, MealAnalysis, MealItem, MealType, PrepTag } from '../types'

export type Macros = { calories: number; protein_g: number; fat_g: number; carbs_g: number; fiber_g: number }

const ZERO_MACROS: Macros = { calories: 0, protein_g: 0, fat_g: 0, carbs_g: 0, fiber_g: 0 }

// One ingredient in a meal under construction. `per100 === null` means the food's
// macros aren't known yet (a backfilled food nobody has looked up) — the item still
// adds to the meal with 0 macros and an "unknown" marker in the UI, rather than
// blocking the tap.
export interface BuildItem {
  key: string // stable React key + edit identity, independent of foodId
  foodId: string | null
  name: string
  per100: Macros | null
  servingG: number | null
  servingLabel: string | null
  mode: 'servings' | 'grams'
  servings: number
  grams: number | null // authoritative when mode === 'grams'
  prep: PrepTag | null
  foodGroups: FoodGroupBreakdown | null // per-100g breakdown for this food
}

export function newBuildItem(food: Food): BuildItem {
  return {
    key: uid(),
    foodId: food.id,
    name: food.name,
    per100: foodPer100(food),
    servingG: food.serving_g,
    servingLabel: food.serving_label,
    mode: 'servings',
    servings: 1,
    grams: null,
    prep: null,
    foodGroups: parseFoodGroups(food.food_groups) ?? null,
  }
}

// A scanned packaged product is weighed, not counted in servings — a barcode
// scan hands back a gram amount (from the label's serving size or a manual
// entry), not a "how many" tap count, so this lands in grams mode directly
// rather than going through newBuildItem's servings-of-1 default.
export function newBuildItemGrams(food: Food, grams: number): BuildItem {
  return {
    key: uid(),
    foodId: food.id,
    name: food.name,
    per100: foodPer100(food),
    servingG: food.serving_g,
    servingLabel: food.serving_label,
    mode: 'grams',
    servings: 1,
    grams,
    prep: null,
    foodGroups: parseFoodGroups(food.food_groups) ?? null,
  }
}

function foodPer100(food: Food): Macros | null {
  if (food.kcal_100g == null) return null
  return {
    calories: food.kcal_100g,
    protein_g: food.protein_100g ?? 0,
    fat_g: food.fat_100g ?? 0,
    carbs_g: food.carbs_100g ?? 0,
    fiber_g: food.fiber_100g ?? 0,
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

// The amount actually used, in grams — either the exact-grams entry, or the
// default serving size times how many taps added. Kept at 1dp, not rounded to a
// whole gram, so two half-servings of a 55g egg (27.5 + 27.5) sum back to 55.
export function gramsOf(item: BuildItem): number {
  if (item.mode === 'grams') return item.grams ?? 0
  return round1((item.servingG ?? 100) * item.servings)
}

// Per-item macros, computed from per100 x grams/100 and rounded ONCE here — kcal to
// the nearest integer, everything else to 1dp. This rounded value is what gets
// stored (meal_items.calories etc.) and what buildTotals sums, so the row total on
// screen always matches the sum of the rows underneath it.
export function itemMacros(item: BuildItem): Macros {
  if (!item.per100) return { ...ZERO_MACROS }
  const factor = gramsOf(item) / 100
  return {
    calories: Math.round(item.per100.calories * factor),
    protein_g: round1(item.per100.protein_g * factor),
    fat_g: round1(item.per100.fat_g * factor),
    carbs_g: round1(item.per100.carbs_g * factor),
    fiber_g: round1(item.per100.fiber_g * factor),
  }
}

export function buildTotals(items: BuildItem[]): Macros {
  const sum = items.reduce<Macros>((acc, item) => {
    const m = itemMacros(item)
    return {
      calories: acc.calories + m.calories,
      protein_g: acc.protein_g + m.protein_g,
      fat_g: acc.fat_g + m.fat_g,
      carbs_g: acc.carbs_g + m.carbs_g,
      fiber_g: acc.fiber_g + m.fiber_g,
    }
  }, { ...ZERO_MACROS })
  return {
    calories: Math.round(sum.calories),
    protein_g: round1(sum.protein_g),
    fat_g: round1(sum.fat_g),
    carbs_g: round1(sum.carbs_g),
    fiber_g: round1(sum.fiber_g),
  }
}

// How many "unknown macro" items are in the meal — drives the "412 kcal + 3
// unknown" running total instead of a falsely precise number.
export function unknownCount(items: BuildItem[]): number {
  return items.filter((i) => i.per100 == null).length
}

function formatServings(n: number): string {
  const whole = Math.floor(n)
  const frac = round1(n - whole)
  const fracStr = frac === 0.5 ? '½' : frac === 0.25 ? '¼' : frac === 0.75 ? '¾' : frac ? String(frac) : ''
  if (whole === 0) return fracStr || '0'
  return fracStr ? `${whole} ${fracStr}` : String(whole)
}

// A serving_label reads like "1 avocado" or "1 tbsp" — strip the leading "1 " so
// it can be re-prefixed with the actual count ("2 avocado", "½ avocado").
function stripLeadingOne(label: string): string {
  return label.replace(/^1\s+/, '')
}

// How an item's amount reads in the review list: '1½ avocado (210 g), raw' when
// added by serving taps, '150 g, grilled' when entered as exact grams.
export function itemQuantityText(item: BuildItem): string {
  const grams = gramsOf(item)
  const gramsText = `${Math.round(grams)} g`
  const base =
    item.mode === 'servings' && item.servingLabel
      ? `${formatServings(item.servings)} ${stripLeadingOne(item.servingLabel)} (${gramsText})`
      : gramsText
  return item.prep ? `${base}, ${item.prep}` : base
}

function singleGroupBreakdown(key: FoodGroupKey): FoodGroupBreakdown {
  const out = { vegan: 0, dairy_eggs: 0, meat_beef: 0, meat_chicken: 0, meat_fish: 0, meat_other: 0 } as FoodGroupBreakdown
  out[key] = 1
  return out
}

// Mass-weighted across items — strictly better than classifyMeal()'s equal-weight-
// by-ingredient-count fallback (a sprinkle of parmesan no longer counts the same as
// 200g of chicken), and lands in the same meals.food_groups column so every
// existing chart just takes the better branch with no code change.
export function buildFoodGroups(items: BuildItem[]): FoodGroupBreakdown {
  const totals = { vegan: 0, dairy_eggs: 0, meat_beef: 0, meat_chicken: 0, meat_fish: 0, meat_other: 0 } as FoodGroupBreakdown
  let totalGrams = 0
  for (const item of items) {
    const grams = gramsOf(item)
    if (grams <= 0) continue
    const fg = item.foodGroups ?? singleGroupBreakdown(classifyIngredient(item.name))
    for (const k of FOOD_GROUP_KEYS) totals[k] += fg[k] * grams
    totalGrams += grams
  }
  if (totalGrams <= 0) return totals
  for (const k of FOOD_GROUP_KEYS) totals[k] = totals[k] / totalGrams
  return totals
}

// Arithmetic here is exact; what's uncertain is the per-100g reference table and
// the portion guess, so "confidence" means something different for a built meal
// than for an AI estimate:
//   - any item with unknown macros -> low (the total is provably incomplete)
//   - every item entered as exact grams -> high (no default-serving guessing)
//   - otherwise (default servings used un-edited) -> medium
export function buildConfidence(items: BuildItem[]): 'low' | 'medium' | 'high' {
  if (items.length === 0) return 'low'
  if (items.some((i) => i.per100 == null)) return 'low'
  if (items.every((i) => i.mode === 'grams')) return 'high'
  return 'medium'
}

// The bridge to the rest of the app: produces exactly the MealAnalysis shape
// saveMeal/updateMeal already write. Ingredient.name stays the bare food name (so
// foodGroups.ts's regexes keep matching); amount and prep live in `quantity`,
// which is already free text everywhere that reads it.
export function buildToAnalysis(items: BuildItem[], name: string, mealType: MealType): MealAnalysis {
  const totals = buildTotals(items)
  const ingredients: Ingredient[] = items.map((i) => ({ name: i.name, quantity: itemQuantityText(i) }))
  return {
    name,
    ingredients,
    calories: totals.calories,
    protein_g: totals.protein_g,
    fat_g: totals.fat_g,
    carbs_g: totals.carbs_g,
    fiber_g: totals.fiber_g,
    confidence: buildConfidence(items),
    clarifying_questions: [],
    meal_type: mealType,
    food_groups: buildFoodGroups(items),
  }
}

// A short dish name auto-composed from the top few items by calorie contribution,
// e.g. "Avocado, eggs & rye bread" — used to prefill the builder's name field
// before the user edits it.
export function autoName(items: BuildItem[], max = 3): string {
  const ranked = [...items]
    .sort((a, b) => itemMacros(b).calories - itemMacros(a).calories)
    .slice(0, max)
    .map((i) => i.name.trim())
    .filter(Boolean)
  if (ranked.length === 0) return ''
  if (ranked.length === 1) return capitalize(ranked[0])
  return capitalize(ranked.slice(0, -1).join(', ') + ' & ' + ranked[ranked.length - 1])
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

// ---- Resolving a saved meal's meal_items back into editable BuildItems ----

export interface BuilderInit {
  date: string
  time: string | null
  mealType: MealType
  name: string
  items: BuildItem[]
}

// `food` is the current foods row for this item (or null if it's been deleted/
// archived since). Either way the result is fully re-scalable: when the food is
// gone, per100 is derived from the item's own stored macros/grams snapshot rather
// than left unknown, since those numbers were real once and shouldn't be lost.
export function buildItemFromMealItem(mi: MealItem, food: Food | null): BuildItem {
  if (food) {
    return {
      key: uid(),
      foodId: food.id,
      name: mi.name,
      per100: foodPer100(food),
      servingG: food.serving_g,
      servingLabel: food.serving_label,
      mode: mi.servings != null ? 'servings' : 'grams',
      servings: mi.servings ?? 1,
      grams: mi.grams,
      prep: (mi.prep as PrepTag) ?? null,
      foodGroups: parseFoodGroups(food.food_groups) ?? null,
    }
  }
  const grams = mi.grams ?? 0
  const per100: Macros | null =
    grams > 0
      ? {
          calories: ((mi.calories ?? 0) / grams) * 100,
          protein_g: ((mi.protein_g ?? 0) / grams) * 100,
          fat_g: ((mi.fat_g ?? 0) / grams) * 100,
          carbs_g: ((mi.carbs_g ?? 0) / grams) * 100,
          fiber_g: ((mi.fiber_g ?? 0) / grams) * 100,
        }
      : null
  return {
    key: uid(),
    foodId: null,
    name: mi.name,
    per100,
    servingG: null,
    servingLabel: mi.unit_label,
    mode: 'grams',
    servings: 1,
    grams: mi.grams,
    prep: (mi.prep as PrepTag) ?? null,
    foodGroups: null,
  }
}

export function builderInitFromMeal(meal: Meal, items: MealItem[], foodsById: Map<string, Food>): BuilderInit {
  return {
    date: meal.date,
    time: meal.time,
    mealType: (meal.meal_type as MealType) || 'snack',
    name: meal.name ?? '',
    items: items
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((mi) => buildItemFromMealItem(mi, mi.food_id ? foodsById.get(mi.food_id) ?? null : null)),
  }
}
