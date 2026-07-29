// Food-group breakdown for the Insights "food groups" bar: what fraction of a
// meal came from vegan / dairy & eggs / meat sources, meat further split by
// animal for the sub-colouring (beef/chicken/fish/other).
//
// New meals get this from Claude directly (src/ai/schemas.ts's MEAL_TOOL /
// MULTI_MEAL_TOOL — an estimate by mass/calories, the same trust level as the
// macro estimates). Meals saved before this feature existed have no stored
// breakdown; classifyMeal() below derives one from the ingredient list at
// chart-read time so old meals still show up instead of leaving a gap.
import type { Ingredient } from '../types'

export type FoodGroupKey = 'vegan' | 'dairy_eggs' | 'meat_beef' | 'meat_chicken' | 'meat_fish' | 'meat_other'

export type FoodGroupBreakdown = Record<FoodGroupKey, number>

export const FOOD_GROUP_KEYS: FoodGroupKey[] = [
  'vegan', 'dairy_eggs', 'meat_beef', 'meat_chicken', 'meat_fish', 'meat_other',
]

function emptyBreakdown(): FoodGroupBreakdown {
  return { vegan: 0, dairy_eggs: 0, meat_beef: 0, meat_chicken: 0, meat_fish: 0, meat_other: 0 }
}

// Ordered so a more specific match (e.g. "duck breast") isn't shadowed by a
// broader one — checked top to bottom, first match wins.
const RULES: [RegExp, FoodGroupKey][] = [
  [/\bbeef\b|steak|brisket|ground beef|burger patty/i, 'meat_beef'],
  [/chicken|turkey|poultry/i, 'meat_chicken'],
  [/salmon|tuna|fish|shrimp|prawn|cod|sardine|anchov|seafood|crab|lobster|scallop/i, 'meat_fish'],
  [/\bpork\b|bacon|\bham\b|\blamb\b|sausage|\bduck\b|venison|goat meat/i, 'meat_other'],
  [/\begg\b|eggs|cheese|\bmilk\b|yogurt|yoghurt|\bbutter\b|\bcream\b|dairy|parmesan|mozzarella|ghee|paneer/i, 'dairy_eggs'],
]

// Anything that doesn't match a known animal/dairy keyword is treated as
// plant-based — grains, vegetables, fruit, legumes, tofu, oil, etc. A coarse
// default, not a certified-vegan claim.
export function classifyIngredient(name: string): FoodGroupKey {
  for (const [re, bucket] of RULES) if (re.test(name)) return bucket
  return 'vegan'
}

// Equal-weighted by ingredient count, not mass — "a sprinkle of parmesan" and
// "200g chicken" count the same. A deliberate simplification: ingredient
// quantities are free-text (src/types.ts's Ingredient.quantity), not reliably
// parseable to grams, so this stays a rough proxy rather than a precise one.
export function classifyMeal(ingredients: Ingredient[]): FoodGroupBreakdown {
  const out = emptyBreakdown()
  const named = ingredients.filter((i) => i.name.trim())
  if (!named.length) return out
  for (const ing of named) out[classifyIngredient(ing.name)] += 1
  for (const k of FOOD_GROUP_KEYS) out[k] = out[k] / named.length
  return out
}
