export const SCHEMA_VERSION = 13

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
  notes TEXT,
  intensity INTEGER         -- 1 low / 2 medium / 3 high, for duration metrics only.
                            -- Minutes say how long, not how hard, and 40 min of easy
                            -- cycling is not the same input as 40 min of intervals.
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
  notes TEXT,
  intensity INTEGER        -- as on the tracks table above; a segment carries its own
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

-- Canonical ingredients for the tap-to-build meal builder. One row per thing the
-- user actually eats ("avocado", "rolled oats", "chicken breast"), holding the
-- per-100g profile the builder multiplies by grams. Macros are computed LOCALLY
-- from these numbers, so Claude is called once per NEW food (ai/anthropic.ts's
-- describeFoods) and then never again — not on every meal, unlike the photo and
-- dictation paths.
CREATE TABLE IF NOT EXISTS foods (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,          -- display name, e.g. 'avocado', 'rolled oats'
  name_key TEXT NOT NULL,      -- lowercased/trimmed/whitespace-collapsed match key.
                                -- Deliberately NOT a unique index — see queries.ts's
                                -- findFoodByKey(). SCHEMA_SQL is replayed against
                                -- bytes pulled from Dropbox in replaceDb(); a unique
                                -- constraint that throws there would make a single
                                -- duplicate row permanently block sync in one direction.
  kcal_100g REAL,               -- per-100g macros. NULL means "known food, no numbers
  protein_100g REAL,            -- yet" — exactly the state the one-time backfill from
  fat_100g REAL,                -- historical meals.ingredients leaves every row in.
  carbs_100g REAL,               -- total carbohydrate, fibre included
  fiber_100g REAL,
  serving_g REAL,               -- grams in ONE serving; the step size of a grid tap
  serving_label TEXT,           -- how that serving reads: '1 avocado', '1 slice', '1 tbsp'
  food_groups TEXT,             -- JSON FoodGroupBreakdown for THIS food (lib/foodGroups.ts);
                                 -- null -> classifyIngredient(name) at read time
  brand TEXT,                   -- 'Alpro', 'Barilla'; null for generic foods. Declared now
                                 -- so a later Open Food Facts import is a write, not a migration.
  barcode TEXT,                 -- EAN/UPC. Null until the barcode-scanner phase; same reason.
  source TEXT NOT NULL DEFAULT 'manual', -- provenance of the NUMBERS:
                                 -- 'claude' | 'off' | 'manual' | 'backfill' (backfill = no numbers)
  seed_count INTEGER NOT NULL DEFAULT 0, -- frozen usage history mined once from historical
  seed_slots TEXT,               -- meals.ingredients JSON: total count, a JSON histogram
  seed_last_used TEXT,           -- {breakfast,lunch,dinner,snack}, and the last date seen.
                                  -- Never updated after the backfill — live usage is counted
                                  -- from meal_items, so these two never double-count.
  created_at TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0 -- hidden from the picker; meal_items keep resolving it
);

-- One row per ingredient in a meal built with the tap-to-build builder. The meal's
-- own calories/protein_g/... columns stay the source of truth for every chart,
-- export and goal bar; these rows are the itemised breakdown BEHIND that total, so
-- a built meal can be reopened and edited item by item rather than as five macro
-- numbers. Meals logged by photo or dictation have no rows here at all — the
-- presence of rows is what routes an edit to the builder instead of the review form.
CREATE TABLE IF NOT EXISTS meal_items (
  id TEXT PRIMARY KEY,
  meal_id TEXT NOT NULL,   -- meals.id. No FK: sql.js runs with foreign_keys OFF and no
                            -- other table declares one, so deleteMeal() cascades in code.
  food_id TEXT,             -- foods.id, or null if that food row was later deleted —
                             -- the snapshot columns below keep the row readable regardless
  name TEXT NOT NULL,       -- name snapshot: renaming a food must not rewrite history
  grams REAL,                -- the amount actually used, after servings x serving_g
  servings REAL,              -- how many default servings the taps added (0.5, 1, 2);
                               -- null when the item was typed in as exact grams
  unit_label TEXT,             -- serving_label snapshot, so '2 x 1 egg' still reads right
                                -- after the food's default serving is edited
  prep TEXT,                    -- 'raw'|'steamed'|'boiled'|'fried'|'baked'|'grilled'.
                                 -- RECORDED ONLY: it never adjusts macros. It is shown in the
                                 -- meal and passed to Claude as context on a re-estimate.
  calories REAL,                 -- per-item macros, computed at save time from the food's
  protein_g REAL,                -- per-100g values x grams/100 and then STORED. Not recomputed
  fat_g REAL,                     -- on read: correcting a food's numbers next month must not
  carbs_g REAL,                   -- silently rewrite what a past day says was eaten.
  fiber_g REAL,
  position INTEGER NOT NULL DEFAULT 0 -- display order within the meal
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
CREATE INDEX IF NOT EXISTS idx_foods_name_key ON foods(name_key);
CREATE INDEX IF NOT EXISTS idx_foods_barcode ON foods(barcode);
CREATE INDEX IF NOT EXISTS idx_meal_items_meal ON meal_items(meal_id);
CREATE INDEX IF NOT EXISTS idx_meal_items_food ON meal_items(food_id);
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
  'foods',
  'meal_items',
  // Included so DB-level settings (nutrition goals) appear in the JSON/CSV
  // exports too. The .db export and Dropbox sync copy the whole file and always
  // carried it; only these generic per-table dumps were missing it.
  'meta',
] as const

export type TableName = (typeof TABLES)[number]
