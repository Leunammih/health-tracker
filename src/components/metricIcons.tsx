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

// ---- General catalogue ----
// Not tied to any built-in metric — these exist so a category he invents has
// something to wear. Same stroke-only 24x24 style as everything above.

const Nature: Glyph = (p) => (
  <svg {...base(p)}><path d="M12 21v-6" /><path d="M12 15c0-4 2.5-7 6-7.5-.5 4-2.5 7.5-6 7.5Z" /><path d="M12 15c0-4-2.5-7-6-7.5.5 4 2.5 7.5 6 7.5Z" /><path d="M12 9c0-3 1.2-5 3-6-1.8 4-1 6-3 6Z" /></svg>
)
const Fire: Glyph = (p) => (
  <svg {...base(p)}><path d="M12 2.5s5.5 4.8 5.5 9.8a5.5 5.5 0 0 1-11 0c0-2 1-3.5 2-4.5.3 1.5 1 2.4 2 2.4 1.5 0 1.5-2 1.5-3.5 0-1.6 0-3 0-4.2Z" /></svg>
)
const Sailing: Glyph = (p) => (
  <svg {...base(p)}><path d="M12 2.5v13" /><path d="M12 4.5c-3.5 3-6 7-6.5 11H12" /><path d="M2.5 19.5c2-1.5 3.5-1.5 5.5 0s3.5 1.5 5.5 0 3.5-1.5 5.5 0" /></svg>
)
const KiteSurf: Glyph = (p) => (
  <svg {...base(p)}><path d="M4 3.5c4.5 0 7.5 3 7.5 7.5C7 11 4 8 4 3.5Z" /><path d="M11 10.5l4 5.5" /><circle cx="16" cy="17.5" r="1.6" /><path d="M13 20.5c1.5-1 4-1 5.5 0" /><path d="M2.5 21c2-1.2 3.5-1.2 5.5 0" /></svg>
)
const Kayak: Glyph = (p) => (
  <svg {...base(p)}><path d="M3 6l18 12" /><path d="M3.6 5.4l1.8-1.2M20.4 18.6l-1.8 1.2" /><path d="M4 16c2.5 2 7 2.5 11 0" /><path d="M8.5 13.5c1.5-2 4-3.5 6.5-4" /></svg>
)
const Surfing: Glyph = (p) => (
  <svg {...base(p)}><path d="M7 17c-1-5 2-11 8-13.5C16.5 9 13 15.5 7 17Z" /><path d="M2.5 20.5c2-1.5 3.5-1.5 5.5 0s3.5 1.5 5.5 0 3.5-1.5 5.5 0" /></svg>
)
const Climbing: Glyph = (p) => (
  <svg {...base(p)}><circle cx="15" cy="4" r="1.8" /><path d="M15 6.5l-4 3 3 2.5-1 3.5" /><path d="M11 9.5L6 13" /><path d="M14 12l4 1.5" /><path d="M4 21c1.5-2.5 3-4.5 5-6" /></svg>
)
const Skiing: Glyph = (p) => (
  <svg {...base(p)}><circle cx="15.5" cy="4" r="1.7" /><path d="M15 6.5l-3 4 3 2 .5 4" /><path d="M12 10.5L8 9" /><path d="M4 17.5l14 3" /><path d="M18 20.5l2-1.5" /></svg>
)
const Ball: Glyph = (p) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5l3 4-1.5 4.5H10L8.5 7.5z" /><path d="M15 7.5l5.5-1.2M8.5 7.5L3.5 6.3M13.5 12l3.5 4.5M10 12l-3.5 4.5M12 20.5v-4" /></svg>
)
const Basketball: Glyph = (p) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5v17M3.5 12h17" /><path d="M5.5 6a9 9 0 0 0 0 12M18.5 6a9 9 0 0 1 0 12" /></svg>
)
const Racket: Glyph = (p) => (
  <svg {...base(p)}><ellipse cx="14" cy="8" rx="5" ry="6" transform="rotate(35 14 8)" /><path d="M10 12.5L4 20" /><path d="M3 19l2 2" /></svg>
)
const Volleyball: Glyph = (p) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5c-3 4-3.5 9-1 12.5" /><path d="M20 9c-5-.5-9 1.5-11 5.5" /><path d="M6 19c1.5-4.5 1-9-1.5-12" /></svg>
)
const Golf: Glyph = (p) => (
  <svg {...base(p)}><path d="M9 21V3l7 3.5-7 3.5" /><circle cx="14" cy="19" r="1.8" /><path d="M5 21h6" /></svg>
)
const Hiking: Glyph = (p) => (
  <svg {...base(p)}><circle cx="13" cy="4" r="1.8" /><path d="M13 6.5l-3 3.5 2.5 2.5-1 8" /><path d="M10 10L7 12" /><path d="M12.5 12.5l3.5 2.5" /><path d="M19 3v18" /></svg>
)
const Mountain: Glyph = (p) => (
  <svg {...base(p)}><path d="M2.5 19h19L14 6l-3.5 6-2-3z" /><path d="M11 9.5l3 5" /></svg>
)
const Sun: Glyph = (p) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.5M12 19v2.5M2.5 12h2.5M19 12h2.5M5.2 5.2l1.8 1.8M17 17l1.8 1.8M18.8 5.2L17 7M7 17l-1.8 1.8" /></svg>
)
const Water: Glyph = (p) => (
  <svg {...base(p)}><path d="M6.5 3.5h11l-1.2 16a2 2 0 0 1-2 1.9h-4.6a2 2 0 0 1-2-1.9z" /><path d="M6.9 9.5h10.2" /></svg>
)
const Coffee: Glyph = (p) => (
  <svg {...base(p)}><path d="M3.5 8h13v6a5 5 0 0 1-5 5h-3a5 5 0 0 1-5-5z" /><path d="M16.5 9.5h2a2.5 2.5 0 0 1 0 5h-2" /><path d="M6.5 2.5v2.5M10 2.5v2.5M13.5 2.5v2.5" /></svg>
)
const Food: Glyph = (p) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4" /></svg>
)
const Pill: Glyph = (p) => (
  <svg {...base(p)}><rect x="2.6" y="8.5" width="18.8" height="7" rx="3.5" transform="rotate(-45 12 12)" /><path d="M8.7 8.7l6.6 6.6" /></svg>
)
const Heart: Glyph = (p) => (
  <svg {...base(p)}><path d="M12 20.5S4.5 15.6 4.5 10.4A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 7.5 2.8c0 5.2-7.5 10.1-7.5 10.1Z" /></svg>
)
const People: Glyph = (p) => (
  <svg {...base(p)}><circle cx="8.5" cy="7.5" r="2.8" /><circle cx="16.5" cy="8.5" r="2.2" /><path d="M2.5 19c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M15 13.2c3 .3 5 2.6 5 5.8" /></svg>
)
const Phone: Glyph = (p) => (
  <svg {...base(p)}><rect x="6.5" y="2.5" width="11" height="19" rx="2.5" /><path d="M10.5 5.5h3M11 18.5h2" /></svg>
)
const Book: Glyph = (p) => (
  <svg {...base(p)}><path d="M3.5 4.5h6a3 3 0 0 1 2.5 1.3A3 3 0 0 1 14.5 4.5h6v14h-6a3 3 0 0 0-2.5 1.3A3 3 0 0 0 9.5 18.5h-6z" /><path d="M12 5.8v14" /></svg>
)
// Headphones, not notes: Dancing already owns the musical-note shape, and two
// identical glyphs in the picker is a choice that isn't one.
const Music: Glyph = (p) => (
  <svg {...base(p)}><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><rect x="2.5" y="13.5" width="4.5" height="7" rx="2" /><rect x="17" y="13.5" width="4.5" height="7" rx="2" /></svg>
)
const Create: Glyph = (p) => (
  <svg {...base(p)}><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z" /><path d="M14 6l4 4" /><path d="M5 15l4 4" /></svg>
)
const Work: Glyph = (p) => (
  <svg {...base(p)}><rect x="2.5" y="7" width="19" height="12.5" rx="2.5" /><path d="M8.5 7V5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v2" /><path d="M2.5 12.5h19" /></svg>
)
const Travel: Glyph = (p) => (
  <svg {...base(p)}><path d="M10.5 3.5a1.5 1.5 0 0 1 3 0v5l7.5 4.5v2.5l-7.5-2.5v4l2.5 2v2l-4-1.2-4 1.2v-2l2.5-2v-4L3 15.5V13l7.5-4.5z" /></svg>
)
const Car: Glyph = (p) => (
  <svg {...base(p)}><path d="M3 15v-2.5l2-5A2 2 0 0 1 6.9 6h10.2a2 2 0 0 1 1.9 1.5l2 5V15" /><path d="M3 15h18v3H3z" /><circle cx="7" cy="18.5" r="1.5" /><circle cx="17" cy="18.5" r="1.5" /></svg>
)
const Bed: Glyph = (p) => (
  <svg {...base(p)}><path d="M2.5 19v-9" /><path d="M2.5 13.5h19V19" /><path d="M6 13.5v-3h9a4 4 0 0 1 4 3" /><circle cx="7.5" cy="9" r="1.6" /></svg>
)
const Shower: Glyph = (p) => (
  <svg {...base(p)}><path d="M6 12.5V6a3 3 0 0 1 6 0" /><path d="M2.5 12.5h13" /><path d="M5 16v1.5M9 16v2.5M13 16v1.5" /></svg>
)
const Massage: Glyph = (p) => (
  <svg {...base(p)}><path d="M3.5 14.5c0-2 1.5-3.5 3.5-3.5h4l6-3.5v10l-6-3H7" /><path d="M7 14.5V19a2 2 0 0 0 4 0v-4" /></svg>
)
const Tooth: Glyph = (p) => (
  <svg {...base(p)}><path d="M12 4.5c-2-1.3-5.5-1.3-6.8.8-1.2 2 .3 4.5.8 7 .4 2 .3 5.5 1.8 5.5 1.7 0 1.4-4.5 2.7-4.5h3c1.3 0 1 4.5 2.7 4.5 1.5 0 1.4-3.5 1.8-5.5.5-2.5 2-5-.8-7-1.3-2.1-4.8-2.1-6.8-.8Z" /></svg>
)
const Paw: Glyph = (p) => (
  <svg {...base(p)}><ellipse cx="7" cy="9" rx="1.8" ry="2.4" /><ellipse cx="12" cy="7" rx="1.8" ry="2.6" /><ellipse cx="17" cy="9" rx="1.8" ry="2.4" /><path d="M12 12c3 0 5.5 2 5.5 4.5S15 20.5 12 20.5 6.5 19 6.5 16.5 9 12 12 12Z" /></svg>
)
const Clock: Glyph = (p) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5.5l3.5 2" /></svg>
)
const Star: Glyph = (p) => (
  <svg {...base(p)}><path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.2 6-5.5-3-5.5 3 1.2-6L3.2 9.4l6.1-.8z" /></svg>
)
const Boxing: Glyph = (p) => (
  <svg {...base(p)}><path d="M6.5 4.5h8a4 4 0 0 1 4 4v3a4 4 0 0 1-4 4h-8z" /><path d="M6.5 15.5h8v3a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2z" /><path d="M18.5 8.5h1.5a1.5 1.5 0 0 1 0 3h-1.5" /></svg>
)
const Rowing: Glyph = (p) => (
  <svg {...base(p)}><circle cx="7" cy="6" r="1.8" /><path d="M8 8l3 2.5 5-2" /><path d="M2.5 21c2-1.3 3.5-1.3 5.5 0s3.5 1.3 5.5 0 3.5-1.3 5.5 0" /><path d="M4 17l7-4.5 8 3" /></svg>
)
const Horse: Glyph = (p) => (
  <svg {...base(p)}><path d="M4 20c0-5 3-8 7-8l3-4 3.5-2.5-.5 3.5 2 2.5-2.5 2c1 4-1 6.5-4 6.5" /><path d="M9 12l-2 8" /><path d="M17.5 9h.01" /></svg>
)

