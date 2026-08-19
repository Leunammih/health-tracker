// One glyph per tracked metric, so a row is identifiable at a glance instead of by
// reading its label. Hand-drawn inline SVG in the same style as icons.tsx (24x24,
// stroke-only, currentColor) rather than an icon package — the app ships no icon
// dependency and these need to sit next to the existing nav glyphs without looking
// borrowed.
//
// Resolution order (see MetricIcon below): the metric's own glyph → its group's
// glyph → nothing. The group fallback is what makes this work for names dictation
// invents ("kite surfing" gets the movement glyph), so a new metric never renders
// as a blank square.
//
// Direction of dependency is metricIcons -> metrics, never the reverse: lib/ stays
// free of anything that imports React components.
import type { SVGProps } from 'react'
import { defForName, groupForTrack, type MetricGroup } from '../lib/metrics'

type Glyph = (p: SVGProps<SVGSVGElement>) => JSX.Element

const base = (props: SVGProps<SVGSVGElement>) => ({
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  ...props,
})

// A short burst of rays, reused by the pain glyphs so "this one hurts" reads the
// same way across all of them.
const rays = (
  <path d="M17.5 3.5l1.8-1.8M19.5 7.5h2.6M17 10.8l2.4.9" />
)

// ---- movement ----
const Exercise: Glyph = (p) => (
  <svg {...base(p)}><path d="M4 9v6M7.5 6.5v11M16.5 6.5v11M20 9v6M7.5 12h9" /></svg>
)
const Dancing: Glyph = (p) => (
  <svg {...base(p)}><path d="M9 17.5V5l10-2v12" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="16.5" cy="17" r="2.5" /></svg>
)
const Biking: Glyph = (p) => (
  <svg {...base(p)}><circle cx="5.5" cy="17" r="3.5" /><circle cx="18.5" cy="17" r="3.5" /><path d="M5.5 17l4-7.5h5L12 17M8 9.5h3M14.5 9.5l4 7.5" /></svg>
)
const Walking: Glyph = (p) => (
  <svg {...base(p)}>
    <path d="M7 3.5c1.5 0 2.4 1.4 2.4 3.4 0 2.3-.7 4-2.4 4s-2.4-1.7-2.4-4C4.6 4.9 5.5 3.5 7 3.5Z" />
    <path d="M5.2 13h3.6" />
    <path d="M17 9.5c1.5 0 2.4 1.4 2.4 3.4 0 2.3-.7 4-2.4 4s-2.4-1.7-2.4-4c0-2 .9-3.4 2.4-3.4Z" />
    <path d="M15.2 19h3.6" />
  </svg>
)
const Running: Glyph = (p) => (
  <svg {...base(p)}><circle cx="16" cy="4.5" r="2" /><path d="M16 8l-4.5 3 3.5 2.5-1.5 5.5M11.5 11L8 9.5M15 13.5l4.5 2.5M2.5 7.5h3.5M1.5 11.5h4M3.5 15.5h3" /></svg>
)
const Stretching: Glyph = (p) => (
  <svg {...base(p)}><path d="M4 16.5C6.5 8.5 17.5 8.5 20 16.5" /><path d="M4 16.5l-1.5-2.8M4 16.5l3-.6M20 16.5l1.5-2.8M20 16.5l-3-.6" /></svg>
)
const Swimming: Glyph = (p) => (
  <svg {...base(p)}><circle cx="7" cy="6" r="2" /><path d="M9 8l4.5-1.5L18 10" /><path d="M2 15.5q2.5-2.5 5 0t5 0t5 0t5 0" /><path d="M2 20q2.5-2.5 5 0t5 0t5 0t5 0" /></svg>
)
const Yoga: Glyph = (p) => (
  <svg {...base(p)}><circle cx="12" cy="4" r="2" /><path d="M12 6.5v5.5M12 12L6 19.5M12 12l6 7.5M5 11.5h14" /></svg>
)
const ComputerTime: Glyph = (p) => (
  <svg {...base(p)}><rect x="2.5" y="4" width="19" height="12" rx="2" /><path d="M9 20.5h6M12 16v4.5" /></svg>
)

// ---- practice ----
const Meditation: Glyph = (p) => (
  <svg {...base(p)}><circle cx="12" cy="4.5" r="2.2" /><path d="M12 7.5v4.5" /><path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" /><path d="M5.5 19.5h13" /></svg>
)
const BreathWork: Glyph = (p) => (
  <svg {...base(p)}><circle cx="12" cy="10" r="2.2" /><path d="M6.8 10a5.2 5.2 0 0 1 10.4 0" /><path d="M3 10a9 9 0 0 1 18 0" /><path d="M12 14.5V21M9.5 18.5L12 21l2.5-2.5" /></svg>
)

