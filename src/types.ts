// Domain types shared across the app. These mirror the SQLite schema in db/schema.ts.
import type { FoodGroupBreakdown } from './lib/foodGroups'

export type PrecededBy = 'travel' | 'ceremony' | 'work_project' | 'online_work' | 'transition' | 'other'
export type GentleMovementEffect = 'helped' | 'hurt' | 'neutral' | 'unknown'
export type EntrySource = 'voice' | 'text'

export interface Entry {
  id: string
  created_at: string
  entry_date: string | null // the date this entry was logged FOR (may be a past date)
  raw_text: string
  source: EntrySource
  processed: number // 0/1
}

export interface Activity {
  id: string
  entry_id: string | null
  date: string
  type: string
  duration_min: number | null
  intensity: string | null
  felt_during: string | null
  symptom_onset: string | null
  symptoms: string | null
  recovery_time: string | null
  gentle_movement_effect: GentleMovementEffect | null
  notes: string | null
  recovery_checked: number // 0/1 — whether we've done the next-day soreness check-in
}

export interface GutEvent {
  id: string
  entry_id: string | null
  date: string
  pain: number | null
  bloating: number | null
  preceded_by: string | null // comma-joined PrecededBy tags
  stool_consistency: number | null // Bristol 1-7
  warming_bottle_needed: number | null // 0/1
  notes: string | null
}

export interface Infection {
  id: string
  entry_id: string | null
  date: string
  kind: string
  severity: string | null
  preceded_by: string | null
  notes: string | null
}

export interface Wellbeing {
  id: string
  entry_id: string | null
  date: string
  energy: number | null
  mood: number | null
  notes: string | null // day-level note from diary extraction
  energy_notes: string | null // note attached to the energy quick entry
  mood_notes: string | null // note attached to the mood quick entry
  sleep_start: string | null // 'HH:MM' time went to bed
  sleep_end: string | null // 'HH:MM' time woke up
  sleep_quality: number | null // 0-10
}

export interface SegmentValue {
  id: string
  date: string
  segment: Segment
  metric: string
  value: number | null
  notes: string | null
}

export type Segment = 'morning' | 'afternoon' | 'evening'

export interface Supplement {
  id: string
  name: string
  composition: string | null
  photo_path: string | null
  start_date: string
  end_date: string | null // null = still taking
  checkin_days: number
  last_checkin: string | null
  notes: string | null // accumulated check-in notes, newest last
}

export interface HealthEvent {
  id: string
  entry_id: string | null
  date: string
  kind: string | null
  label: string
  notes: string | null
}

export interface DayContext {
  id: string
  entry_id: string | null
  date: string
  tasks: string | null
  travel: string | null
  work: string | null
  retreat: string | null
  relaxation: string | null
  stress_load: number | null
  notes: string | null // day-level note from diary extraction
  stress_notes: string | null // note attached to the stress quick entry
}

export interface Ingredient {
  name: string
  quantity: string
  // Set only when this line came from a barcode scan (Open Food Facts) — exact
  // label numbers, not an AI estimate. reEstimate() treats these as authoritative
  // and asks Claude to estimate only the remaining, un-scanned ingredients.
  barcode?: string
  brand?: string
  grams?: number
  calories?: number
  protein_g?: number
  fat_g?: number
  carbs_g?: number
  fiber_g?: number
}

export interface Meal {
  id: string
  date: string
  time: string | null
  name: string
  calories: number | null
  protein_g: number | null
  fat_g: number | null
  carbs_g: number | null
  fiber_g: number | null
  ingredients: string | null // JSON Ingredient[]
  photo_path: string | null
  confidence: string | null
  confirmed: number // 0/1
  source: string // 'photo' | 'text' | 'mixed'
  notes: string | null // raw dictated description, if any
  meal_type: string | null // 'breakfast' | 'lunch' | 'dinner' | 'snack'
  food_groups: string | null // JSON FoodGroupBreakdown (lib/foodGroups.ts); null pre-dates the feature
}

export type TrackCategory = 'practice' | 'symptom' | 'measurement' | 'activity' | 'release' | 'other'

export interface Track {
  id: string
  entry_id: string | null
  date: string
  name: string
  category: string | null
  value: number | null
  unit: string | null
  time: string | null // 'HH:MM' time of day, if mentioned
  notes: string | null
}

export interface Interpretation {
  id: string
  created_at: string
  period_covered: string | null
  patterns: string | null
  correlations: string | null
  model: string | null
  source_entry_ids: string | null // JSON string[]
}

// ---- Shapes returned by Claude structured extraction (before DB ids are assigned) ----

