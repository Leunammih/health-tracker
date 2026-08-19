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
  // How several same-day segment entries (morning/afternoon/evening) combine into
  // the day's rollup value. Defaults by unit — see rollupFor() — so this only needs
  // to be set explicitly where that default would be wrong.
  rollup?: Rollup
  // The tracks.category value to store. Defaults from `group` (see categoryForDef);
  // set it where the group doesn't determine the category — 'release' and the other
  // wellbeing-group tracks share a group but are not the same category.
  category?: string
  // Which glyph in components/metricIcons.tsx to draw. Defaults to `key`, so a
  // registered metric only needs this when it borrows another metric's icon —
  // which is the normal case for user-defined metrics (Phase G-2).
  icon?: string
  // 'bool' renders a checkmark toggle instead of a slider and stores 0/1. Some
  // things are a yes/no, not a quantity — a warming bottle at night either was
  // needed or wasn't, and a 0-10 slider for it is not a question with an answer.
  kind?: MetricKind
  // How much one tap of the "Quick log" chip adds. Defaults to `step`; set it where
  // the slider's step is too fine to tap up to a realistic total (a working day of
  // computer time in 5-minute taps is 96 taps).
  quickStep?: number
  // Show and edit this metric in a different unit from the one it is STORED in.
  // Computer time is stored in minutes like every other duration — so it sums,
  // charts and compares with them — but eight hours at a desk is a number you think
  // in hours, and a 0-720 slider in 5-minute steps is 144 notches of nothing.
  display?: DisplayUnit
  // Whether this metric also asks Low / Med / High. Defaults to true for durations
  // (minutes say how long, not how hard). Set it explicitly where that default is
  // wrong in either direction — release is not measured in minutes but the question
  // still applies.
  hasIntensity?: boolean
}

// `per` is how many STORED units make one displayed unit: minutes -> hours is 60.
export interface DisplayUnit {
  unit: string
  per: number
  step: number
}

export type MetricKind = 'scale' | 'bool'

