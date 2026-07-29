// Single source of truth for how a tracked thing is named, coloured, scaled and
// oriented. Insights charts, the tap-to-log sheet and the Log tab quick-add all
// read from here, so a colour or a slider range is defined exactly once.
//
// Orientation rule (locked 2026-07-21): GOOD IS ALWAYS AT THE TOP. Metrics where a
// low number is the good outcome (pain, stress, illness, release) set
// `lowerIsBetter` and render on a reversed Y axis.

import { colorForTrack as paletteColor, chartPalette, type PaletteGroup } from './palette'
import { isLight } from './theme'

export type { PaletteGroup }
export { chartPalette }

export type MetricGroup = 'practice' | 'movement' | 'symptom' | 'wellbeing' | 'other'

// The palette module's hue families don't include 'other' (fallback groups
// like weight measurements) — those land in the symptom arc, same as any
// unregistered name, so a stray track never picks a forbidden or clashing hue.
function paletteGroup(g: MetricGroup): PaletteGroup {
  return g === 'other' ? 'symptom' : g
}

export interface TrackDef {
  key: string // canonical key stored in tracks.name
  label: string // display label
  match: RegExp // matches free-form names coming out of dictation
  color: string
  group: MetricGroup
  unit: string
  min: number
  max: number
  step: number
  lowerIsBetter?: boolean
  // Which table this metric lives in. Defaults to 'tracks'. Energy and mood are
  // columns on the `wellbeing` table and stress is a column on `day_context`, so
  // quick entries read/write those through a different path — see the STORES
  // dispatch table in lib/metricStore.ts.
  store?: MetricStore
}

export type MetricStore = 'tracks' | 'wellbeing' | 'day_context'

