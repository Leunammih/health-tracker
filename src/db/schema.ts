export const SCHEMA_VERSION = 2

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
  notes TEXT
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
  notes TEXT
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
  notes TEXT
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
  confirmed INTEGER NOT NULL DEFAULT 1
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
  'interpretations',
] as const

export type TableName = (typeof TABLES)[number]
