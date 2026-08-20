// Metrics Immanuel defines himself, without a code change.
//
// Stored as JSON in the `meta` table rather than localStorage, for the same reason
// hidden_metrics and the collapsed-group state are (see lib/hiddenMetrics.ts): it
// syncs to the phone via Dropbox and survives an export/import. A category invented
// on the laptop has to exist on the phone.
//
// These are an OVERLAY on the hardcoded registry, not a replacement. metrics.ts
// keeps TRACK_DEFS as the built-in list and merges these in through
// setCustomTrackDefs(); everything downstream — scaleForTrack, colorForTrack,
// rollupFor, canonicalTrackName, storeForName — already routes through defForName,
// so a custom metric behaves like a built-in one for free.
//
// Direction of imports is customMetrics -> metrics, never the reverse: db/queries
// imports metrics, so a metrics -> customMetrics -> queries edge would close a
// cycle. The registry is pushed, not pulled.

import { getMeta, setMeta } from '../db/queries'
import { colorForTrack as paletteColor } from './palette'
import { setCustomTrackDefs, paletteGroup, TRACK_DEFS, type MetricGroup, type MetricKind, type TrackDef, type DisplayUnit } from './metrics'

const KEY = 'custom_metrics'

// The four shapes a self-defined metric can take. Deliberately a short list: these
// cover what he actually tracks, and every extra option is one more decision in the
// way of writing down a number.
export type MetricShape = 'duration' | 'rating' | 'checkmark' | 'number'

export interface CustomMetricSpec {
  key: string // canonical, lowercase — also the stored tracks.name
  label: string
  group: MetricGroup
  shape: MetricShape
  lowerIsBetter?: boolean
  // Whether to also ask Low / Med / High. Asked for explicitly when adding, because
  // "how hard" is a real question for a workout and a meaningless one for a weight.
  // Undefined means "never chose" — for a duration that still defaults to true.
  hasIntensity?: boolean
  // Only meaningful when shape === 'duration'. 'h' reuses the exact same
  // store-in-minutes-show-in-hours mechanism Computer Time uses (see metrics.ts's
  // TrackDef.display) — screen time and similar things are thought of in hours, and
  // a 0-180 slider in 5-minute steps is the wrong control for them.
  durationUnit?: 'min' | 'h'
  // A catalogue name from metricIcons.tsx, or an 'emoji:🪁' string.
  icon?: string
}

export const SHAPE_LABEL: Record<MetricShape, string> = {
  duration: 'Duration (min)',
  rating: 'Rating 0–10',
  checkmark: 'Yes / no',
  number: 'Number',
}

interface Scale {
  unit: string
  min: number
  max: number
  step: number
  kind?: MetricKind
  quickStep?: number
  display?: DisplayUnit
}

const SHAPE_SCALE: Record<MetricShape, Scale> = {
  duration: { unit: 'min', min: 0, max: 180, step: 5 },
  rating: { unit: '/10', min: 0, max: 10, step: 1 },
  checkmark: { unit: '', min: 0, max: 1, step: 1, kind: 'bool' },
  number: { unit: '', min: 0, max: 200, step: 1 },
}

// Same numbers Computer Time (metrics.ts) already ships with: a 12h ceiling, since
// the ordinary 180-minute duration cap would clip a normal working day at lunch,
// and a half-hour display step since nobody tracks phone use to the minute.
const HOURS_SCALE: Scale = {
  unit: 'min', min: 0, max: 720, step: 30, quickStep: 30,
  display: { unit: 'h', per: 60, step: 0.5 },
}

export function canonicalKey(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, ' ')
}

const BUILTIN_KEYS = new Set(TRACK_DEFS.map((d) => d.key))

export function isBuiltinKey(key: string): boolean {
  return BUILTIN_KEYS.has(key)
}

// Regex-escaped exact match on the key. A custom metric must NOT fuzzy-match its
// way onto unrelated dictated names — "water" should not swallow "water sports".
function matcherFor(key: string): RegExp {
  return new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
}

function toDef(spec: CustomMetricSpec): TrackDef {
  const scale = spec.shape === 'duration' && spec.durationUnit === 'h' ? HOURS_SCALE : SHAPE_SCALE[spec.shape]
  return {
    key: spec.key,
    label: spec.label,
    match: matcherFor(spec.key),
    color: paletteColor(spec.key, paletteGroup(spec.group)),
    group: spec.group,
    unit: scale.unit,
    min: scale.min,
    max: scale.max,
    step: scale.step,
    kind: scale.kind,
    quickStep: scale.quickStep,
    display: scale.display,
    lowerIsBetter: spec.lowerIsBetter,
    // An hours-based duration defaults OFF: screen time has no "how hard" the way a
    // workout does. He can still turn it on — the sheet's checkbox is explicit,
    // this is only the default it opens with.
    hasIntensity: spec.hasIntensity ?? (spec.shape === 'duration' && spec.durationUnit !== 'h'),
    icon: spec.icon,
    // Checkmarks and one-off numbers are point-in-time readings: two entries on a
    // day don't add up and don't average. Durations sum, ratings average — the
    // defaults rollupFor() derives from the unit are already right for those.
    rollup: spec.shape === 'checkmark' || spec.shape === 'number' ? 'last' : undefined,
  }
}

function parse(raw: string | null): CustomMetricSpec[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((x): x is CustomMetricSpec => {
        const s = x as CustomMetricSpec
        return !!s && typeof s.key === 'string' && !!s.key && typeof s.label === 'string' && s.shape in SHAPE_SCALE
      })
      // A custom metric can never shadow a built-in one: the built-in wins in
      // defForName anyway, and a duplicate would render the row twice.
      .filter((s) => !BUILTIN_KEYS.has(s.key))
  } catch {
    return []
  }
}

export function customMetricSpecs(): CustomMetricSpec[] {
  return parse(getMeta(KEY))
}

export function isCustomMetric(key: string): boolean {
  return customMetricSpecs().some((s) => s.key === key)
}

// Read the stored specs and hand them to the registry. Called once at boot (after
// initDb, since it reads the database) and again after every change.
export function loadCustomMetrics(): CustomMetricSpec[] {
  const specs = customMetricSpecs()
  setCustomTrackDefs(specs.map(toDef))
  return specs
}

export async function addCustomMetric(spec: Omit<CustomMetricSpec, 'key'>): Promise<CustomMetricSpec[]> {
  const key = canonicalKey(spec.label)
  if (!key || BUILTIN_KEYS.has(key)) return loadCustomMetrics()
  const next = customMetricSpecs().filter((s) => s.key !== key)
  next.push({ ...spec, key, label: spec.label.trim() })
  await setMeta(KEY, JSON.stringify(next))
  return loadCustomMetrics()
}

// Forgets the DEFINITION only. Any history logged under this name stays in `tracks`
// and keeps its Insights chart, matching the hide-scope decision recorded at the top
// of lib/hiddenMetrics.ts — removing a category means "stop asking me for this",
// never "delete what I already recorded".
export async function removeCustomMetric(key: string): Promise<CustomMetricSpec[]> {
  const next = customMetricSpecs().filter((s) => s.key !== key)
  await setMeta(KEY, next.length ? JSON.stringify(next) : null)
  return loadCustomMetrics()
}