export type Rollup = 'sum' | 'avg' | 'last'

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

  // Screen time. max 720 (12 h), not the 180 the movement metrics use — that would
  // clip an ordinary working day at lunchtime. quickStep 30, because tapping a
  // working day up in 5-minute increments is nearly a hundred taps.
  // Stored in minutes like every other duration (so the rollup and the charts work
  // the same way), shown and edited in hours to the half hour.
  { key: 'computer time', label: 'Computer time', match: /computer time|screen time|laptop time|at the (computer|desk)/i, color: paletteColor('computer time', 'movement'), group: 'other', unit: 'min', min: 0, max: 720, step: 30, quickStep: 30, rollup: 'sum', display: { unit: 'h', per: 60, step: 0.5 }, hasIntensity: false },

  // --- practices (minutes) ---
  { key: 'meditation', label: 'Meditation', match: /medit/i, color: paletteColor('meditation', 'practice'), group: 'practice', unit: 'min', min: 0, max: 120, step: 5 },
  { key: 'breath work', label: 'Breath work', match: /breath/i, color: paletteColor('breath work', 'practice'), group: 'practice', unit: 'min', min: 0, max: 120, step: 5 },

  // --- symptoms (0-10, low is good → reversed axis) ---
  { key: 'knee pain', label: 'Knee pain', match: /knee/i, color: paletteColor('knee pain', 'symptom'), group: 'symptom', unit: '/10', min: 0, max: 10, step: 1, lowerIsBetter: true },
  { key: 'wrist pain', label: 'Wrist pain', match: /wrist/i, color: paletteColor('wrist pain', 'symptom'), group: 'symptom', unit: '/10', min: 0, max: 10, step: 1, lowerIsBetter: true },
  { key: 'back pain', label: 'Back pain', match: /back/i, color: paletteColor('back pain', 'symptom'), group: 'symptom', unit: '/10', min: 0, max: 10, step: 1, lowerIsBetter: true },
  { key: 'shoulder pain', label: 'Shoulder pain', match: /shoulder/i, color: paletteColor('shoulder pain', 'symptom'), group: 'symptom', unit: '/10', min: 0, max: 10, step: 1, lowerIsBetter: true },
  { key: 'stomach pain', label: 'Stomach pain', match: /stomach|belly|gut|abdom/i, color: paletteColor('stomach pain', 'symptom'), group: 'symptom', unit: '/10', min: 0, max: 10, step: 1, lowerIsBetter: true },
  // Post-exertion soreness and stiffness are the app's central open question, so they
  // are registered rather than left to the ad-hoc fallback — they arrive from dictation
  // constantly and must never be scaled in minutes.
  // The matches stay narrow on purpose: "neck stiffness" or "sore throat" should keep
  // its own name rather than be relabelled "Muscle stiffness" — the ad-hoc fallback in
  // scaleForTrack() already gives those a 0-10 slider.
  { key: 'muscle soreness', label: 'Muscle soreness', match: /muscle sore|doms/i, color: paletteColor('muscle soreness', 'symptom'), group: 'symptom', unit: '/10', min: 0, max: 10, step: 1, lowerIsBetter: true },
  { key: 'muscle stiffness', label: 'Muscle stiffness', match: /muscle stiff/i, color: paletteColor('muscle stiffness', 'symptom'), group: 'symptom', unit: '/10', min: 0, max: 10, step: 1, lowerIsBetter: true },
  { key: 'headache', label: 'Headache', match: /headache|migraine/i, color: paletteColor('headache', 'symptom'), group: 'symptom', unit: '/10', min: 0, max: 10, step: 1, lowerIsBetter: true },
  { key: 'nausea', label: 'Nausea', match: /nausea|queasy/i, color: paletteColor('nausea', 'symptom'), group: 'symptom', unit: '/10', min: 0, max: 10, step: 1, lowerIsBetter: true },
  { key: 'fatigue', label: 'Fatigue', match: /fatigue|exhaustion/i, color: paletteColor('fatigue', 'symptom'), group: 'symptom', unit: '/10', min: 0, max: 10, step: 1, lowerIsBetter: true },
  { key: 'brain fog', label: 'Brain fog', match: /brain fog|foggy/i, color: paletteColor('brain fog', 'symptom'), group: 'symptom', unit: '/10', min: 0, max: 10, step: 1, lowerIsBetter: true },

  // --- illness (manual tap-to-log; merged into the Illness & gut chart in
  // InsightsTab.tsx alongside the AI-diary-extracted infections/gut_events data) ---
  { key: 'infection', label: 'Infection', match: /infection/i, color: paletteColor('infection', 'symptom'), group: 'symptom', unit: '/10', min: 0, max: 10, step: 1, lowerIsBetter: true },
  // Key stays "stool" (not "stool consistency") so it reuses the same palette.ts KNOWN
  // colour as the Illness & gut chart's own "Stool" series — same metric, same hue.
  // step 0.5: real stools land between two Bristol pictures more often than on one,
  // and rounding to the nearer whole type throws away the only distinction that
  // matters on a scale this short.
  // A yes/no, not a rating — see MetricKind. It shares the day with the
  // dictation-extracted gut_events.warming_bottle_needed flag; the Insights stat
  // tile counts the union of both so the two entry paths can't disagree.
  { key: 'warming bottle', label: 'Warming bottle', match: /warming bottle|hot water bottle|w(a|ä)rmflasche/i, color: paletteColor('warming bottle', 'symptom'), group: 'symptom', unit: '', min: 0, max: 1, step: 1, kind: 'bool', rollup: 'last', category: 'symptom' },

  { key: 'stool', label: 'Stool consistency', match: /stool|bristol/i, color: paletteColor('stool', 'symptom'), group: 'symptom', unit: '', min: 1, max: 7, step: 0.5, rollup: 'last' },

  // --- measurements ---
  // rollup: 'last' is explicit (not just inherited from the 'kg'/'' unit default)
  // because averaging is actively wrong for both: two weigh-ins aren't a day-average
  // of a fluctuating state, and averaging a Bristol 2 and a 6 yields "normal" 4 — the
  // opposite of what happened.
  { key: 'weight', label: 'Weight', match: /weight/i, color: paletteColor('weight', 'symptom'), group: 'other', unit: 'kg', min: 40, max: 150, step: 1, rollup: 'last' },

  // --- energy & mood (0-10, high is good). Stored on the `wellbeing` table, not
  // `tracks`; colours match the existing "Energy & mood" chart in InsightsTab. ---
  { key: 'energy', label: 'Energy', match: /^energy$/i, color: paletteColor('energy', 'wellbeing'), group: 'wellbeing', unit: '/10', min: 0, max: 10, step: 1, store: 'wellbeing' },
  { key: 'mood', label: 'Mood', match: /^mood$/i, color: paletteColor('mood', 'wellbeing'), group: 'wellbeing', unit: '/10', min: 0, max: 10, step: 1, store: 'wellbeing' },

  // --- subjective wellbeing ratings (0-10, high is good) ---
  { key: 'brain clarity', label: 'Brain clarity', match: /brain clarity|mental clarity|clarity/i, color: paletteColor('brain clarity', 'wellbeing'), group: 'wellbeing', unit: '/10', min: 0, max: 10, step: 1, category: 'wellbeing' },
  { key: 'focus', label: 'Focus', match: /^focus$|concentration/i, color: paletteColor('focus', 'wellbeing'), group: 'wellbeing', unit: '/10', min: 0, max: 10, step: 1, category: 'wellbeing' },

  // --- release (10% steps; 0% at top, 100% at bottom) ---
  // hasIntensity alongside the percentage, not instead of it: they are two different
  // questions, and the stored % history stays comparable.
  { key: 'release', label: 'Release 💦', match: /release/i, color: paletteColor('release', 'wellbeing'), group: 'wellbeing', unit: '%', min: 0, max: 100, step: 10, lowerIsBetter: true, category: 'release', hasIntensity: true },

  // --- stress (0-10, low is good). Stored on `day_context.stress_load`, which the
  // AI diary extraction also writes; the quick entry keeps its note in a dedicated
  // stress_notes column so the day-level diary note survives. ---
  { key: 'stress', label: 'Stress', match: /^stress$/i, color: paletteColor('stress', 'wellbeing'), group: 'wellbeing', unit: '/10', min: 0, max: 10, step: 1, lowerIsBetter: true, store: 'day_context' },
]

