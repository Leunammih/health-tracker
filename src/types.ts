// Domain types shared across the app. These mirror the SQLite schema in db/schema.ts.

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
  notes: string | null
}

export interface Ingredient {
  name: string
  quantity: string
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
}

export type TrackCategory = 'practice' | 'symptom' | 'measurement' | 'activity' | 'other'

export interface Track {
  id: string
  entry_id: string | null
  date: string
  name: string
  category: string | null
  value: number | null
  unit: string | null
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

export interface ExtractedTrack {
  date?: string
  name?: string
  category?: TrackCategory
  value?: number
  unit?: string
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
}