// ---- symptoms ----
const KneePain: Glyph = (p) => (
  <svg {...base(p)}><path d="M8 3v6" /><circle cx="8" cy="12" r="2.6" /><path d="M9 14.5l3.5 6.5" />{rays}</svg>
)
const WristPain: Glyph = (p) => (
  <svg {...base(p)}><path d="M3 19l4.5-4.5" /><circle cx="9.5" cy="12.5" r="2.4" /><path d="M11 10.8l3.5-3.5M12.5 14l4.5-1.5M11.5 14.8l3 2.5" /></svg>
)
const BackPain: Glyph = (p) => (
  <svg {...base(p)}><path d="M12 2.5v19" /><path d="M9 6h6M9 10h6M9 14h6M9 18h6" />{rays}</svg>
)
const ShoulderPain: Glyph = (p) => (
  <svg {...base(p)}><circle cx="8" cy="8.5" r="2.6" /><path d="M10 10.5L15 14v7" /><path d="M6 11C4.5 13.5 4 16.5 4 21" />{rays}</svg>
)
const StomachPain: Glyph = (p) => (
  <svg {...base(p)}>
    <path d="M12 3c-4.3 0-7.2 3.6-7.2 8.6S7.7 21 12 21s7.2-4.4 7.2-9.4S16.3 3 12 3Z" />
    <path d="M8.5 11q1.75-2 3.5 0t3.5 0" /><path d="M8.5 15q1.75-2 3.5 0t3.5 0" />
  </svg>
)
const MuscleSoreness: Glyph = (p) => (
  <svg {...base(p)}><path d="M3 20v-4.5c0-3.6 2.9-6.5 6.5-6.5H12" /><path d="M12 9c3.3 0 5.5 2.2 5.5 4.8S15.3 19 12 19H9" />{rays}</svg>
)
const MuscleStiffness: Glyph = (p) => (
  <svg {...base(p)}><path d="M3 20v-4.5c0-3.6 2.9-6.5 6.5-6.5H12" /><path d="M12 9c3.3 0 5.5 2.2 5.5 4.8S15.3 19 12 19H9" /><path d="M14.5 3.5v6M11.5 6.5h6" /></svg>
)
const Headache: Glyph = (p) => (
  <svg {...base(p)}><circle cx="12" cy="12.5" r="7.5" /><path d="M13.5 7.5L10 13h3.5L11 18.5" /></svg>
)
const Nausea: Glyph = (p) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><path d="M8.5 9.8h2M13.5 9.8h2" /><path d="M8 15.8q2-2 4 0t4 0" /></svg>
)
const Fatigue: Glyph = (p) => (
  <svg {...base(p)}><rect x="2.5" y="7.5" width="16" height="9" rx="2.5" /><path d="M21.5 11v2M6 11v2" /></svg>
)
const BrainFog: Glyph = (p) => (
  <svg {...base(p)}><path d="M7.5 16.5h8.5a4 4 0 0 0 .6-7.96A5.5 5.5 0 0 0 6.4 8.6 3.9 3.9 0 0 0 7.5 16.5Z" /><path d="M7.5 20.5h2.5M13.5 20.5h3.5" /></svg>
)
const Infection: Glyph = (p) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="5.2" /><path d="M12 6.8V2.8M12 21.2v-4M6.8 12H2.8M21.2 12h-4M8.3 8.3L5.5 5.5M18.5 18.5l-2.8-2.8M15.7 8.3l2.8-2.8M5.5 18.5l2.8-2.8" /></svg>
)
const Stool: Glyph = (p) => (
  <svg {...base(p)}><path d="M9.5 3.5h3.5a2.6 2.6 0 0 1 0 5.2H8a3.1 3.1 0 0 0 0 6.2h9a3.1 3.1 0 0 1 0 6.2H6" /></svg>
)
const WarmingBottle: Glyph = (p) => (
  <svg {...base(p)}><path d="M9.5 2.5h5v2.3c0 1.1 2.5 1.9 2.5 4.7v8.5a4 4 0 0 1-4 4h-2a4 4 0 0 1-4-4V9.5c0-2.8 2.5-3.6 2.5-4.7V2.5Z" /><path d="M9 12h6M9 15.5h6" /></svg>
)