// ---- User-defined metrics ----
// Custom metrics are kept in the `meta` table (see lib/customMetrics.ts) and pushed
// in here at boot rather than imported: metrics.ts is imported BY db/queries.ts, so
// reaching back into queries from this file would close an import cycle. Inverting
// it — the store registers itself with the registry — keeps the dependency one-way.
let customDefs: TrackDef[] = []

export function setCustomTrackDefs(defs: TrackDef[]): void {
  customDefs = defs
}

// Built-ins first, then the user's own. Order matters: it is the display order in
// the Log tab (see DEF_INDEX in QuickEntryPanel), so a new custom metric lands at
// the bottom of its group rather than shuffling the familiar rows around.
export function allTrackDefs(): TrackDef[] {
  return customDefs.length ? [...TRACK_DEFS, ...customDefs] : TRACK_DEFS
}

// Resolve a free-form name to its definition. The fuzzy regex pass deliberately
// SKIPS defs stored outside `tracks`: this runs against arbitrary names read out of
// the `tracks` table, and a track happening to be called "energy" or "stress" must
// not be routed to the wellbeing/day_context tables. Only an exact key match reaches those.
export function defForName(name: string): TrackDef | undefined {
  const n = name.trim().toLowerCase()
  const defs = allTrackDefs()
  return (
    defs.find((d) => d.key === n) ??
    defs.find((d) => storeForDef(d) === 'tracks' && d.match.test(n))
  )
}

// Whether this metric is a yes/no toggle rather than a slider.
export function kindForTrack(name: string): MetricKind {
  return defForName(name)?.kind ?? 'scale'
}

