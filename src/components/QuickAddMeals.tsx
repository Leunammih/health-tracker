import { useMemo, useState } from 'react'
import { mealsSince, saveMeal } from '../db/queries'
import { daysAgoISO, todayISO, nowTime } from '../lib/dates'
import { mealToAnalysis } from '../lib/meals'
import { suggestQuickAdds, LOOKBACK_DAYS, type MealSuggestion } from '../lib/mealPatterns'

// Phase E: "you usually have X around now". Renders nothing when there's no
// pattern yet — no empty state, same as "Recent meals" only appearing once
// there's something to show.
export default function QuickAddMeals({ onAdded }: { onAdded: () => void }) {
  const [refresh, setRefresh] = useState(0)
  const [addedKey, setAddedKey] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const suggestions = useMemo(
    () => suggestQuickAdds(mealsSince(daysAgoISO(LOOKBACK_DAYS))),
    [refresh],
  )

  async function add(s: MealSuggestion) {
    setBusyKey(s.key)
    try {
      const analysis = mealToAnalysis(s.template)
      await saveMeal(analysis, todayISO(), nowTime(), s.template.photo_path, s.template.source, null)
      onAdded()
      setAddedKey(s.key)
      // Recompute (which drops today's now-logged suggestion) only after the
      // flash — doing it immediately would swap the row out from under the
      // confirmation before it's ever seen.
      setTimeout(() => {
        setAddedKey(null)
        setRefresh((k) => k + 1)
      }, 1500)
    } finally {
      setBusyKey(null)
    }
  }

  if (suggestions.length === 0) return null

  return (
    <div className="card space-y-2">
      <div className="label !mb-0">Quick add</div>
      <p className="text-xs text-ink-400">What you've had most often around this time.</p>
      <div className="space-y-1.5">
        {suggestions.map((s) => (
          <button
            key={s.key}
            className="flex w-full items-center justify-between gap-3 rounded-lg bg-ink-900 px-3 py-2.5 text-left transition-colors duration-500"
            style={addedKey === s.key ? { background: 'var(--accent-dim)' } : undefined}
            disabled={busyKey === s.key}
            onClick={() => void add(s)}
          >
            <div className="min-w-0">
              <div className="truncate text-sm text-cream">{s.template.name}</div>
              <div className="text-xs text-ink-400">
                {s.template.calories ?? '—'} kcal · logged {s.count}× recently
              </div>
            </div>
            <span className="shrink-0 text-xs font-medium text-brand-400">
              {addedKey === s.key ? 'Added ✓' : busyKey === s.key ? '…' : '+ Add'}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
