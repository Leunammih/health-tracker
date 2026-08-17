import { useMemo, useState } from 'react'
import DayStrip from './DayStrip'
import IngredientGrid from './IngredientGrid'
import BuildItemRow from './BuildItemRow'
import NewIngredientField from './NewIngredientField'
import FoodPickerSheet from './FoodPickerSheet'
import {
  buildTotals, buildToAnalysis, autoName, unknownCount, newBuildItem, type BuildItem, type BuilderInit,
} from '../lib/mealBuild'
import { rankFoodsForSlot, FOOD_LOOKBACK_DAYS, SLOT_GRID_SIZE } from '../lib/foodPatterns'
import { foodUsageForSlot, saveBuiltMeal, updateBuiltMeal, updateFood, loggedDates } from '../db/queries'
import { analyseMealText, describeFoods } from '../ai/anthropic'
import { todayISO, daysAgoISO, dateSpine, nowTime } from '../lib/dates'
import { mealTypeForHour } from '../lib/mealPatterns'
import { uid } from '../lib/id'
import type { Food, MealAnalysis, MealType } from '../types'

const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
]

const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']
function nextSlot(current: MealType): MealType {
  return MEAL_ORDER[(MEAL_ORDER.indexOf(current) + 1) % MEAL_ORDER.length]
}