// Colours are derived from the group-hue palette module (src/lib/palette.ts),
// never hand-authored here — that's the whole point of extracting colour into
// its own presentation module: a palette change never touches this registry,
// and this registry never risks a forbidden or colliding hue again.
export const TRACK_DEFS: TrackDef[] = [
  // --- movement & exercise (minutes) ---
  { key: 'exercise', label: 'Exercise', match: /workout|strength|gym|exercise|training/i, color: paletteColor('exercise', 'movement'), group: 'movement', unit: 'min', min: 0, max: 180, step: 5 },
  { key: 'dancing', label: 'Dancing', match: /danc/i, color: paletteColor('dancing', 'movement'), group: 'movement', unit: 'min', min: 0, max: 180, step: 5 },
  { key: 'biking', label: 'Biking', match: /bik|cycl/i, color: paletteColor('biking', 'movement'), group: 'movement', unit: 'min', min: 0, max: 180, step: 5 },
  { key: 'walking', label: 'Walking', match: /walk|hike|hiking/i, color: paletteColor('walking', 'movement'), group: 'movement', unit: 'min', min: 0, max: 180, step: 5 },
  { key: 'running', label: 'Running', match: /run|jog/i, color: paletteColor('running', 'movement'), group: 'movement', unit: 'min', min: 0, max: 180, step: 5 },
  { key: 'stretching', label: 'Stretching', match: /stretch|mobility/i, color: paletteColor('stretching', 'movement'), group: 'movement', unit: 'min', min: 0, max: 120, step: 5 },
  { key: 'swimming', label: 'Swimming', match: /swim/i, color: paletteColor('swimming', 'movement'), group: 'movement', unit: 'min', min: 0, max: 180, step: 5 },
  { key: 'yoga', label: 'Yoga', match: /yoga/i, color: paletteColor('yoga', 'movement'), group: 'movement', unit: 'min', min: 0, max: 120, step: 5 },

  // --- practices (minutes) ---
  { key: 'meditation', label: 'Meditation', match: /medit/i, color: paletteColor('meditation', 'practice'), group: 'practice', unit: 'min', min: 0, max: 120, step: 5 },
  { key: 'breath work', label: 'Breath work', match: /breath/i, color: paletteColor('breath work', 'practice'), group: 'practice', unit: 'min', min: 0, max: 120, step: 5 },

  // --- symptoms (0-10, low is good → reversed axis) ---
  { key: 'knee pain', label: 'Knee pain', match: /knee/i, color: paletteColor('knee pain', 'symptom'), group: 'symptom', unit: '/10', min: 0, max: 10, step: 1, lowerIsBetter: true },
  { key: 'wrist pain', label: 'Wrist pain', match: /wrist/i, color: paletteColor('wrist pain', 'symptom'), group: 'symptom', unit: '/10', min: 0, max: 10, step: 1, lowerIsBetter: true },
  { key: 'back pain', label: 'Back pain', match: /back/i, color: paletteColor('back pain', 'symptom'), group: 'symptom', unit: '/10', min: 0, max: 10, step: 1, lowerIsBetter: true },
  { key: 'shoulder pain', label: 'Shoulder pain', match: /shoulder/i, color: paletteColor('shoulder pain', 'symptom'), group: 'symptom', unit: '/10', min: 0, max: 10, step: 1, lowerIsBetter: true },
  { key: 'stomach pain', label: 'Stomach pain', match: /stomach|belly|gut|abdom/i, color: paletteColor('stomach pain', 'symptom'), group: 'symptom', unit: '/10', min: 0, max: 10, step: 1, lowerIsBetter: true },

  // --- illness (manual tap-to-log; merged into the Illness & gut chart in
  // InsightsTab.tsx alongside the AI-diary-extracted infections/gut_events data) ---
  { key: 'infection', label: 'Infection', match: /infection/i, color: paletteColor('infection', 'symptom'), group: 'symptom', unit: '/10', min: 0, max: 10, step: 1, lowerIsBetter: true },
  // Key stays "stool" (not "stool consistency") so it reuses the same palette.ts KNOWN
  // colour as the Illness & gut chart's own "Stool" series — same metric, same hue.
  { key: 'stool', label: 'Stool consistency', match: /stool|bristol/i, color: paletteColor('stool', 'symptom'), group: 'symptom', unit: '', min: 1, max: 7, step: 1 },

  // --- measurements ---
  { key: 'weight', label: 'Weight', match: /weight/i, color: paletteColor('weight', 'symptom'), group: 'other', unit: 'kg', min: 40, max: 150, step: 1 },

  // --- energy & mood (0-10, high is good). Stored on the `wellbeing` table, not
  // `tracks`; colours match the existing "Energy & mood" chart in InsightsTab. ---
  { key: 'energy', label: 'Energy', match: /^energy$/i, color: paletteColor('energy', 'wellbeing'), group: 'wellbeing', unit: '/10', min: 0, max: 10, step: 1, store: 'wellbeing' },
  { key: 'mood', label: 'Mood', match: /^mood$/i, color: paletteColor('mood', 'wellbeing'), group: 'wellbeing', unit: '/10', min: 0, max: 10, step: 1, store: 'wellbeing' },

  // --- release (10% steps; 0% at top, 100% at bottom) ---
  { key: 'release', label: 'Release 💦', match: /release/i, color: paletteColor('release', 'wellbeing'), group: 'wellbeing', unit: '%', min: 0, max: 100, step: 10, lowerIsBetter: true },

  // --- stress (0-10, low is good). Stored on `day_context.stress_load`, which the
  // AI diary extraction also writes; the quick entry keeps its note in a dedicated
  // stress_notes column so the day-level diary note survives. ---
  { key: 'stress', label: 'Stress', match: /^stress$/i, color: paletteColor('stress', 'wellbeing'), group: 'wellbeing', unit: '/10', min: 0, max: 10, step: 1, lowerIsBetter: true, store: 'day_context' },
]

// Resolve a free-form name to its definition. The fuzzy regex pass deliberately
// SKIPS defs stored outside `tracks`: this runs against arbitrary names read out of
// the `tracks` table, and a track happening to be called "energy" or "stress" must
// not be routed to the wellbeing/day_context tables. Only an exact key match reaches those.
export function defForName(name: string): TrackDef | undefined {
  const n = name.trim().toLowerCase()
  return (
    TRACK_DEFS.find((d) => d.key === n) ??
    TRACK_DEFS.find((d) => storeForDef(d) === 'tracks' && d.match.test(n))
  )
}

export function storeForDef(def: TrackDef): MetricStore {
  return def.store ?? 'tracks'
}

