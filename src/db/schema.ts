export const SCHEMA_VERSION = 11

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  entry_date TEXT,
  raw_text TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'text',
  processed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  entry_id TEXT,
  date TEXT NOT NULL,
  type TEXT,
  duration_min INTEGER,
  intensity TEXT,
  felt_during TEXT,
  symptom_onset TEXT,
  symptoms TEXT,
  recovery_time TEXT,
  gentle_movement_effect TEXT,
  notes TEXT,
  recovery_checked INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS gut_events (
  id TEXT PRIMARY KEY,
  entry_id TEXT,
  date TEXT NOT NULL,
  pain INTEGER,
  bloating INTEGER,
  preceded_by TEXT,
  stool_consistency INTEGER,
  warming_bottle_needed INTEGER,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS infections (
  id TEXT PRIMARY KEY,
  entry_id TEXT,
  date TEXT NOT NULL,
  kind TEXT,
  severity TEXT,
  preceded_by TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS wellbeing (
  id TEXT PRIMARY KEY,
  entry_id TEXT,
  date TEXT NOT NULL,
  energy INTEGER,
  mood INTEGER,
  notes TEXT,          -- day-level note (from diary extraction)
  energy_notes TEXT,   -- note attached to the energy quick entry
  mood_notes TEXT,     -- note attached to the mood quick entry
  sleep_start TEXT,     -- 'HH:MM' time went to bed
  sleep_end TEXT,       -- 'HH:MM' time woke up (duration is computed, not stored)
  sleep_quality INTEGER -- 0-10, how the sleep felt
);

CREATE TABLE IF NOT EXISTS day_context (
  id TEXT PRIMARY KEY,
  entry_id TEXT,
  date TEXT NOT NULL,
  tasks TEXT,
  travel TEXT,
  work TEXT,
  retreat TEXT,
  relaxation TEXT,
  stress_load INTEGER,
  notes TEXT,          -- day-level note (from diary extraction)
  stress_notes TEXT    -- note attached to the stress quick entry
);

CREATE TABLE IF NOT EXISTS meals (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  time TEXT,
  name TEXT,
  calories INTEGER,
  protein_g REAL,
  fat_g REAL,
  carbs_g REAL,
  fiber_g REAL,
  ingredients TEXT,
  photo_path TEXT,
  confidence TEXT,
  confirmed INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'photo',
  notes TEXT,
  meal_type TEXT,
  food_groups TEXT -- JSON FoodGroupBreakdown (lib/foodGroups.ts); null for meals saved before this existed
);

-- Generic time-series for anything the user wants to track/graph beyond the
-- fixed categories: meditation, joint/knee pain, weight, and custom activities
-- (kite surfing, dancing, biking…). One row = one occurrence on a date.
CREATE TABLE IF NOT EXISTS tracks (
  id TEXT PRIMARY KEY,
  entry_id TEXT,
  date TEXT NOT NULL,
  name TEXT NOT NULL,      -- e.g. 'meditation', 'knee pain', 'weight', 'kite surfing'
  category TEXT,           -- 'practice' | 'symptom' | 'measurement' | 'activity' | 'other'
  value REAL,              -- numeric value if any (minutes, severity 0-10, kg, …)
  unit TEXT,               -- 'min', '/10', 'kg', 'lb', …
  time TEXT,                -- 'HH:MM' time of day, if mentioned
  notes TEXT
);

-- Sub-day entries (morning/afternoon/evening) for a metric that otherwise lives on
-- tracks/wellbeing/day_context. Additive and additional: writing a segment
-- recomputes that day's rollup through the normal upserts, so every chart and read
-- path only ever sees the rollup and stays untouched. See lib/metricStore.ts.
CREATE TABLE IF NOT EXISTS segment_values (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  segment TEXT NOT NULL,   -- 'morning' | 'afternoon' | 'evening'
  metric TEXT NOT NULL,    -- canonical track/wellbeing/day_context key, e.g. 'energy'
  value REAL,
  notes TEXT
);

-- Single point-in-time markers ("started magnesium", "started keto") shown as
-- reference lines across Insights charts — not a metric trended over time.
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  entry_id TEXT,
  date TEXT NOT NULL,
  kind TEXT,          -- e.g. 'supplement', 'diet', 'other'
  label TEXT NOT NULL,
  notes TEXT
);

-- Ongoing regimens (supplements, and anything else with a start, an optional end,
-- and "is it working?" worth periodically revisiting) — a start/stop history plus
-- a recurring check-in, unlike the events table's one-off point-in-time markers.
CREATE TABLE IF NOT EXISTS supplements (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  composition TEXT,        -- dose/ingredients, typed or noted from a label photo
  photo_path TEXT,          -- optional photo of the label/bottle
  start_date TEXT NOT NULL,
  end_date TEXT,            -- null = still taking
  checkin_days INTEGER NOT NULL DEFAULT 14,
  last_checkin TEXT,        -- date of the last check-in (answered or skipped)
  notes TEXT                -- accumulated check-in notes, newest last
);

CREATE TABLE IF NOT EXISTS interpretations (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  period_covered TEXT,
  patterns TEXT,
  correlations TEXT,
  model TEXT,
  source_entry_ids TEXT
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE INDEX IF NOT EXISTS idx_activities_date ON activities(date);
CREATE INDEX IF NOT EXISTS idx_gut_date ON gut_events(date);
CREATE INDEX IF NOT EXISTS idx_infections_date ON infections(date);
CREATE INDEX IF NOT EXISTS idx_wellbeing_date ON wellbeing(date);
CREATE INDEX IF NOT EXISTS idx_day_context_date ON day_context(date);
CREATE INDEX IF NOT EXISTS idx_meals_date ON meals(date);
CREATE INDEX IF NOT EXISTS idx_tracks_date ON tracks(date);
CREATE INDEX IF NOT EXISTS idx_tracks_name ON tracks(name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_segment_unique ON segment_values(date, segment, metric);
CREATE INDEX IF NOT EXISTS idx_segment_metric ON segment_values(metric);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
CREATE INDEX IF NOT EXISTS idx_supplements_active ON supplements(end_date);
`

// Table list used by the generic export routines.
export const TABLES = [
  'entries',
  'activities',
  'gut_events',
  'infections',
  'wellbeing',
  'day_context',
  'meals',
  'tracks',
  'interpretations',
  'segment_values',
  'events',
  'supplements',
  // Included so DB-level settings (nutrition goals) appear in the JSON/CSV
  // exports too. The .db export and Dropbox sync copy the whole file and always
  // carried it; only these generic per-table dumps were missing it.
  'meta',
] as const

export type TableName = (typeof TABLES)[number]
