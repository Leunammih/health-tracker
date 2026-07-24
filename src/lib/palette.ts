// Presentation-only colour rule for the data layer, ported from the Claude
// Design output's DCLogic component (project c7aa4381-…). Deliberately
// separate from metrics.ts's TrackDef registry: TrackDef owns *what* a track
// is (matching, units, orientation) and never a specific hex, so a palette
// change can never touch matching logic.
//
// Each dashboard chart shows ONE metric group; its own series are spread
// EVENLY across that group's brand-safe hue arc, so every line in a chart is
// clearly distinct while the group keeps a tonal identity across charts. An
// unbounded, dictation-generated metric list still gets a stable colour via a
// deterministic hash into the same arc. No forbidden hues (purple/pink/
// saturated blue) are ever produced.

export type PaletteGroup = 'movement' | 'practice' | 'symptom' | 'wellbeing' | 'illness'

interface GroupSpec {
  h0: number
  h1: number
  baseL: number
  C: number
}

const GROUP: Record<PaletteGroup, GroupSpec> = {
  movement: { h0: 96, h1: 156, baseL: 0.84, C: 0.12 }, // gold → green
  practice: { h0: 160, h1: 205, baseL: 0.82, C: 0.1 }, // teal → aqua
  wellbeing: { h0: 68, h1: 150, baseL: 0.85, C: 0.115 }, // amber → green
  symptom: { h0: 22, h1: 104, baseL: 0.8, C: 0.135 }, // clay → olive (pain)
  illness: { h0: 26, h1: 88, baseL: 0.8, C: 0.14 }, // clay → amber
}

function groupOf(group: PaletteGroup): GroupSpec {
  return GROUP[group] ?? GROUP.symptom
}

// Re-derive lightness/chroma for the parchment (light) ground — the same hue
// arcs, pulled into a darker, slightly more saturated band so they stay
// legible on cream instead of ink-teal.
function mkColor(hue: number, L: number, C: number, light: boolean): string {
  if (light) {
    L = Math.min(0.62, Math.max(0.42, L - 0.3))
    C += 0.02
  }
  return `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${hue.toFixed(1)})`
}

// Spread a chart's OWN series evenly across its group's hue arc, alternating
// lightness for adjacency — guaranteed-distinct within that one chart, which a
// per-name hash alone can't promise (two hashes can land close together).
export function chartPalette(
  names: string[],
  group: PaletteGroup,
  light = false,
): Record<string, string> {
  const g = groupOf(group)
  const n = names.length
  const out: Record<string, string> = {}
  names.forEach((nm, i) => {
    const t = n <= 1 ? 0.5 : i / (n - 1)
    const hue = g.h0 + t * (g.h1 - g.h0)
    const L = g.baseL + (i % 2 ? -0.055 : 0.02)
    out[nm] = mkColor(hue, L, g.C, light)
  })
  return out
}

function frac(x: number): number {
  return x - Math.floor(x)
}
function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

// Deterministic slot inside a group's arc for a single metric (dot / tile /
// legend swatch) — same name always lands on the same hue, everywhere.
export function colorForTrack(name: string, group: PaletteGroup, light = false): string {
  const g = groupOf(group)
  const t = frac(hash(name.toLowerCase().trim()) * 0.618033988749)
  const L = g.baseL + (Math.floor(t * 6) % 2 ? -0.055 : 0.02)
  return mkColor(g.h0 + t * (g.h1 - g.h0), L, g.C, light)
}
