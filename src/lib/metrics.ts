// Single source of truth for how a tracked thing is named, coloured, scaled and
// oriented. Insights charts, the tap-to-log sheet and the Log tab quick-add all
// read from here, so a colour or a slider range is defined exactly once.
//
// Orientation rule (locked 2026-07-21): GOOD IS ALWAYS AT THE TOP. Metrics where a
// low number is the good outcome (pain, stress, illness, release) set
// `lowerIsBetter` and render on a reversed Y axis.

export type MetricGroup = 'practice' | 'movement' | 'symptom' | 'wellbeing' | 'other'

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
}

// Colours are dark-surface validated and follow series identity, never rank, so
// the same activity is always the same hue across every chart.
export const TRACK_DEFS: TrackDef[] = [
  // --- movement & exercise (minutes) ---
  { key: 'exercise', label: 'Exercise', match: /workout|strength|gym|exercise|training/i, color: '#eab308', group: 'movement', unit: 'min', min: 0, max: 180, step: 5 },
  { key: 'dancing', label: 'Dancing', match: /danc/i, color: '#3987e5', group: 'movement', unit: 'min', min: 0, max: 180, step: 5 },
  { key: 'biking', label: 'Biking', match: /bik|cycl/i, color: '#22c55e', group: 'movement', unit: 'min', min: 0, max: 180, step: 5 },
  { key: 'walking', label: 'Walking', match: /walk|hike|hiking/i, color: '#14b8a6', group: 'movement', unit: 'min', min: 0, max: 180, step: 5 },
  { key: 'running', label: 'Running', match: /run|jog/i, color: '#fb7185', group: 'movement', unit: 'min', min: 0, max: 180, step: 5 },
  { key: 'stretching', label: 'Stretching', match: /stretch|mobility/i, color: '#f97316', group: 'movement', unit: 'min', min: 0, max: 120, step: 5 },
  { key: 'swimming', label: 'Swimming', match: /swim/i, color: '#06b6d4', group: 'movement', unit: 'min', min: 0, max: 180, step: 5 },
  { key: 'yoga', label: 'Yoga', match: /yoga/i, color: '#c084fc', group: 'movement', unit: 'min', min: 0, max: 120, step: 5 },

  // --- practices (minutes) ---
  { key: 'meditation', label: 'Meditation', match: /medit/i, color: '#a78bfa', group: 'practice', unit: 'min', min: 0, max: 120, step: 5 },
  { key: 'breath work', label: 'Breath work', match: /breath/i, color: '#2dd4bf', group: 'practice', unit: 'min', min: 0, max: 120, step: 5 },

  // --- symptoms (0-10, low is good → reversed axis) ---
  { key: 'knee pain', label: 'Knee pain', match: /knee/i, color: '#ef4444', group: 'symptom', unit: '/10', min: 0, max: 10, step: 1, lowerIsBetter: true },
  { key: 'wrist pain', label: 'Wrist pain', match: /wrist/i, color: '#f97316', group: 'symptom', unit: '/10', min: 0, max: 10, step: 1, lowerIsBetter: true },
  { key: 'back pain', label: 'Back pain', match: /back/i, color: '#d55181', group: 'symptom', unit: '/10', min: 0, max: 10, step: 1, lowerIsBetter: true },
  { key: 'shoulder pain', label: 'Shoulder pain', match: /shoulder/i, color: '#e66767', group: 'symptom', unit: '/10', min: 0, max: 10, step: 1, lowerIsBetter: true },
  { key: 'stomach pain', label: 'Stomach pain', match: /stomach|belly|gut|abdom/i, color: '#d95926', group: 'symptom', unit: '/10', min: 0, max: 10, step: 1, lowerIsBetter: true },

  // --- measurements ---
  { key: 'weight', label: 'Weight', match: /weight/i, color: '#38bdf8', group: 'other', unit: 'kg', min: 40, max: 150, step: 1 },

  // --- release (10% steps; 0% at top, 100% at bottom) ---
  { key: 'release', label: 'Release 💦', match: /release/i, color: '#ec4899', group: 'wellbeing', unit: '%', min: 0, max: 100, step: 10, lowerIsBetter: true },
]

// Fallback hues for names with no explicit definition, so an unknown track still
// gets a stable colour rather than a random one per render.
const FALLBACK = ['#3987e5', '#199e70', '#c98500', '#008300', '#9085e9', '#e66767', '#d55181', '#d95926']

export function defForName(name: string): TrackDef | undefined {
  const n = name.trim().toLowerCase()
  return TRACK_DEFS.find((d) => d.key === n) ?? TRACK_DEFS.find((d) => d.match.test(n))
}

// Stable colour for any track name: its definition's colour, else a hash into the
// fallback palette (same name → same hue on every render and every chart).
export function colorForTrack(name: string): string {
  const def = defForName(name)
  if (def) return def.color
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return FALLBACK[h % FALLBACK.length]
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
  'release',
] as const

export const QUICK_LOG_ITEMS: TrackDef[] = QUICK_LOG_KEYS
  .map((k) => TRACK_DEFS.find((d) => d.key === k))
  .filter((d): d is TrackDef => d != null)

// The tracks.category value to store for a given definition.
export function categoryForDef(def: TrackDef): string {
  if (def.group === 'symptom') return 'symptom'
  if (def.group === 'practice') return 'practice'
  if (def.group === 'movement') return 'activity'
  if (def.group === 'wellbeing') return 'release'
  return 'other'
}
