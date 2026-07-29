// Daily nutrition goals (calories, protein). Stored in the DB's `meta` table
// rather than localStorage Settings: a health goal belongs to the data, so it
// syncs across devices via Dropbox and survives an export/import. Both are
// optional — set one, both, or neither.
import { getMeta, setMeta } from '../db/queries'
import type { Meal } from '../types'

export type Goals = {
  calories: number | null
  protein_g: number | null
}

export const EMPTY_GOALS: Goals = { calories: null, protein_g: null }

const KEY_CALORIES = 'goal_calories'
const KEY_PROTEIN = 'goal_protein_g'

// meta stores strings; anything unparseable or non-positive reads as "not set"
// so a stray value can never render a goal of 0 (which would show every day as
// infinitely over target).
function num(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function loadGoals(): Goals {
  return { calories: num(getMeta(KEY_CALORIES)), protein_g: num(getMeta(KEY_PROTEIN)) }
}

export async function saveGoals(g: Goals): Promise<void> {
  await setMeta(KEY_CALORIES, g.calories == null ? null : String(g.calories))
  await setMeta(KEY_PROTEIN, g.protein_g == null ? null : String(g.protein_g))
}

export function hasAnyGoal(g: Goals): boolean {
  return g.calories != null || g.protein_g != null
}

// Sum a day's meals. Missing values count as 0 — a meal saved without a protein
// estimate shouldn't blank out the whole day's total.
export function totalsFor(meals: Meal[]): { calories: number; protein_g: number } {
  return meals.reduce(
    (acc, m) => ({
      calories: acc.calories + (m.calories ?? 0),
      protein_g: acc.protein_g + (m.protein_g ?? 0),
    }),
    { calories: 0, protein_g: 0 },
  )
}
