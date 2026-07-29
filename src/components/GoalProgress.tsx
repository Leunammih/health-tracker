import type { Goals } from '../lib/goals'

// Today's calories/protein against the goals set in Settings. Only rows with a
// goal render — the two are independent, so someone tracking protein alone
// doesn't get an empty calorie bar. Colours come from the CSS vars, so this
// follows the parchment/dark toggle without a theme prop.
export default function GoalProgress({
  goals,
  totals,
  title,
}: {
  goals: Goals
  totals: { calories: number; protein_g: number }
  title: string
}) {
  return (
    <section className="card space-y-3">
      <div className="label !mb-0">{title}</div>
      {goals.calories != null && (
        <GoalRow label="Calories" unit="kcal" value={totals.calories} goal={goals.calories} />
      )}
      {goals.protein_g != null && (
        <GoalRow label="Protein" unit="g" value={totals.protein_g} goal={goals.protein_g} />
      )}
    </section>
  )
}

function GoalRow({ label, unit, value, goal }: { label: string; unit: string; value: number; goal: number }) {
  const v = Math.round(value)
  const g = Math.round(goal)
  const pct = goal > 0 ? (value / goal) * 100 : 0
  const over = pct > 100
  const remaining = Math.abs(g - v)

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-cream">{label}</span>
        <span className="text-ink-300">
          <strong className="text-cream">{v.toLocaleString()}</strong> / {g.toLocaleString()} {unit}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-ink-700">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          // Capped at 100% so an over-target day can't overflow the track; the
          // deeper colour is what signals "past the goal", together with the
          // caption below.
          style={{
            width: `${Math.min(100, Math.max(0, pct))}%`,
            background: over ? 'var(--accent-deep)' : 'var(--accent)',
          }}
        />
      </div>
      <div className="text-xs text-ink-400">
        {over
          ? `${remaining.toLocaleString()} ${unit} over · ${Math.round(pct)}%`
          : `${remaining.toLocaleString()} ${unit} to go · ${Math.round(pct)}%`}
      </div>
    </div>
  )
}