// Where a free-form name's value should be read from and written to.
export function storeForName(name: string): MetricStore {
  const def = defForName(name)
  return def ? storeForDef(def) : 'tracks'
}

// The one spelling a name should be stored and compared under. Dictation produces
// variants of the same thing ("breathwork" vs "breath work"), and comparing raw
// strings makes them look like two different metrics — they then show up twice in
// the tap-to-log grid under the same label and colour. Route every name through the
// registry first so known aliases collapse; unknown names just normalise casing.
export function canonicalTrackName(name: string): string {
  return defForName(name)?.key ?? name.trim().toLowerCase()
}

// Stable colour for any track name: a deterministic slot in its group's hue
// arc — same name → same hue on every render and every chart, even for names
// dictation invents. Computed live (not read off TrackDef.color) so it
// re-derives for the parchment ground the moment the theme toggle flips,
// rather than freezing at whatever theme was active on page load.
export function colorForTrack(name: string): string {
  const def = defForName(name)
  const group = paletteGroup(def ? def.group : groupForTrack(name))
  return paletteColor(name, group, isLight())
}

export function labelForTrack(name: string): string {
  return defForName(name)?.label ?? name.replace(/\b\w/g, (c) => c.toUpperCase())
}

// Whether low values are the good outcome — drives the reversed Y axis.
// Anything Claude filed as a symptom counts, even without an explicit definition.
export function isLowerBetter(name: string, category?: string | null): boolean {
  return defForName(name)?.lowerIsBetter ?? category === 'symptom'
}

export function groupForTrack(name: string, category?: string | null): MetricGroup {
  const def = defForName(name)
  if (def) return def.group
  if (category === 'symptom') return 'symptom'
  if (category === 'practice') return 'practice'
  if (category === 'activity') return 'movement'
  return 'other'
}

// Slider bounds for a name, falling back to sensible defaults by category so an
// ad-hoc track ("kite surfing") still gets a usable slider.
export function scaleForTrack(name: string, category?: string | null): { unit: string; min: number; max: number; step: number } {
  const def = defForName(name)
  if (def) return { unit: def.unit, min: def.min, max: def.max, step: def.step }
  if (category === 'symptom') return { unit: '/10', min: 0, max: 10, step: 1 }
  if (category === 'measurement') return { unit: '', min: 0, max: 200, step: 1 }
  return { unit: 'min', min: 0, max: 180, step: 5 }
}

// Items offered in the Log tab quick-add and the Insights tap-to-log sheet.
export const QUICK_LOG_KEYS = [
  'exercise', 'dancing', 'biking', 'walking', 'running', 'stretching', 'swimming', 'yoga',
  'meditation', 'breath work',
  'knee pain', 'wrist pain', 'back pain', 'shoulder pain', 'stomach pain',
  'infection', 'stool',
  'release',
] as const

export const QUICK_LOG_ITEMS: TrackDef[] = QUICK_LOG_KEYS
  .map((k) => TRACK_DEFS.find((d) => d.key === k))
  .filter((d): d is TrackDef => d != null)

// The tracks.category value to store for a given definition.
export function categoryForDef(def: TrackDef): string {
  if (storeForDef(def) !== 'tracks') return 'wellbeing' // never actually written to tracks
  if (def.group === 'symptom') return 'symptom'
  if (def.group === 'practice') return 'practice'
  if (def.group === 'movement') return 'activity'
  if (def.group === 'wellbeing') return 'release'
  return 'other'
}

// Always shown in the Log tab's quick-entry panel, whether or not they've been
// logged recently — the daily questions worth a one-tap answer.
// Deliberately NOT in QUICK_LOG_KEYS: that list seeds the Insights "Tap to log"
// grid, which is for the open-ended `tracks` metrics. These three have their own
// dedicated charts and are reachable from those charts' legends instead.
export const PINNED_QUICK_ENTRY_KEYS = ['energy', 'mood', 'stress'] as const

export const PINNED_QUICK_ENTRY_ITEMS: TrackDef[] = PINNED_QUICK_ENTRY_KEYS
  .map((k) => TRACK_DEFS.find((d) => d.key === k))
  .filter((d): d is TrackDef => d != null)
