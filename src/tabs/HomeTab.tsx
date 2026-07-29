import { useMemo } from 'react'
import {
  wellbeingOn, activitiesSince, mealsSince, gutSince, infectionsSince, dayContextSince, tracksSince,
} from '../db/queries'
import { daysAgoISO, fmtDate } from '../lib/dates'
import { groupForTrack, labelForTrack } from '../lib/metrics'
import { useTheme } from '../lib/theme'
import emblemDark from '../assets/emblem-dark.png'
import emblemSage from '../assets/emblem-sage.png'
import heroCoaching from '../assets/hero-coaching.jpg'
import type { Tab } from '../App'

// Landing screen: logo, a quiet intro, and a recap of yesterday pulled from data
// that already exists — nothing new to log here, just an entry point into the rest
// of the app.
export default function HomeTab({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const light = useTheme() === 'light'
  const y = daysAgoISO(1)

  const summary = useMemo(() => {
    const wb = wellbeingOn(y)
    const acts = activitiesSince(y).filter((a) => a.date === y)
    const movementTracks = tracksSince(y).filter((t) => t.date === y && groupForTrack(t.name, t.category) === 'movement')
    const moved = [...new Set([...acts.map((a) => a.type), ...movementTracks.map((t) => labelForTrack(t.name))])].filter(
      (s): s is string => !!s,
    )

    const meals = mealsSince(y).filter((m) => m.date === y)
    const kcal = meals.reduce((sum, m) => sum + (m.calories ?? 0), 0)

    const gut = gutSince(y).filter((g) => g.date === y)
    const inf = infectionsSince(y).filter((i) => i.date === y)
    const ctx = dayContextSince(y).find((c) => c.date === y)

    const flags: string[] = []
    if (inf.length) flags.push(`${inf.length} infection${inf.length > 1 ? 's' : ''} logged`)
    if (gut.some((g) => (g.pain ?? 0) >= 6)) flags.push('gut pain was high')
    if (ctx?.stress_load != null && ctx.stress_load >= 7) flags.push('stress load was high')

    return {
      wb,
      moved,
      kcal,
      mealCount: meals.length,
      flags,
      hasAny: !!wb || moved.length > 0 || meals.length > 0 || flags.length > 0,
    }
  }, [y])

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-3 pb-1 pt-2 text-center">
        <img src={light ? emblemSage : emblemDark} alt="" className="h-20 w-20 rounded-full shadow-sm" />
        <p className="max-w-xs font-serif text-lg leading-snug text-cream">
          A quiet place to notice how your body and your days move together.
        </p>
      </div>

      <div className="relative overflow-hidden rounded-2xl">
        <img src={heroCoaching} alt="" className="h-32 w-full object-cover" />
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 px-6 text-center">
          <p className="font-serif text-base text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.8)]">
            Track gently. Notice patterns. Adjust with care.
          </p>
        </div>
      </div>

      <button className="card block w-full text-left" onClick={() => onNavigate('insights')}>
        <div className="label mb-2">Yesterday · {fmtDate(y)}</div>
        {!summary.hasAny && <p className="text-sm text-ink-400">Nothing logged yesterday.</p>}
        {summary.hasAny && (
          <div className="space-y-1.5 text-sm text-cream">
            {(summary.wb?.energy != null || summary.wb?.mood != null) && (
              <div>
                {summary.wb?.energy != null && `Energy ${summary.wb.energy}/10`}
                {summary.wb?.energy != null && summary.wb?.mood != null && ' · '}
                {summary.wb?.mood != null && `Mood ${summary.wb.mood}/10`}
              </div>
            )}
            {summary.moved.length > 0 && <div>Moved: {summary.moved.join(', ')}</div>}
            {summary.mealCount > 0 && (
              <div>
                {summary.mealCount} meal{summary.mealCount > 1 ? 's' : ''} · {summary.kcal} kcal
              </div>
            )}
            {summary.flags.map((f) => (
              <div key={f} className="text-amber-300">
                ⚠ {f}
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 text-xs text-brand-400">View full Insights →</div>
      </button>

      <div className="grid grid-cols-2 gap-2">
        <button className="card !py-4 text-center text-sm text-cream" onClick={() => onNavigate('log')}>
          Log today
        </button>
        <button className="card !py-4 text-center text-sm text-cream" onClick={() => onNavigate('nutrition')}>
          Log a meal
        </button>
      </div>
    </div>
  )
}