// How much one tap of a Quick log chip adds.
export function quickStepFor(def: TrackDef): number {
  return def.quickStep ?? def.step
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

export type Scale = { unit: string; min: number; max: number; step: number; display?: DisplayUnit }

// ---- Display units ----
// Everything below the UI works in STORED units. These three are the only places a
// conversion happens, so a metric shown in hours is still summed, charted, rolled up
// and exported in minutes like its neighbours.

// The scale as a control should present it. Identity for metrics with no display unit.
export function displayScale(scale: Scale): Scale {
  const d = scale.display
  if (!d) return scale
  return { unit: d.unit, min: scale.min / d.per, max: scale.max / d.per, step: d.step }
}

export function toDisplay(stored: number, scale: Scale): number {
  return scale.display ? stored / scale.display.per : stored
}

export function fromDisplay(shown: number, scale: Scale): number {
  return scale.display ? Math.round(shown * scale.display.per) : shown
}

// One number, rendered the way this metric should read. Half-steps (Bristol 4.5,
// 7.5 hours) and segment-rollup floats both land here.
export function formatValue(stored: number, scale: Scale): string {
  return String(Math.round(toDisplay(stored, scale) * 10) / 10)
}

// Whether the Low / Med / High control belongs on this metric.
export function hasIntensity(name: string): boolean {
  const def = defForName(name)
  if (def?.hasIntensity != null) return def.hasIntensity
  return (def ? def.unit : scaleForTrack(name, null).unit) === 'min'
}

const RATING_SCALE: Scale = { unit: '/10', min: 0, max: 10, step: 1 }
const DURATION_SCALE: Scale = { unit: 'min', min: 0, max: 180, step: 5 }
const MEASUREMENT_SCALE: Scale = { unit: '', min: 0, max: 200, step: 1 }

// Names that describe how something FELT — always a 0-10 intensity, never minutes.
// Checked before the category, because dictation regularly files "muscle soreness"
// or "brain clarity" under a category that says nothing about the scale.
const RATING_NAME =
  /pain|ache|aching|sore|stiff|cramp|tension|tight|nausea|fatigue|exhaust|dizz|fog|clarity|focus|concentration|quality|mood|stress|anxiet|calm|craving|bloat|itch|congest|cough|libido/i

// Names that genuinely measure a duration.
const DURATION_NAME =
  /surf|swim|danc|run|jog|walk|hike|bik|cycl|climb|row|skat|ski|paddle|sauna|plunge|medit|breath|yoga|stretch|mobility|workout|training|gym|massage|nap|reading/i

// Slider bounds for a name. Registered metrics come straight from the registry;
// anything dictation invents ("kite surfing", "brain clarity") is inferred.
//
// The default for an unrecognised name is a 0-10 INTENSITY, not minutes. Minutes
// used to be the catch-all, which is why ad-hoc symptom-like tracks showed up in the
// Log tab as "0 min" sliders running to 180 — a duration is the narrower case, so it
// now has to be positively identified (by category or by name) rather than assumed.
export function scaleForTrack(name: string, category?: string | null): Scale {
  const def = defForName(name)
  if (def) return { unit: def.unit, min: def.min, max: def.max, step: def.step, display: def.display }

  const n = name.trim().toLowerCase()
  if (category === 'measurement') return MEASUREMENT_SCALE
  if (category === 'symptom' || RATING_NAME.test(n)) return RATING_SCALE
  if (category === 'activity' || category === 'practice' || DURATION_NAME.test(n)) return DURATION_SCALE
  return RATING_SCALE
}

// Keep a value inside its slider's range. Needed on read, not just on write: a track
// saved under the old minutes fallback can hold 45 for something now scaled 0-10, and
// an out-of-range `value` silently pins an <input type="range"> at its max while
// displaying the stored number — a slider that disagrees with its own label.
export function clampToScale(value: number, scale: Scale): number {
  return Math.min(scale.max, Math.max(scale.min, value))
}

// How several same-day segment entries combine into the day's rollup. An explicit
// TrackDef.rollup wins; otherwise derived from the unit, via scaleForTrack so an
// ad-hoc dictated name still gets sensible behaviour: minutes sum, 0-10/percent
// scores average, anything else (a bare number, a measurement) takes the last entry
// rather than blending readings that aren't meant to add or average.
export function rollupFor(name: string, category?: string | null): Rollup {
  const def = defForName(name)
  if (def?.rollup) return def.rollup
  const unit = scaleForTrack(name, category).unit
  if (unit === 'min') return 'sum'
  if (unit === '/10' || unit === '%') return 'avg'
  return 'last'
}

// Items offered in the Log tab quick-add and the Insights tap-to-log sheet.
export const QUICK_LOG_KEYS = [
  'exercise', 'dancing', 'biking', 'walking', 'running', 'stretching', 'swimming', 'yoga',
  'meditation', 'breath work',
  'knee pain', 'wrist pain', 'back pain', 'shoulder pain', 'stomach pain',
  'infection', 'stool', 'warming bottle',
  'computer time',
  'release',
] as const

export const QUICK_LOG_ITEMS: TrackDef[] = QUICK_LOG_KEYS
  .map((k) => TRACK_DEFS.find((d) => d.key === k))
  .filter((d): d is TrackDef => d != null)

// The tracks.category value to store for a given definition.
export function categoryForDef(def: TrackDef): string {
  if (def.category) return def.category
  if (storeForDef(def) !== 'tracks') return 'wellbeing' // never actually written to tracks
  if (def.group === 'symptom') return 'symptom'
  if (def.group === 'practice') return 'practice'
  if (def.group === 'movement') return 'activity'
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