// A meal staged mid-session by "+ Add another meal" — held in local state only,
// written to the DB in one batch when the whole session is saved.
interface StagedMeal {
  key: string
  date: string
  mealType: MealType
  time: string | null
  items: BuildItem[]
  name: string
  analysis: MealAnalysis
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

// Tap-to-build: pick a day and slot, tap your usual ingredients, adjust grams/prep,
// save — all local arithmetic, no API call unless a genuinely new ingredient needs
// looking up. One scrolling card, not a wizard: a 20-second task doesn't need four
// screens, and the app has no wizard idiom elsewhere.
export default function MealBuilder({
  mealId,
  photoPath,
  init,
  onSaved,
  onCancel,
}: {
  mealId: string | null
  photoPath: string | null
  init: BuilderInit | null
  onSaved: (message: string) => void
  onCancel: () => void
}) {
  const [date, setDate] = useState(init?.date ?? todayISO())
  const [slot, setSlot] = useState<MealType>(init?.mealType ?? mealTypeForHour(new Date().getHours()))
  const [time, setTime] = useState<string | null>(init?.time ?? null)
  const [items, setItems] = useState<BuildItem[]>(init?.items ?? [])
  const [name, setName] = useState(init?.name ?? '')
  const [nameTouched, setNameTouched] = useState(!!init?.name)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [busy, setBusy] = useState<'saving' | 'refining' | 'filling' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [foodsVersion, setFoodsVersion] = useState(0)
  const [claudeRefined, setClaudeRefined] = useState<MealAnalysis | null>(null)
  const [useClaude, setUseClaude] = useState(false)
  const [staged, setStaged] = useState<StagedMeal[]>([])

  const days = useMemo(() => dateSpine(daysAgoISO(13)), [])
  const marked = useMemo(() => loggedDates(daysAgoISO(13)), [])

  // Ranked once per slot — NOT re-ranked as items change, or the grid would
  // reshuffle under your thumb while you're mid-build (see foodPatterns.ts).
  const grid = useMemo(() => {
    const rows = foodUsageForSlot(slot, daysAgoISO(FOOD_LOOKBACK_DAYS))
    return rankFoodsForSlot(rows, slot, todayISO()).slice(0, SLOT_GRID_SIZE)
  }, [slot, foodsVersion])

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const item of items) {
      if (item.foodId) m.set(item.foodId, (m.get(item.foodId) ?? 0) + (item.mode === 'servings' ? item.servings : 1))
    }
    return m
  }, [items])

  const totals = buildTotals(items)
  const unknown = unknownCount(items)
  const missing = items.filter((i) => i.per100 == null && i.foodId)

  // Every mutation to the item list invalidates any pending "Use Claude's
  // numbers" comparison — applying stale numbers to a changed item list would be
  // silently wrong.
  function mutateItems(fn: (prev: BuildItem[]) => BuildItem[]) {
    setClaudeRefined(null)
    setUseClaude(false)
    setItems(fn)
  }

  function addFood(food: Food) {
    mutateItems((prev) => {
      const idx = prev.findIndex((i) => i.foodId === food.id && i.mode === 'servings')
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], servings: next[idx].servings + 1 }
        return next
      }
      if (prev.some((i) => i.foodId === food.id)) return prev // already added in grams mode
      return [...prev, newBuildItem(food)]
    })
  }

  function patchItem(key: string, patch: Partial<BuildItem>) {
    mutateItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)))
  }

  function removeItem(key: string) {
    mutateItems((prev) => prev.filter((i) => i.key !== key))
  }

  async function fillMissing() {
    if (!missing.length) return
    setBusy('filling')
    setError(null)
    try {
      const profiles = await describeFoods(missing.map((i) => i.name))
      for (let i = 0; i < missing.length && i < profiles.length; i++) {
        const item = missing[i]
        const p = profiles[i]
        if (!item.foodId || !p) continue
        await updateFood(item.foodId, {
          kcal_100g: p.kcal_100g,
          protein_100g: p.protein_100g,
          fat_100g: p.fat_100g,
          carbs_100g: p.carbs_100g,
          fiber_100g: p.fiber_100g,
          serving_g: p.serving_g,
          serving_label: p.serving_label,
          food_groups: JSON.stringify(p.food_groups),
          source: 'claude',
        })
      }
      setFoodsVersion((v) => v + 1)
      mutateItems((prev) =>
        prev.map((it) => {
          const i = missing.findIndex((m) => m.key === it.key)
          const p = i >= 0 ? profiles[i] : undefined
          if (!p) return it
          return {
            ...it,
            per100: {
              calories: p.kcal_100g, protein_g: p.protein_100g, fat_g: p.fat_100g,
              carbs_g: p.carbs_100g, fiber_g: p.fiber_100g,
            },
            servingG: it.servingG ?? p.serving_g,
            servingLabel: it.servingLabel ?? p.serving_label,
            foodGroups: p.food_groups,
          }
        }),
      )
    } catch (e) {
      setError(msg(e))
    } finally {
      setBusy(null)
    }
  }

  async function refineWithClaude() {
    if (!items.length) return
    setBusy('refining')
    setError(null)
    try {
      const slotLabel = MEAL_TYPES.find((t) => t.value === slot)?.label ?? 'Meal'
      const sentence = `${slotLabel}: ` + items.map((i) => `${i.name} (${describeAmount(i)})`).join(', ')
      const res = await analyseMealText(sentence, date, date === todayISO() ? nowTime() : undefined)
      setClaudeRefined(res)
      setUseClaude(false)
    } catch (e) {
      setError(msg(e))
    } finally {
      setBusy(null)
    }
  }

  function describeAmount(i: BuildItem): string {
    const grams = i.mode === 'grams' ? i.grams ?? 0 : (i.servingG ?? 100) * i.servings
    return i.prep ? `${Math.round(grams)} g, ${i.prep}` : `${Math.round(grams)} g`
  }

  function finalizeAnalysis(): MealAnalysis {
    const finalName = name.trim() || autoName(items) || 'Meal'
    return useClaude && claudeRefined
      ? { ...claudeRefined, name: finalName, meal_type: slot }
      : buildToAnalysis(items, finalName, slot)
  }

  // Queues the meal in progress and resets the card for the next one (same day,
  // next slot in the breakfast->lunch->dinner->snack cycle). Create-mode only —
  // edit mode never stages, it always saves the single meal being edited.
  function stageAndContinue() {
    if (!items.length) return
    setStaged((prev) => [...prev, { key: uid(), date, mealType: slot, time, items, name, analysis: finalizeAnalysis() }])
    setItems([])
    setName('')
    setNameTouched(false)
    setClaudeRefined(null)
    setUseClaude(false)
    setTime(null)
    setSlot(nextSlot(slot))
  }

  // Pulls a staged meal back into the editor. Whatever's currently in progress
  // (if anything) gets staged in its place, so nothing is silently lost.
  function editStaged(key: string) {
    const target = staged.find((s) => s.key === key)
    if (!target) return
    setStaged((prev) => {
      const rest = prev.filter((s) => s.key !== key)
      return items.length
        ? [...rest, { key: uid(), date, mealType: slot, time, items, name, analysis: finalizeAnalysis() }]
        : rest
    })
    setDate(target.date)
    setSlot(target.mealType)
    setTime(target.time)
    setItems(target.items)
    setName(target.name)
    setNameTouched(!!target.name)
    setClaudeRefined(null)
    setUseClaude(false)
  }

  function removeStaged(key: string) {
    setStaged((prev) => prev.filter((s) => s.key !== key))
  }

  async function save() {
    if (!items.length && !staged.length) return
    setBusy('saving')
    setError(null)
    try {
      if (mealId) {
        await updateBuiltMeal(mealId, finalizeAnalysis(), items, date, time, photoPath, null)
        onSaved('Meal updated.')
        return
      }
      const toSave: StagedMeal[] = items.length
        ? [...staged, { key: '', date, mealType: slot, time, items, name, analysis: finalizeAnalysis() }]
        : staged
      for (const m of toSave) {
        await saveBuiltMeal(m.analysis, m.items, m.date, m.time ?? nowTime(), null)
      }
      onSaved(toSave.length > 1 ? `${toSave.length} meals saved.` : 'Meal saved.')
    } catch (e) {
      setError(msg(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="card space-y-4">
      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>
      )}

      <div>
        <div className="label">Day</div>
        <DayStrip dates={days} selected={date} onSelect={setDate} marked={marked} />
      </div>

      <div>
        <div className="label">Meal</div>
        <div className="flex flex-wrap gap-1.5">
          {MEAL_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              className={slot === t.value ? 'chip-on' : 'chip'}
              onClick={() => setSlot(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="label">Your usual for this meal</div>
        {grid.length > 0 ? (
          <IngredientGrid foods={grid} counts={counts} onAdd={addFood} onOpenPicker={() => setPickerOpen(true)} />
        ) : (
          <button className="btn-ghost w-full !py-2 text-sm" onClick={() => setPickerOpen(true)}>
            Browse all ingredients…
          </button>
        )}
      </div>

      {!mealId && staged.length > 0 && (
        <div className="space-y-2">
          <div className="label">Staged this session</div>
          <div className="space-y-1.5">
            {staged.map((m) => (
              <div
                key={m.key}
                className="flex items-center justify-between rounded-xl border border-ink-700 bg-ink-800 px-3 py-2"
              >
                <button type="button" className="flex-1 text-left" onClick={() => editStaged(m.key)}>
                  <span className="text-sm text-cream">
                    {MEAL_TYPES.find((t) => t.value === m.mealType)?.label}: {m.name || autoName(m.items)}
                  </span>
                  <span className="ml-2 text-xs text-ink-400">{m.analysis.calories} kcal</span>
                </button>
                <button type="button" className="px-2 text-ink-400" onClick={() => removeStaged(m.key)}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className="space-y-2">
          <div className="label">Ingredients</div>
          <div className="space-y-2">
            {items.map((item) => (
              <BuildItemRow
                key={item.key}
                item={item}
                onChange={(patch) => patchItem(item.key, patch)}
                onRemove={() => removeItem(item.key)}
              />
            ))}
          </div>
        </div>
      )}

      <NewIngredientField
        onAdd={addFood}
        onCreated={() => setFoodsVersion((v) => v + 1)}
        showExamples={grid.length === 0 && items.length === 0}
      />

      {missing.length > 0 && (
        <button className="btn-ghost w-full !py-2 text-sm" disabled={busy === 'filling'} onClick={() => void fillMissing()}>
          {busy === 'filling' ? 'Looking up…' : `Fill in the ${missing.length} missing (1 Claude call)`}
        </button>
      )}

      {items.length > 0 && (
        // Deliberately NOT sticky: a sticky bar still occupies its normal-flow slot
        // but paints at a different screen position once "stuck", so with only a
        // couple of ingredients (barely any scroll room) it locks almost
        // immediately and visually covers whatever's still scrolling up behind it —
        // in practice, the "Fill in the missing" button and the new-ingredient
        // field just above it, which then look like they've vanished.
        <div className="rounded-xl border border-ink-700 bg-ink-800 px-4 py-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-ink-300">Total</span>
            <span className="font-serif text-xl text-cream">
              {totals.calories.toLocaleString()} kcal
              {unknown > 0 && <span className="ml-1 text-xs text-amber-300">+ {unknown} unknown</span>}
            </span>
          </div>
          <div className="text-xs text-ink-400">
            P{totals.protein_g} · F{totals.fat_g} · C{totals.carbs_g} · Fb{totals.fiber_g}
          </div>
        </div>
      )}

      {items.length > 0 && !claudeRefined && (
        <button className="btn-ghost w-full" disabled={busy === 'refining'} onClick={() => void refineWithClaude()}>
          {busy === 'refining' ? 'Refining…' : 'Refine all with Claude'}
        </button>
      )}

      {claudeRefined && (
        <div className="rounded-xl border border-brand-500/30 bg-brand-500/10 p-3">
          <div className="label !text-brand-300">Claude's estimate</div>
          <p className="text-sm text-cream">
            {claudeRefined.calories} kcal · P{claudeRefined.protein_g} · F{claudeRefined.fat_g} · C
            {claudeRefined.carbs_g} · Fb{claudeRefined.fiber_g}
          </p>
          <div className="mt-2 flex gap-2">
            <button className="btn-ghost flex-1 !py-1.5 text-sm" onClick={() => setUseClaude(true)}>
              {useClaude ? 'Using Claude’s numbers ✓' : "Use Claude's numbers"}
            </button>
            <button className="btn-ghost !py-1.5 text-sm" onClick={() => { setClaudeRefined(null); setUseClaude(false) }}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div>
        <label className="label">Dish name</label>
        <input
          className="field"
          value={name}
          placeholder={autoName(items) || 'e.g. Avocado, eggs & rye bread'}
          onChange={(e) => { setName(e.target.value); setNameTouched(true) }}
          onBlur={() => { if (!name.trim()) setNameTouched(false) }}
        />
        {!nameTouched && items.length > 0 && (
          <p className="mt-1 text-xs text-ink-400">Leave blank to use "{autoName(items)}".</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <label className="label !mb-0">Time</label>
        <input
          type="time"
          className="field !w-auto"
          value={time ?? ''}
          onChange={(e) => setTime(e.target.value || null)}
        />
      </div>

      {!mealId && items.length > 0 && (
        <button type="button" className="btn-ghost w-full" disabled={busy !== null} onClick={stageAndContinue}>
          + Add another meal ({MEAL_TYPES.find((t) => t.value === nextSlot(slot))?.label} next)
        </button>
      )}

      <div className="flex gap-2">
        <button
          className="btn-primary flex-1"
          disabled={busy === 'saving' || (items.length === 0 && staged.length === 0)}
          onClick={() => void save()}
        >
          {busy === 'saving'
            ? 'Saving…'
            : mealId
              ? 'Save changes'
              : staged.length > 0
                ? `Save all (${staged.length + (items.length ? 1 : 0)})`
                : 'Save meal'}
        </button>
        <button className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>

      {pickerOpen && (
        <FoodPickerSheet
          onAdd={(food) => addFood(food)}
          onClose={() => setPickerOpen(false)}
          onChanged={() => setFoodsVersion((v) => v + 1)}
          counts={counts}
        />
      )}
    </div>
  )
}