// Keyed by TrackDef.key (or TrackDef.icon, for custom metrics that borrow one).
export const METRIC_GLYPHS: Record<string, Glyph> = {
  // --- general catalogue, for categories he defines himself ---
  nature: Nature,
  fire: Fire,
  sailing: Sailing,
  'kite surfing': KiteSurf,
  kayaking: Kayak,
  surfing: Surfing,
  climbing: Climbing,
  skiing: Skiing,
  ball: Ball,
  basketball: Basketball,
  racket: Racket,
  volleyball: Volleyball,
  golf: Golf,
  hiking: Hiking,
  mountain: Mountain,
  sun: Sun,
  water: Water,
  coffee: Coffee,
  food: Food,
  pill: Pill,
  heart: Heart,
  people: People,
  phone: Phone,
  book: Book,
  music: Music,
  create: Create,
  work: Work,
  travel: Travel,
  car: Car,
  bed: Bed,
  shower: Shower,
  massage: Massage,
  tooth: Tooth,
  paw: Paw,
  clock: Clock,
  star: Star,
  boxing: Boxing,
  rowing: Rowing,
  horse: Horse,

  // --- the built-in metrics' own glyphs ---
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
// picker in the "add a category" sheet.
export const GLYPH_NAMES = Object.keys(METRIC_GLYPHS)

// Words that should find each glyph. The name itself is always searched, so these
// are only the SYNONYMS — what he might type instead of what the icon is called.
const GLYPH_TAGS: Record<string, string> = {
  nature: 'tree forest outdoors garden green plant park wood',
  fire: 'flame heat sauna warm campfire burn candle',
  sailing: 'sail boat yacht wind sea ocean',
  'kite surfing': 'kite kitesurf wind water sea board',
  kayaking: 'kayak canoe paddle sup raft river',
  surfing: 'surf wave board sea ocean',
  climbing: 'climb boulder rock crag wall alpine',
  skiing: 'ski snowboard snow winter slope alpine',
  ball: 'football soccer sport team pitch match',
  basketball: 'basket hoop sport team court',
  racket: 'tennis padel squash badminton table ping pong sport',
  volleyball: 'volley beach sport team net',
  golf: 'club tee course putt sport',
  hiking: 'hike trail trek walk mountain backpack outdoors',
  mountain: 'peak alps summit outdoors altitude',
  sun: 'sunlight daylight weather outside vitamin d tan',
  water: 'drink hydration glass bottle thirst',
  coffee: 'caffeine tea cup espresso drink',
  food: 'meal eat plate dish lunch dinner nutrition',
  pill: 'supplement medication vitamin tablet capsule medicine',
  heart: 'love cardio pulse wellbeing rate',
  people: 'social friends connection family group company talk',
  phone: 'screen scrolling mobile device social media',
  book: 'read reading study learn journal writing',
  music: 'song listen instrument play sound',
  create: 'art paint draw make craft creative write',
  work: 'job office desk business admin task',
  travel: 'flight plane trip journey holiday abroad',
  car: 'drive commute road transport traffic',
  bed: 'sleep rest nap lie down bedroom',
  shower: 'cold plunge bath wash ice contrast',
  massage: 'bodywork therapy physio treatment hands',
  tooth: 'teeth floss dental brushing hygiene',
  paw: 'pet dog cat animal walk',
  clock: 'time duration hours schedule timer',
  star: 'favourite highlight good rating special',
  boxing: 'martial arts fight punch kickboxing sparring',
  rowing: 'row erg boat crew machine',
  horse: 'riding equestrian stable',
  // built-ins, so searching finds them too
  exercise: 'workout gym strength weights lifting training',
  dancing: 'dance music ecstatic move',
  biking: 'bike cycle cycling ride mtb',
  walking: 'walk steps stroll',
  running: 'run jog jogging sprint',
  stretching: 'stretch mobility flexibility',
  swimming: 'swim pool sea water',
  yoga: 'asana practice stretch',
  'computer time': 'screen laptop desk work monitor',
  meditation: 'meditate sit mindfulness practice',
  'breath work': 'breath breathing pranayama wim hof',
  'knee pain': 'knee joint leg pain',
  'wrist pain': 'wrist hand joint pain',
  'back pain': 'back spine lumbar pain',
  'shoulder pain': 'shoulder joint arm pain',
  'stomach pain': 'stomach gut belly abdominal pain cramp',
  'muscle soreness': 'sore doms ache muscle',
  'muscle stiffness': 'stiff tight muscle',
  headache: 'head migraine pain',
  nausea: 'sick queasy vomit',
  fatigue: 'tired exhausted energy low battery',
  'brain fog': 'fog foggy unclear concentration',
  infection: 'virus cold flu illness sick bug',
  stool: 'bristol poo bowel gut digestion',
  'warming bottle': 'hot water bottle warm belly',
  energy: 'battery vitality power',
  mood: 'happy feeling emotion smile',
  'brain clarity': 'clear sharp mental idea lightbulb',
  focus: 'concentration attention target',
  release: 'orgasm sexual drop',
  stress: 'tension pressure load overwhelm',
  sleep: 'night moon rest bed',
  weight: 'kg scale mass body',
}

// Icon names matching a free-text query, ranked: name matches first, then tags.
// An empty query returns everything in catalogue order.
export function searchGlyphs(query: string): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return GLYPH_NAMES
  const words = q.split(/\s+/)
  const scored: { name: string; score: number }[] = []
  for (const name of GLYPH_NAMES) {
    const hay = `${name} ${GLYPH_TAGS[name] ?? ''}`
    // Every word the user typed has to appear somewhere, so "ball sport" narrows
    // rather than widens.
    if (!words.every((w) => hay.includes(w))) continue
    scored.push({ name, score: name.startsWith(q) ? 0 : name.includes(q) ? 1 : 2 })
  }
  return scored.sort((a, b) => a.score - b.score).map((x) => x.name)
}