// ---- wellbeing & measurements ----
const Energy: Glyph = (p) => (
  <svg {...base(p)}><path d="M13.5 2.5L4.5 14h6.5l-1 7.5L19 10h-6.5z" /></svg>
)
const Mood: Glyph = (p) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><path d="M8.8 9.8h.01M15.2 9.8h.01" /><path d="M8 14.5a5 5 0 0 0 8 0" /></svg>
)
const BrainClarity: Glyph = (p) => (
  <svg {...base(p)}><path d="M9 18.5h6M10 21.5h4" /><path d="M12 2.5A6.5 6.5 0 0 0 8.2 14.2c.6.5 1 1.3 1 2.1h5.6c0-.8.4-1.6 1-2.1A6.5 6.5 0 0 0 12 2.5Z" /></svg>
)
const Focus: Glyph = (p) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3.8" /><path d="M12 11.95h.01" /></svg>
)
const Release: Glyph = (p) => (
  <svg {...base(p)}><path d="M12 2.5s6.5 6.8 6.5 11a6.5 6.5 0 0 1-13 0c0-4.2 6.5-11 6.5-11Z" /></svg>
)
const Stress: Glyph = (p) => (
  <svg {...base(p)}><path d="M3.5 18.5a8.5 8.5 0 1 1 17 0" /><path d="M12 18.5l5-5.5" /><path d="M11.95 18.5h.01" /></svg>
)
const Sleep: Glyph = (p) => (
  <svg {...base(p)}><path d="M20.5 14.8A8.5 8.5 0 0 1 9.2 3.5 9 9 0 1 0 20.5 14.8Z" /></svg>
)
const Weight: Glyph = (p) => (
  <svg {...base(p)}><rect x="2.5" y="4.5" width="19" height="15" rx="3.5" /><path d="M12 15.5V12" /><path d="M8 12a4.5 4.5 0 0 1 8 0" /></svg>
)

// ---- group fallbacks ----
const GroupMovement: Glyph = (p) => (
  <svg {...base(p)}><path d="M4 7.5l4.5 4.5L4 16.5M11 7.5l4.5 4.5L11 16.5M18 7.5l3.5 4.5L18 16.5" /></svg>
)
const GroupPractice: Glyph = (p) => (
  <svg {...base(p)}><path d="M12 20.5c0-5 3.8-8.8 8.8-8.8 0 5-4.2 8.8-8.8 8.8Z" /><path d="M12 20.5c0-5-3.8-8.8-8.8-8.8 0 5 4.2 8.8 8.8 8.8Z" /><path d="M12 20.5v-8" /></svg>
)
const GroupSymptom: Glyph = (p) => (
  <svg {...base(p)}><path d="M2.5 12.5h4l3-7 4 14 3-7h5.5" /></svg>
)
const GroupWellbeing: Glyph = (p) => (
  <svg {...base(p)}><path d="M12 20.5S4.5 15.6 4.5 10.4A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 7.5 2.8c0 5.2-7.5 10.1-7.5 10.1Z" /></svg>
)
const GroupOther: Glyph = (p) => (
  <svg {...base(p)}><path d="M5.5 12h.01M12 12h.01M18.5 12h.01" /></svg>
)

// Keyed by TrackDef.key (or TrackDef.icon, for custom metrics that borrow one).
export const METRIC_GLYPHS: Record<string, Glyph> = {
  exercise: Exercise,
  dancing: Dancing,
  biking: Biking,
  walking: Walking,
  running: Running,
  stretching: Stretching,
  swimming: Swimming,
  yoga: Yoga,
  'computer time': ComputerTime,
  meditation: Meditation,
  'breath work': BreathWork,
  'knee pain': KneePain,
  'wrist pain': WristPain,
  'back pain': BackPain,
  'shoulder pain': ShoulderPain,
  'stomach pain': StomachPain,
  'muscle soreness': MuscleSoreness,
  'muscle stiffness': MuscleStiffness,
  headache: Headache,
  nausea: Nausea,
  fatigue: Fatigue,
  'brain fog': BrainFog,
  infection: Infection,
  stool: Stool,
  'warming bottle': WarmingBottle,
  energy: Energy,
  mood: Mood,
  'brain clarity': BrainClarity,
  focus: Focus,
  release: Release,
  stress: Stress,
  sleep: Sleep,
  weight: Weight,
}

export const GROUP_GLYPHS: Record<MetricGroup, Glyph> = {
  movement: GroupMovement,
  practice: GroupPractice,
  symptom: GroupSymptom,
  wellbeing: GroupWellbeing,
  other: GroupOther,
}

// Every icon name a custom metric is allowed to pick, in a stable order for the
// picker in the "add a category" sheet (Phase G-2).
export const GLYPH_NAMES = Object.keys(METRIC_GLYPHS)

export function glyphForTrack(name: string, category?: string | null): Glyph {
  const def = defForName(name)
  const g = (def?.icon && METRIC_GLYPHS[def.icon]) || (def && METRIC_GLYPHS[def.key])
  return g ?? GROUP_GLYPHS[groupForTrack(name, category)]
}

// The one way any consumer draws a metric's icon. `color` tints it with the
// metric's own hue so the icon carries the same identity the colour dot did.
export function MetricIcon({
  name,
  category,
  color,
  size = 18,
  className,
}: {
  name: string
  category?: string | null
  color?: string
  size?: number
  className?: string
}) {
  const Glyph = glyphForTrack(name, category)
  return <Glyph width={size} height={size} className={className} style={color ? { color } : undefined} aria-hidden />
}

export function GroupIcon({ group, size = 14, className }: { group: MetricGroup; size?: number; className?: string }) {
  const Glyph = GROUP_GLYPHS[group]
  return <Glyph width={size} height={size} className={className} aria-hidden />
}
