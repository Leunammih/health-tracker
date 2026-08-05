import { useState } from 'react'
import { findFoodByKey, insertFood } from '../db/queries'
import { describeFoods } from '../ai/anthropic'
import type { Food } from '../types'

const EXAMPLES = ['egg', 'rolled oats', 'banana', 'chicken breast', 'olive oil', 'rice', 'avocado', 'yoghurt']

// A typed-in ingredient that already exists (by normalised name) is looked up
// with NO API call — findFoodByKey is a plain DB read — so re-typing something
// already in the grid never fires a request or creates a twin. Only a genuinely
// new name triggers describeFoods().
export default function NewIngredientField({
  onAdd,
  onCreated,
  showExamples,
}: {
  onAdd: (food: Food) => void
  onCreated: () => void
  showExamples?: boolean
}) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setError(null)
    const existing = findFoodByKey(trimmed)
    if (existing) {
      onAdd(existing)
      setName('')
      return
    }
    setBusy(true)
    try {
      const [profile] = await describeFoods([trimmed])
      if (!profile) throw new Error("Couldn't look that ingredient up — try rephrasing it.")
      const food = await insertFood({
        name: profile.name || trimmed,
        kcal_100g: profile.kcal_100g,
        protein_100g: profile.protein_100g,
        fat_100g: profile.fat_100g,
        carbs_100g: profile.carbs_100g,
        fiber_100g: profile.fiber_100g,
        serving_g: profile.serving_g,
        serving_label: profile.serving_label,
        food_groups: JSON.stringify(profile.food_groups),
        brand: profile.brand ?? null,
        barcode: null,
        source: 'claude',
        seed_count: 0,
        seed_slots: null,
        seed_last_used: null,
        archived: 0,
      })
      onAdd(food)
      onCreated()
      setName('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          className="field flex-1"
          placeholder="Type an ingredient…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
        />
        <button className="btn-ghost shrink-0" disabled={busy || !name.trim()} onClick={() => void submit()}>
          {busy ? '…' : '+ Add'}
        </button>
      </div>
      {error && <p className="text-xs text-red-300">{error}</p>}
      {showExamples && (
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" className="chip" onClick={() => setName(ex)}>
              {ex}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
