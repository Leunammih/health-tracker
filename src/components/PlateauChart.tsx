import { fmtDate } from '../lib/dates'

// A continuous "plateau" line per activity: the line runs left→right across every
// day in the range, sitting flat at 0 on days the activity wasn't done and rising
// to a rounded plateau at that day's minutes when it was. Transitions between days
// flow up or down with rounded corners.
//
// Hand-rolled SVG rather than Recharts: the shape is a step with rounded corners
// and a 0 baseline, which no built-in curve type produces.

export interface PlateauSeries {
  key: string
  label: string
  color: string
  values: (number | null)[] // aligned 1:1 with `dates`; null = not done that day (drawn as 0)
}

const W = 360
const H = 150
const PAD = { left: 26, right: 6, top: 10, bottom: 18 }

// Replace each interior vertex of a polyline with a quadratic corner of radius r,
// clamped so adjacent short edges can't overshoot into each other.
function roundedPath(pts: [number, number][], r: number): string {
  if (pts.length < 2) return ''
  let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1]
    const [cx, cy] = pts[i]
    const [nx, ny] = pts[i + 1]
    const inX = cx - px, inY = cy - py
    const outX = nx - cx, outY = ny - cy
    const lIn = Math.hypot(inX, inY)
    const lOut = Math.hypot(outX, outY)
    if (lIn === 0 || lOut === 0) continue
    // Collinear vertices need no corner — skip so straight runs stay straight.
    if (Math.abs(inX * outY - inY * outX) < 1e-6) continue
    const rr = Math.min(r, lIn / 2, lOut / 2)
    const ax = cx - (inX / lIn) * rr, ay = cy - (inY / lIn) * rr
    const bx = cx + (outX / lOut) * rr, by = cy + (outY / lOut) * rr
    d += ` L ${ax.toFixed(2)} ${ay.toFixed(2)} Q ${cx.toFixed(2)} ${cy.toFixed(2)} ${bx.toFixed(2)} ${by.toFixed(2)}`
  }
  const last = pts[pts.length - 1]
  d += ` L ${last[0].toFixed(2)} ${last[1].toFixed(2)}`
  return d
}

export default function PlateauChart({
  dates,
  series,
  unit = 'min',
  onPickDay,
}: {
  dates: string[]
  series: PlateauSeries[]
  unit?: string
  onPickDay?: (date: string) => void
}) {
  const n = dates.length
  if (!n || !series.length) return null

  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const bottom = PAD.top + plotH

  const rawMax = Math.max(...series.flatMap((s) => s.values.map((v) => v ?? 0)), 0)
  // Round the top of the scale up to a clean number so the axis reads well.
  const step = rawMax > 120 ? 60 : rawMax > 60 ? 30 : rawMax > 20 ? 15 : 5
  const max = Math.max(step, Math.ceil(rawMax / step) * step)

  const slotW = plotW / n
  const hw = Math.min(slotW * 0.4, 16) // plateau half-width
  const cx = (i: number) => PAD.left + slotW * (i + 0.5)
  const y = (v: number) => bottom - (v / max) * plotH
  // Nominal corner radius — roundedPath() clamps per corner to half the shorter
  // adjacent edge, so this can stay generous without corners overshooting.
  const radius = Math.min(8, hw)

  // Date labels: show roughly 5 across the range so they stay legible on a phone.
  const labelEvery = Math.max(1, Math.round(n / 5))

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ overflow: 'visible' }}>
        {/* horizontal grid + Y labels */}
        {[0, 0.5, 1].map((f) => {
          const val = max * f
          return (
            <g key={f}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(val)} y2={y(val)} stroke="#1b2740" strokeWidth={1} />
              <text x={PAD.left - 4} y={y(val) + 3} textAnchor="end" fill="#6b7a99" fontSize={9}>
                {Math.round(val)}
              </text>
            </g>
          )
        })}

        {/* one rounded-plateau path per activity */}
        {series.map((s) => {
          const pts: [number, number][] = [[PAD.left, y(s.values[0] ?? 0)]]
          for (let i = 0; i < n; i++) {
            const v = s.values[i] ?? 0
            pts.push([cx(i) - hw, y(v)])
            pts.push([cx(i) + hw, y(v)])
          }
          pts.push([W - PAD.right, y(s.values[n - 1] ?? 0)])
          return (
            <path
              key={s.key}
              d={roundedPath(pts, radius)}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          )
        })}

        {/* X labels */}
        {dates.map((d, i) =>
          i % labelEvery === 0 ? (
            <text key={d} x={cx(i)} y={H - 5} textAnchor="middle" fill="#6b7a99" fontSize={9}>
              {fmtDate(d)}
            </text>
          ) : null,
        )}

        {/* invisible per-day tap targets for quick-logging that day */}
        {onPickDay &&
          dates.map((d, i) => (
            <rect
              key={`hit-${d}`}
              x={cx(i) - slotW / 2}
              y={PAD.top}
              width={slotW}
              height={plotH}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onClick={() => onPickDay(d)}
            />
          ))}
      </svg>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-300">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} /> {s.label}
          </span>
        ))}
        <span className="text-ink-400">({unit})</span>
      </div>
    </div>
  )
}
