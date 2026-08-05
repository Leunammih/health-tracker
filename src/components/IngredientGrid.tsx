import type { Food } from '../types'

// Tap-to-build's ranked ingredient grid for the current meal slot. Ranking is
// computed once per slot by the caller (MealBuilder) and passed in as `foods` —
// this component only renders and reports taps, so it never reshuffles mid-build.
export default function IngredientGrid({
  foods,
  counts,
  onAdd,
  onOpenPicker,
}: {
  foods: Food[]
  counts: Map<string, number>
  onAdd: (food: Food) => void
  onOpenPicker: () => void
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {foods.map((f) => {
        const count = counts.get(f.id) ?? 0
        const unknown = f.kcal_100g == null
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => onAdd(f)}
            className={`relative rounded-xl px-2 py-3 text-center text-sm transition active:scale-[0.97] ${
              count > 0 ? 'bg-brand-500 text-ink-900' : 'bg-ink-900 text-cream hover:bg-ink-800'
            }`}
          >
            {unknown && (
              <span
                className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-amber-400"
                aria-label="No macros yet"
              />
            )}
            <div className="truncate leading-tight">{f.name}</div>
            {count > 0 && <div className="mt-0.5 text-xs opacity-80">×{count}</div>}
          </button>
        )
      })}
      <button
        type="button"
        className="btn-ghost rounded-xl px-2 py-3 text-sm"
        onClick={onOpenPicker}
      >
        More…
      </button>
    </div>
  )
}
