// A saved `Meal` row -> the `MealAnalysis` shape the review form and saveMeal/
// updateMeal expect. Was three near-identical inline object literals (edit,
// duplicate, and now quick-add) in NutritionTab.tsx; pulled out once a third
// copy was about to land.
import type { FoodGroupBreakdown } from './foodGroups'
import type { Ingredient, Meal, MealAnalysis } from '../types'

export function parseIngredients(json: string | null): Ingredient[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function parseFoodGroups(json: string | null): FoodGroupBreakdown | undefined {
  if (!json) return undefined
  try {
    return JSON.parse(json) as FoodGroupBreakdown
  } catch {
    return undefined
  }
}

export function mealToAnalysis(m: Meal): MealAnalysis {
  return {
    name: m.name ?? '',
    ingredients: parseIngredients(m.ingredients),
    calories: m.calories ?? 0,
    protein_g: m.protein_g ?? 0,
    fat_g: m.fat_g ?? 0,
    carbs_g: m.carbs_g ?? 0,
    fiber_g: m.fiber_g ?? 0,
    confidence: (m.confidence as MealAnalysis['confidence']) ?? 'medium',
    clarifying_questions: [],
    meal_type: (m.meal_type as MealAnalysis['meal_type']) ?? undefined,
    food_groups: parseFoodGroups(m.food_groups),
  }
}
