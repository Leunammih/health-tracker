// Presentation-only colour rule for the data layer. Deliberately separate
// from metrics.ts's TrackDef registry: TrackDef owns *what* a track is
// (matching, units, orientation) and never a specific hex, so a palette
// change can never touch matching logic.
//
// Replaced the narrow per-group hue-arc system (movement = gold→green only,
// symptom = clay→olive only, etc.) after user feedback: confining every
// series in a group to one ~60-90° hue slice made same-chart items read as
// "shades of the same colour" and hard to tell apart at a glance — exactly
// backwards for an app used while unwell, low on patience. Colours only need
// to be distinct WITHIN a chart, not globally (Meditation and Energy never
// render side by side, so they can safely share a hue), so this restores the
// app's original wide, maximally-separated per-item palette instead —
// spanning the full hue wheel — while still fixing the real collisions the
// original had (stretching vs. wrist pain sharing a hex, four near-identical
// reds in the pain group).

export type PaletteGroup = 'movement' | 'practice' | 'symptom' | 'wellbeing' | 'illness'

// 18 hand-picked, maximally-separated hues — bright enough to read on the
// dark ink-teal ground. forLight() below darkens/saturates them for the
// parchment ground rather than hand-authoring a second palette.
const PALETTE: string[] = [
  '#eab308', // yellow
  '#3b82f6', // blue
  '#22c55e', // green
  '#14b8a6', // teal
  '#84cc16', // lime
  '#6366f1', // indigo
  '#06b6d4', // cyan
  '#c084fc', // purple
  '#8b5cf6', // violet
  '#2dd4bf', // mint
  '#ef4444', // red
  '#f97316', // orange
  '#db2777', // pink
  '#0ea5e9', // sky
  '#c2703d', // clay
  '#a78bfa', // lilac
  '#ec4899', // rose
  '#38bdf8', // light blue
]

// Explicit colours for every named thing the app already ships — restored
// close to the pre-redesign palette, with the acknowledged collisions fixed:
// stretching moves off wrist pain's orange, and the pain group's five items
// (knee/wrist/back/shoulder/stomach) each get a genuinely different hue
// family (red/orange/pink/blue/brown) instead of four reds that only differed
// by a few degrees of hue.
const KNOWN: Record<string, string> = {
  exercise: '#eab308',
  dancing: '#3b82f6',
  biking: '#22c55e',
  walking: '#14b8a6',
  running: '#84cc16',
  stretching: '#6366f1',
  swimming: '#06b6d4',
  yoga: '#c084fc',
  meditation: '#8b5cf6',
  'breath work': '#2dd4bf',
  'knee pain': '#ef4444',
  'wrist pain': '#f97316',
  'back pain': '#db2777',
  'shoulder pain': '#0ea5e9',
  'stomach pain': '#c2703d',
  weight: '#38bdf8',
  energy: '#2dd4bf',
  mood: '#a78bfa',
  release: '#ec4899',
  infection: '#e66767',
  'gut pain': '#d95926',
  stool: '#9085e9',
  stress: '#f59e0b',
}

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

// A known name gets its explicit colour; anything dictation invents hashes
// into the same full palette (never a cramped slice of it), so a brand-new
// metric still shows up clearly distinct from its neighbours.
function baseColor(name: string): string {
  const key = name.toLowerCase().trim()
  return KNOWN[key] ?? PALETTE[hash(key) % PALETTE.length]
}

// ---- hex <-> HSL, just enough to darken/saturate a colour for the light
// (parchment) ground without hand-authoring a whole second palette. ----
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  let h = 0
  let s = 0
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1))
    switch (max) {
      case r:
        h = ((g - b) / d) % 6
        break
      case g:
        h = (b - r) / d + 2
        break
      default:
        h = (r - g) / d + 4
    }
    h *= 60
    if (h < 0) h += 360
  }
  return [h, s, l]
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let rgb: [number, number, number] = [0, 0, 0]
  if (h < 60) rgb = [c, x, 0]
  else if (h < 120) rgb = [x, c, 0]
  else if (h < 180) rgb = [0, c, x]
  else if (h < 240) rgb = [0, x, c]
  else if (h < 300) rgb = [x, 0, c]
  else rgb = [c, 0, x]
  return [(rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255]
}

// Darken + saturate a dark-ground colour so it stays legible on cream —
// mirrors what the previous oklch light-mode re-derivation did, just against
// a fixed hex palette instead of a formula.
function forLight(hex: string): string {
  const [h, s, l] = rgbToHsl(...hexToRgb(hex))
  const newL = Math.min(0.5, Math.max(0.32, l - 0.2))
  const newS = Math.min(1, s + 0.05)
  return rgbToHex(...hslToRgb(h, newS, newL))
}

// Deterministic colour for a single metric (dot / tile / legend swatch) —
// same name always lands on the same hue, everywhere. `group` is kept in the
// signature for API stability (chart call sites already pass it) but no
// longer narrows the hue choice — see the file header for why.
export function colorForTrack(name: string, _group: PaletteGroup, light = false): string {
  const c = baseColor(name)
  return light ? forLight(c) : c
}

// Colours for a chart's own series, guaranteed-distinct within THIS chart.
// Registered items never collide (each has its own explicit hex); the only
// way two names could land on the same colour is a hash coincidence between
// two unregistered, dictation-invented names, so any collision bumps the
// second name to the next palette slot not already used in this call.
export function chartPalette(names: string[], _group: PaletteGroup, light = false): Record<string, string> {
  const used = new Set<string>()
  const out: Record<string, string> = {}
  for (const name of names) {
    let c = baseColor(name)
    if (used.has(c)) {
      const free = PALETTE.find((p) => !used.has(p))
      if (free) c = free
    }
    used.add(c)
    out[name] = light ? forLight(c) : c
  }
  return out
}