// An icon can also be a plain emoji, stored as 'emoji:🏄'. That is the escape hatch
// for anything this catalogue doesn't have: the phone's own emoji keyboard has
// thousands of pictures and no download.
export const EMOJI_PREFIX = 'emoji:'

export function isEmojiIcon(icon: string | undefined): boolean {
  return !!icon?.startsWith(EMOJI_PREFIX)
}

export function emojiOf(icon: string): string {
  return icon.slice(EMOJI_PREFIX.length)
}

export function glyphForTrack(name: string, category?: string | null): Glyph {
  const def = defForName(name)
  const g = (def?.icon && METRIC_GLYPHS[def.icon]) || (def && METRIC_GLYPHS[def.key])
  return g ?? GROUP_GLYPHS[groupForTrack(name, category)]
}

// An emoji is rendered as text sized to match the drawn glyphs beside it, so a row
// wearing 🪁 lines up with a row wearing a stroke icon.
function EmojiGlyph({ char, size }: { char: string; size: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center leading-none"
      style={{ width: size, height: size, fontSize: size * 0.92 }}
    >
      {char}
    </span>
  )
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
  // Also accepts a raw catalogue name or an 'emoji:…' string, which is how the icon
  // picker previews a choice that isn't a metric yet.
  category?: string | null
  color?: string
  size?: number
  className?: string
}) {
  if (isEmojiIcon(name)) return <EmojiGlyph char={emojiOf(name)} size={size} />
  const def = defForName(name)
  if (isEmojiIcon(def?.icon)) return <EmojiGlyph char={emojiOf(def!.icon!)} size={size} />
  const Glyph = glyphForTrack(name, category)
  return <Glyph width={size} height={size} className={className} style={color ? { color } : undefined} aria-hidden />
}

// Draw a CATALOGUE entry by its own name, with no metric resolution in between.
//
// MetricIcon deliberately resolves through defForName, which is right for a row in
// the Log tab and wrong for the icon picker: asking it for "hiking" finds the
// walking definition (its regex matches "hike") and draws footprints, and asking it
// for "nature" finds no definition at all and falls through to the group glyph — so
// the picker showed the same three dots for half the catalogue. Picking an icon is
// not looking up a metric.
export function GlyphIcon({ name, size = 18, className }: { name: string; size?: number; className?: string }) {
  if (isEmojiIcon(name)) return <EmojiGlyph char={emojiOf(name)} size={size} />
  const Glyph = METRIC_GLYPHS[name]
  if (!Glyph) return null
  return <Glyph width={size} height={size} className={className} aria-hidden />
}

export function GroupIcon({ group, size = 14, className }: { group: MetricGroup; size?: number; className?: string }) {
  const Glyph = GROUP_GLYPHS[group]
  return <Glyph width={size} height={size} className={className} aria-hidden />
}