export interface ExtractedActivity {
  date?: string
  type?: string
  duration_min?: number
  intensity?: string
  felt_during?: string
  symptom_onset?: string
  symptoms?: string
  recovery_time?: string
  gentle_movement_effect?: GentleMovementEffect
  notes?: string
}

export interface ExtractedGut {
  date?: string
  pain?: number
  bloating?: number
  preceded_by?: PrecededBy[]
  stool_consistency?: number
  warming_bottle_needed?: boolean
  notes?: string
}

export interface ExtractedInfection {
  date?: string
  kind?: string
  severity?: string
  preceded_by?: PrecededBy[]
  notes?: string
}

export interface ExtractedWellbeing {
  date?: string
  energy?: number
  mood?: number
  notes?: string
}

export interface ExtractedDayContext {
  date?: string
  tasks?: string
  travel?: string
  work?: string
  retreat?: string
  relaxation?: string
  stress_load?: number
  notes?: string
}

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export interface TrackRecurrence {
  start_date: string
  end_date: string
  weekdays?: Weekday[]
}

export interface ExtractedTrack {
  date?: string
  recurrence?: TrackRecurrence // repeated habit over a span → one row per matching day
  dates?: string[] // explicit irregular list → one row per date
  name?: string
  category?: TrackCategory
  value?: number
  unit?: string
  time?: string // 'HH:MM' time of day, if mentioned
  notes?: string
}

export interface DiaryExtraction {
  activities: ExtractedActivity[]
  gut_events: ExtractedGut[]
  infections: ExtractedInfection[]
  wellbeing: ExtractedWellbeing[]
  day_context: ExtractedDayContext[]
  tracks: ExtractedTrack[]
  follow_up_questions: string[]
  summary: string
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export interface MealAnalysis {
  name: string
  ingredients: Ingredient[]
  calories: number
  protein_g: number
  fat_g: number
  carbs_g: number
  fiber_g: number
  confidence: 'low' | 'medium' | 'high'
  clarifying_questions: string[]
  meal_type?: MealType
  food_groups?: FoodGroupBreakdown
}

// One meal out of a multi-meal dictation — same macro shape as MealAnalysis, plus
// the date/time Claude assigned it (no clarifying_questions: multi-meal review
// is a flat list, not a per-meal Q&A loop).
export interface MultiMealItem {
  date: string
  meal_time: string
  name: string
  ingredients: Ingredient[]
  calories: number
  protein_g: number
  fat_g: number
  carbs_g: number
  fiber_g: number
  confidence: 'low' | 'medium' | 'high'
  meal_type?: MealType
  food_groups?: FoodGroupBreakdown
}

// ---- Tap-to-build ingredient meal builder ----

export type PrepTag = 'raw' | 'steamed' | 'boiled' | 'fried' | 'baked' | 'grilled'
export type FoodSource = 'claude' | 'off' | 'manual' | 'backfill'

export interface Food {
  id: string
  name: string
  name_key: string
  kcal_100g: number | null
  protein_100g: number | null
  fat_100g: number | null
  carbs_100g: number | null
  fiber_100g: number | null
  serving_g: number | null
  serving_label: string | null
  food_groups: string | null // JSON FoodGroupBreakdown per 100g
  brand: string | null
  barcode: string | null
  source: string // FoodSource
  seed_count: number
  seed_slots: string | null // JSON Partial<Record<MealType, number>>
  seed_last_used: string | null
  created_at: string
  archived: number // 0/1
}

// A food row joined with its live+seeded usage count for one meal slot — the shape
// foodUsageForSlot() returns and rankFoodsForSlot() scores.
export interface FoodUsageRow extends Food {
  uses: number
  last_used: string | null
}

export interface MealItem {
  id: string
  meal_id: string
  food_id: string | null
  name: string
  grams: number | null
  servings: number | null
  unit_label: string | null
  prep: string | null // PrepTag
  calories: number | null
  protein_g: number | null
  fat_g: number | null
  carbs_g: number | null
  fiber_g: number | null
  position: number
}

// What describeFoods() returns for one requested ingredient name, before a DB id
// is assigned — mirrors how MealAnalysis relates to the meals table.
export interface FoodProfile {
  query: string
  name: string
  brand?: string
  state: 'raw' | 'cooked' | 'dry' | 'as_sold'
  kcal_100g: number
  protein_100g: number
  fat_100g: number
  carbs_100g: number
  fiber_100g: number
  serving_g: number
  serving_label: string
  food_groups: FoodGroupBreakdown
  confidence: 'low' | 'medium' | 'high'
  note?: string
}
