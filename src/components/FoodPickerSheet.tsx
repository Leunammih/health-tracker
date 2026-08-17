import { useMemo, useState } from 'react'
import { allFoods, findFoodByKey, mergeFoods, normaliseFoodKey, updateFood } from '../db/queries'
import type { Food } from '../types'

// The full ingredient library — search, tap-to-add, and per-food management
// (rename, edit macros, archive). Copies QuickLogSheet's bottom-sheet wrapper.
// This is the only place foods are managed; Settings needs no separate panel.
export default function FoodPickerSheet({
  onAdd,
  onClose,
  onChanged,
  counts,
}: {
  onAdd: (food: Food) => void
  onClose: () => void
  onChanged: () => void
  counts: Map<string, number>
}) {
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const foods = useMemo(() => {
    const all = allFoods()
    const q = search.trim().toLowerCase()
    return q ? all.filter((f) => f.name.toLowerCase().includes(q)) : all
  }, [search, version])

  function refresh() {
    setVersion((v) => v + 1)
    onChanged()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl border-t border-ink-700 bg-ink-900 p-4 pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[17px] text-cream">All ingredients</span>
          <button className="text-sm text-ink-400 hover:text-cream" onClick={onClose}>
            Done
          </button>
        </div>
        <input
          className="field mb-3"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {error && (
          <div className="mb-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}
        <div className="space-y-1.5">
          {foods.map((f) => (
            <FoodRow
              key={f.id}
              food={f}
              count={counts.get(f.id) ?? 0}
              editing={editingId === f.id}
              onToggleEdit={() => setEditingId((id) => (id === f.id ? null : f.id))}
              onAdd={() => onAdd(f)}
              onSaved={() => {
                refresh()
                setEditingId(null)
              }}
              onError={setError}
            />
          ))}
          {foods.length === 0 && <p className="py-4 text-center text-sm text-ink-400">No ingredients yet.</p>}
        </div>
      </div>
    </div>
  )
}

function FoodRow({
  food,
  count,
  editing,
  onToggleEdit,
  onAdd,
  onSaved,
  onError,
}: {
  food: Food
  count: number
  editing: boolean
  onToggleEdit: () => void
  onAdd: () => void
  onSaved: () => void
  onError: (msg: string) => void
}) {
  const [name, setName] = useState(food.name)
  const [kcal, setKcal] = useState(food.kcal_100g ?? 0)
  const [protein, setProtein] = useState(food.protein_100g ?? 0)
  const [fat, setFat] = useState(food.fat_100g ?? 0)
  const [carbs, setCarbs] = useState(food.carbs_100g ?? 0)
  const [fiber, setFiber] = useState(food.fiber_100g ?? 0)
  const [servingG, setServingG] = useState(food.serving_g ?? 100)
  const [servingLabel, setServingLabel] = useState(food.serving_label ?? '1 serving')
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    try {
      // A rename that collides with a DIFFERENT existing food splits usage
      // history across two rows unless merged — offer that instead of silently
      // creating a duplicate key.
      const collidesWithOther = normaliseFoodKey(name) !== food.name_key ? findFoodByKey(name) : null
      if (collidesWithOther && collidesWithOther.id !== food.id) {
        if (!confirm(`"${collidesWithOther.name}" already exists. Merge "${food.name}" into it?`)) {
          setBusy(false)
          return
        }
        await mergeFoods(collidesWithOther.id, food.id)
        onSaved()
        return
      }
      await updateFood(food.id, {
        name,
        kcal_100g: kcal,
        protein_100g: protein,
        fat_100g: fat,
        carbs_100g: carbs,
        fiber_100g: fiber,
        serving_g: servingG,
        serving_label: servingLabel,
        source: food.source === 'backfill' ? 'manual' : food.source,
      })
      onSaved()
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function archive() {
    if (!confirm(`Remove "${food.name}" from the picker? Meals already logged with it are unaffected.`)) return
    await updateFood(food.id, { archived: 1 })
    onSaved()
  }

  if (!editing) {
    return (
      <div
        className={`flex items-center gap-2 rounded-lg px-3 py-2 transition-colors ${count > 0 ? 'bg-brand-500/20' : 'bg-ink-800'}`}
      >
        <button
          type="button"
          className="min-w-0 flex-1 text-left transition active:scale-[0.97]"
          onClick={onAdd}
        >
          <div className="flex items-center gap-1.5 truncate text-sm text-cream">
            {food.name}
            {count > 0 && <span className="shrink-0 text-xs text-brand-300">×{count}</span>}
          </div>
          <div className="text-xs text-ink-400">
            {food.kcal_100g == null ? 'no numbers yet' : `${Math.round(food.kcal_100g)} kcal/100g`}
          </div>
        </button>
        <button className="shrink-0 text-xs text-brand-300 underline" onClick={onToggleEdit}>
          Edit
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2 rounded-lg bg-ink-800 p-3">
      <input className="field !py-1.5" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="grid grid-cols-5 gap-1.5">
        <MiniField label="kcal" value={kcal} onChange={setKcal} />
        <MiniField label="Prot" value={protein} onChange={setProtein} />
        <MiniField label="Fat" value={fat} onChange={setFat} />
        <MiniField label="Carb" value={carbs} onChange={setCarbs} />
        <MiniField label="Fib" value={fiber} onChange={setFiber} />
      </div>
      <div className="flex gap-2">
        <input
          type="number"
          inputMode="decimal"
          className="field w-24 !py-1.5"
          value={servingG}
          onChange={(e) => setServingG(Number(e.target.value))}
        />
        <input
          className="field flex-1 !py-1.5"
          value={servingLabel}
          onChange={(e) => setServingLabel(e.target.value)}
          placeholder="1 serving"
        />
      </div>
      <div className="flex gap-2">
        <button className="btn-primary flex-1 !py-1.5 text-sm" disabled={busy} onClick={() => void save()}>
          Save
        </button>
        <button className="btn-destructive !py-1.5 text-sm" disabled={busy} onClick={() => void archive()}>
          Archive
        </button>
        <button className="btn-ghost !py-1.5 text-sm" onClick={onToggleEdit}>
          Cancel
        </button>
      </div>
    </div>
  )
}

function MiniField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="mb-0.5 text-center text-[10px] text-ink-400">{label}</div>
      <input
        type="number"
        inputMode="decimal"
        className="field !px-1 !py-1 text-center"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}
