// How each Insights chart joins its data points (G-14): smooth curve, straight
// segments, steps, the rounded plateau the minutes charts draw, or no line at all —
// just the points. Chosen per chart, stored in the DB's meta table so it syncs; a
// chart he hasn't touched uses autoLineStyle().

import { getMeta, setMeta } from '../db/queries'

export type LineStyle = 'plateau' | 'smooth' | 'straight' | 'step' | 'points'

export const LINE_STYLE_LABEL: Record<LineStyle, string> = {
  plateau: 'Plateau',
  smooth: 'Smooth',
  straight: 'Straight',
  step: 'Steps',
  points: 'Points only',
}

const KEY = 'chart_styles'

export function loadChartStyles(): Record<string, LineStyle> {
  const raw = getMeta(KEY)
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, LineStyle>) : {}
  } catch {
    return {}
  }
}

// null = back to automatic.
export async function setChartStyle(chart: string, style: LineStyle | null): Promise<void> {
  const next = loadChartStyles()
  if (style) next[chart] = style
  else delete next[chart]
  await setMeta(KEY, Object.keys(next).length ? JSON.stringify(next) : null)
}

// The best fit for what's actually logged:
//  - minutes charts keep their rounded plateau (time spent reads as a level held
//    across the day, and "nothing that day" as a drop to zero);
//  - two readings or fewer per line → just the points: a line between two dots
//    a week apart claims a trend nobody measured;
//  - every line logged nearly every day → smooth;
//  - anything with gaps → straight, because a smooth curve across a gap invents a
//    swoop that was never there (the long arcs on Health & pain).
export function autoLineStyle(series: (number | null | undefined)[][], opts: { duration?: boolean } = {}): LineStyle {
  if (opts.duration) return 'plateau'
  const withData = series
    .map((s) => ({ n: s.filter((v) => v != null).length, len: s.length }))
    .filter((s) => s.n > 0)
  if (!withData.length) return 'straight'
  if (Math.max(...withData.map((s) => s.n)) <= 2) return 'points'
  const minDensity = Math.min(...withData.map((s) => s.n / Math.max(1, s.len)))
  return minDensity >= 0.8 ? 'smooth' : 'straight'
}

// Recharts props for one <Line> drawn in `style`. `dot` is the line's usual dot
// (false for the dense lines that never had one); "points only" always shows them.
export function lineProps(
  style: LineStyle,
  color: string,
  dot: false | { r: number } | ((p: any) => JSX.Element | null) = { r: 2 },
): { type: 'monotone' | 'linear' | 'stepAfter'; stroke: string; dot: any } {
  if (style === 'points') {
    return { type: 'linear', stroke: 'none', dot: typeof dot === 'function' ? dot : { r: 3.5, fill: color, stroke: color } }
  }
  const type = style === 'smooth' ? 'monotone' : style === 'step' ? 'stepAfter' : 'linear'
  return { type, stroke: color, dot }
}

// For an <Area> drawn under lines in the same style (the sleep band).
export function curveType(style: LineStyle): 'monotone' | 'linear' | 'stepAfter' {
  return style === 'smooth' ? 'monotone' : style === 'step' ? 'stepAfter' : 'linear'
}
