import { useEffect, useMemo, useRef, useState } from 'react'
import { analyseMeal, analyseMealText, analyseMealsText } from '../ai/anthropic'
import { saveMeal, updateMeal, deleteMeal, recentMeals, mealsSince, mealItems, foodsByIds } from '../db/queries'
import { prepareImage, type PreparedImage } from '../lib/image'
import { isConfigured, pushPhoto } from '../sync/dropbox'
import { todayISO, nowTime, fmtDate } from '../lib/dates'
import { uid } from '../lib/id'
import { IconCamera, IconMic, IconMeal } from '../components/icons'
import GoalProgress from '../components/GoalProgress'
import QuickAddMeals from '../components/QuickAddMeals'
import MealBuilder from '../components/MealBuilder'
import { loadGoals, hasAnyGoal, totalsFor } from '../lib/goals'
import { mealToAnalysis } from '../lib/meals'
import { ensureFoodSeed } from '../lib/foodSeed'
import { builderInitFromMeal, type BuilderInit } from '../lib/mealBuild'
import type { MealAnalysis, Ingredient, Meal, MealType, MultiMealItem } from '../types'

type Phase = 'input' | 'analysing' | 'review' | 'multiReview' | 'build'
type CaptureMode = 'choose' | 'text'
// 'single' -> analyseMealText (one MealAnalysis). 'multiMeal'/'multiDay' both go through
// analyseMealsText (record_meals); the only difference is whether the multi-day prompt
// block is included, which controls whether Claude is willing to spread meals across
// more than one date instead of collapsing everything onto the reference date.
type DictateMode = 'single' | 'multiMeal' | 'multiDay'

const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
]
function mealTypeLabel(t: string | null): string {
  return MEAL_TYPES.find((m) => m.value === t)?.label ?? ''
}

export default function NutritionTab() {
  const fileRef = useRef<HTMLInputElement>(null)
  const attachFileRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>('input')
  const [captureMode, setCaptureMode] = useState<CaptureMode>('choose')
  const [image, setImage] = useState<PreparedImage | null>(null)
  const [analysis, setAnalysis] = useState<MealAnalysis | null>(null)
  const [answer, setAnswer] = useState('')
  const [extraItems, setExtraItems] = useState('')
  const [describeText, setDescribeText] = useState('')
  const [date, setDate] = useState(todayISO())
  const [savePhoto, setSavePhoto] = useState(isConfigured())
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [dictateMode, setDictateMode] = useState<DictateMode>('single')
  const [multiMeals, setMultiMeals] = useState<MultiMealItem[] | null>(null)
  const [savingMulti, setSavingMulti] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [existingPhotoPath, setExistingPhotoPath] = useState<string | null>(null)
  const [entryTime, setEntryTime] = useState<string | null>(null)
  const [ingredientsDirty, setIngredientsDirty] = useState(false)

  // Tap-to-build state. builderMealId set (non-null) means the builder is editing
  // an existing meal rather than creating a new one — separate from `editingId`,
  // which is only ever read by the plain review-form save path.
  const [builderMealId, setBuilderMealId] = useState<string | null>(null)
  const [builderPhotoPath, setBuilderPhotoPath] = useState<string | null>(null)
  const [builderInit, setBuilderInit] = useState<BuilderInit | null>(null)

  // One-time, idempotent (see foodSeed.ts's meta flag) — mines historical meals so
  // the tap-to-build ingredient grid has something to rank on the first time it's
  // opened. Runs on mount here (not in App.tsx's boot effect) so it happens after
  // initDb + any Dropbox pull have already settled, not racing them.
  useEffect(() => {
    void ensureFoodSeed()
  }, [])

  const meals = useMemo(() => recentMeals(10), [refreshKey, phase])
  // Today's totals vs. the goals set in Settings. Read from the DB (not from
  // `meals`, which is capped at 10 rows) on the same deps as the list above, so
  // saving, editing or deleting a meal moves the bars straight away.
  const today = useMemo(() => {
    const t = todayISO()
    const todayMeals = mealsSince(t).filter((m) => m.date === t)
    return { goals: loadGoals(), totals: totalsFor(todayMeals), mealCount: todayMeals.length, label: fmtDate(t) }
  }, [refreshKey, phase])

  // Group the flat multiMeals array by date for display, without changing how it's
  // indexed — updateMultiMeal/removeMultiMeal still address the original array, so a
  // per-row date edit just moves that row to a different group on the next render.
  const multiMealGroups = useMemo(() => {
    if (!multiMeals) return []
    const groups = new Map<string, number[]>()
    multiMeals.forEach((m, i) => {
      const key = m.date || date
      const bucket = groups.get(key)
      if (bucket) bucket.push(i)
      else groups.set(key, [i])
    })
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [multiMeals, date])

  // "Now" is only a meaningful clock signal for meal_type inference if we're actually
  // logging for today — for a backfilled past day it would mislead the model into
  // thinking a lunch dictated at 9pm was dinner.
  function contextTime(): string | undefined {
    return date === todayISO() ? nowTime() : undefined
  }

  async function onPick(file: File) {
    setError(null)
    try {
      const prepared = await prepareImage(file)
      setImage(prepared)
      setPhase('analysing')
      const res = await analyseMeal(prepared.base64, prepared.mediaType, undefined, date, contextTime())
      setAnalysis(res)
      setIngredientsDirty(false)
      setPhase('review')
    } catch (e) {
      setError(msg(e))
      setPhase('input')
    }
  }

  async function onDescribe() {
    if (!describeText.trim()) return
    setError(null)
    setPhase('analysing')
    try {
      if (dictateMode !== 'single') {
        const meals = await analyseMealsText(describeText.trim(), date, dictateMode === 'multiDay')
        setMultiMeals(meals)
        setPhase('multiReview')
      } else {
        const res = await analyseMealText(describeText.trim(), date, contextTime())
        setAnalysis(res)
        setIngredientsDirty(false)
        setPhase('review')
      }
    } catch (e) {
      setError(msg(e))
      setPhase('input')
    }
  }

  function updateMultiMeal(idx: number, patch: Partial<MultiMealItem>) {
    setMultiMeals((list) => (list ? list.map((m, i) => (i === idx ? { ...m, ...patch } : m)) : list))
  }
  function removeMultiMeal(idx: number) {
    setMultiMeals((list) => (list ? list.filter((_, i) => i !== idx) : list))
  }

  async function saveAllMultiMeals() {
    if (!multiMeals?.length) return
    setSavingMulti(true)
    setError(null)
    try {
      for (const m of multiMeals) {
        const analysis: MealAnalysis = {
          name: m.name,
          ingredients: m.ingredients,
          calories: m.calories,
          protein_g: m.protein_g,
          fat_g: m.fat_g,
          carbs_g: m.carbs_g,
          fiber_g: m.fiber_g,
          confidence: m.confidence,
          clarifying_questions: [],
          meal_type: m.meal_type,
          food_groups: m.food_groups,
        }
        await saveMeal(analysis, m.date, m.meal_time || null, null, 'text', describeText.trim() || null)
      }
      setNote(`${multiMeals.length} meals saved.`)
      resetForm()
      setRefreshKey((k) => k + 1)
      setTimeout(() => setNote(null), 2500)
    } catch (e) {
      setError(msg(e))
    } finally {
      setSavingMulti(false)
    }
  }

  async function onAttachPhoto(file: File) {
    setError(null)
    try {
      const prepared = await prepareImage(file)
      setImage(prepared)
    } catch (e) {
      setError(msg(e))
    }
  }

  async function reEstimate() {
    if (!analysis) return
    setError(null)
    setPhase('analysing')
    try {
      // Feed the current (possibly hand-edited) ingredient list, extra
      // items, and any answer back to Claude so it re-estimates from the truth.
      const parts: string[] = []
      const ings = analysis.ingredients.filter((i) => i.name.trim())
      if (ings.length) {
        parts.push(
          'Corrected ingredient list (treat as authoritative): ' +
            ings.map((i) => `${i.name}${i.quantity ? ` (${i.quantity})` : ''}`).join(', '),
        )
      }
      if (extraItems.trim()) parts.push(`Also eaten, not previously mentioned: ${extraItems.trim()}`)
      if (answer.trim()) parts.push(answer.trim())
      const hint = parts.join('. ')
      const res = image
        ? await analyseMeal(image.base64, image.mediaType, hint, date, contextTime())
        : await analyseMealText([describeText.trim(), hint].filter(Boolean).join('. '), date, contextTime())
      setAnalysis((prev) => ({ ...res, meal_type: prev?.meal_type ?? res.meal_type }))
      setAnswer('')
      setExtraItems('')
      setIngredientsDirty(false)
      setPhase('review')
    } catch (e) {
      setError(msg(e))
      setPhase('review')
    }
  }

  async function save() {
    if (!analysis) return
    try {
      let photoPath = existingPhotoPath
      if (image && savePhoto && isConfigured()) {
        photoPath = await pushPhoto(image.bytes, `${date}-${uid().slice(0, 8)}.jpg`)
      }
      const hasPhoto = !!photoPath
      const hasText = !!describeText.trim()
      const source = hasPhoto && hasText ? 'mixed' : hasPhoto ? 'photo' : 'text'
      const notes = describeText.trim() || null

      if (editingId) {
        await updateMeal(editingId, analysis, date, entryTime, photoPath, source, notes)
        setNote('Meal updated.')
      } else {
        await saveMeal(analysis, date, entryTime ?? nowTime(), photoPath, source, notes)
        setNote('Meal saved.')
      }
      resetForm()
      setRefreshKey((k) => k + 1)
      setTimeout(() => setNote(null), 2500)
    } catch (e) {
      setError(msg(e))
    }
  }

  function resetForm() {
    setPhase('input')
    setCaptureMode('choose')
    setImage(null)
    setAnalysis(null)
    setAnswer('')
    setExtraItems('')
    setDescribeText('')
    setEditingId(null)
    setExistingPhotoPath(null)
    setEntryTime(null)
    setIngredientsDirty(false)
    setDate(todayISO())
    setDictateMode('single')
    setMultiMeals(null)
    setBuilderMealId(null)
    setBuilderPhotoPath(null)
    setBuilderInit(null)
  }

  function startEditMeal(m: Meal) {
    setError(null)
    // A meal built with the tap-to-build builder has meal_items rows underneath
    // it — route those to the builder so they can be edited item by item, rather
    // than as five flattened macro numbers in the plain review form.
    const items = mealItems(m.id)
    if (items.length) {
      const foodIds = items.map((i) => i.food_id).filter((id): id is string => !!id)
      setBuilderMealId(m.id)
      setBuilderPhotoPath(m.photo_path)
      setBuilderInit(builderInitFromMeal(m, items, foodsByIds(foodIds)))
      setPhase('build')
      return
    }
    setEditingId(m.id)
    setExistingPhotoPath(m.photo_path)
    setEntryTime(m.time)
    setDate(m.date)
    setImage(null)
    setDescribeText(m.notes ?? '')
    setAnswer('')
    setExtraItems('')
    setIngredientsDirty(false)
    setAnalysis(mealToAnalysis(m))
    setPhase('review')
  }

  // Same pre-fill as edit, but WITHOUT setting editingId/builderMealId — save()
  // then creates a new row instead of overwriting the original. Defaults to
  // today/now since a duplicate means "eating this again", not backdating the
  // source.
  function duplicateMeal(m: Meal) {
    setError(null)
    const items = mealItems(m.id)
    if (items.length) {
      const foodIds = items.map((i) => i.food_id).filter((id): id is string => !!id)
      const init = builderInitFromMeal(m, items, foodsByIds(foodIds))
      setBuilderMealId(null)
      setBuilderPhotoPath(null)
      setBuilderInit({ ...init, date: todayISO(), time: null })
      setPhase('build')
      return
    }
    setEditingId(null)
    setExistingPhotoPath(m.photo_path)
    setEntryTime(null)
    setDate(todayISO())
    setImage(null)
    setDescribeText(m.notes ?? '')
    setAnswer('')
    setExtraItems('')
    setIngredientsDirty(false)
    setAnalysis(mealToAnalysis(m))
    setPhase('review')
  }

  function patch(p: Partial<MealAnalysis>) {
    setAnalysis((a) => (a ? { ...a, ...p } : a))
  }

  function updateIngredient(idx: number, field: keyof Ingredient, value: string) {
    setAnalysis((a) => {
      if (!a) return a
      const ingredients = a.ingredients.map((ing, i) => (i === idx ? { ...ing, [field]: value } : ing))
      return { ...a, ingredients }
    })
    setIngredientsDirty(true)
  }
  function addIngredient() {
    setAnalysis((a) => (a ? { ...a, ingredients: [...a.ingredients, { name: '', quantity: '' }] } : a))
    setIngredientsDirty(true)
  }
  function removeIngredient(idx: number) {
    setAnalysis((a) => (a ? { ...a, ingredients: a.ingredients.filter((_, i) => i !== idx) } : a))
    setIngredientsDirty(true)
  }

  async function removeMeal(id: string) {
    if (!confirm('Delete this meal? This cannot be undone.')) return
    try {
      await deleteMeal(id)
      setRefreshKey((k) => k + 1)
    } catch (e) {
      setError(msg(e))
    }
  }

  return (
    <div className="space-y-4">
      {note && (
        <div className="rounded-xl border border-brand-500/40 bg-brand-500/10 px-3 py-2 text-sm text-brand-300">{note}</div>
      )}
      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>
      )}

      {phase === 'input' && hasAnyGoal(today.goals) && (
        <GoalProgress goals={today.goals} totals={today.totals} title={`Today · ${today.label}`} />
      )}
      {phase === 'input' && !hasAnyGoal(today.goals) && today.mealCount > 0 && (
        <p className="text-xs text-ink-400">
          Today: {Math.round(today.totals.calories).toLocaleString()} kcal ·{' '}
          {Math.round(today.totals.protein_g).toLocaleString()} g protein. Set daily goals in Settings to
          track progress against them.
        </p>
      )}

      {phase === 'input' && captureMode === 'choose' && (
        <QuickAddMeals onAdded={() => setRefreshKey((k) => k + 1)} />
      )}

      {phase === 'input' && captureMode === 'choose' && (
        <div className="card space-y-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void onPick(f)
              e.target.value = ''
            }}
          />
          <button
            className="btn-primary w-full py-6 text-base"
            onClick={() => { setBuilderMealId(null); setBuilderPhotoPath(null); setBuilderInit(null); setPhase('build') }}
          >
            <IconMeal width={22} height={22} /> Build from ingredients
          </button>
          <button className="btn-ghost w-full py-4 text-base" onClick={() => fileRef.current?.click()}>
            <IconCamera width={20} height={20} /> Photograph a meal
          </button>
          <button className="btn-ghost w-full py-4 text-base" onClick={() => setCaptureMode('text')}>
            <IconMic width={20} height={20} /> Dictate a meal
          </button>
          <p className="text-xs text-ink-400">
            Tap your usual ingredients — no API call. Photo and dictation still use Claude to estimate from a
            picture or description.
          </p>
        </div>
      )}

      {phase === 'input' && captureMode === 'text' && (
        <div className="card space-y-3">
          <div className="flex items-center gap-2 text-ink-300">
            <IconMic width={18} height={18} />
            <span className="text-sm">Dictate or type this meal</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className={dictateMode === 'single' ? 'chip-on' : 'chip'} onClick={() => setDictateMode('single')}>
              One meal
            </button>
            <button type="button" className={dictateMode === 'multiMeal' ? 'chip-on' : 'chip'} onClick={() => setDictateMode('multiMeal')}>
              Several meals
            </button>
            <button type="button" className={dictateMode === 'multiDay' ? 'chip-on' : 'chip'} onClick={() => setDictateMode('multiDay')}>
              Several days
            </button>
          </div>
          <div>
            <label className="label">{dictateMode === 'multiDay' ? 'Most recent day described' : 'Date'}</label>
            <input
              type="date"
              className="field !w-auto"
              value={date}
              max={todayISO()}
              onChange={(e) => setDate(e.target.value)}
            />
            {date !== todayISO() && (
              <p className="mt-1 text-xs text-amber-300">
                {dictateMode === 'multiDay' ? `Other days resolve relative to ${fmtDate(date)}.` : `Logging for ${fmtDate(date)}.`}
              </p>
            )}
          </div>
          <textarea
            className="field min-h-[7rem]"
            placeholder={
              dictateMode === 'multiDay'
                ? "E.g. 'Yesterday I had oatmeal for breakfast and a chicken salad for lunch. The day before, dinner was pasta with meatballs and I skipped lunch.'"
                : dictateMode === 'multiMeal'
                  ? "E.g. 'Breakfast was oatmeal with a banana. Lunch was a chicken caesar salad. Dinner was pasta with meatballs.'"
                  : "Tap here, then use the mic key on your keyboard. E.g. 'Bowl of oatmeal with a banana and peanut butter, about 350g total' or 'Chicken caesar salad, medium bowl, from the place downstairs'"
            }
            value={describeText}
            onChange={(e) => setDescribeText(e.target.value)}
          />
          <div className="flex gap-2">
            <button className="btn-primary flex-1" disabled={!describeText.trim()} onClick={() => void onDescribe()}>
              {dictateMode === 'single' ? 'Estimate nutrition' : 'Split into meals'}
            </button>
            <button className="btn-ghost" onClick={() => setCaptureMode('choose')}>
              Cancel
            </button>
          </div>
          {dictateMode === 'multiMeal' && (
            <p className="text-xs text-ink-400">
              Claude will look for breakfast/lunch/dinner/snack and time words to split this into separate meals, all on {fmtDate(date)}.
            </p>
          )}
          {dictateMode === 'multiDay' && (
            <p className="text-xs text-ink-400">
              Claude will look for day words ("yesterday", "on Saturday") as well as meal words to split this across both meals and days.
            </p>
          )}
        </div>
      )}

      {phase === 'analysing' && (
        <div className="card space-y-3">
          {image && <img src={image.dataUrl} className="max-h-56 w-full rounded-xl object-cover" alt="meal" />}
          <div className="flex items-center gap-3 text-ink-300">
            <span className="h-3 w-3 animate-pulse rounded-full bg-brand-400" />
            {dictateMode !== 'single' ? 'Splitting into meals…' : 'Estimating nutrition…'}
          </div>
        </div>
      )}

      {phase === 'build' && (
        <MealBuilder
          mealId={builderMealId}
          photoPath={builderPhotoPath}
          init={builderInit}
          onSaved={(m) => {
            setNote(m)
            resetForm()
            setRefreshKey((k) => k + 1)
            setTimeout(() => setNote(null), 2500)
          }}
          onCancel={resetForm}
        />
      )}

      {phase === 'multiReview' && multiMeals && (
        <div className="card space-y-4">
          <div>
            <div className="label">
              {multiMeals.length} meal{multiMeals.length === 1 ? '' : 's'} found
              {multiMealGroups.length > 1 ? ` across ${multiMealGroups.length} days` : ''}
            </div>
            <p className="text-xs text-ink-400">Check each one, adjust if needed, then save them all.</p>
          </div>
          <div className="space-y-4">
            {multiMealGroups.map(([groupDate, idxs]) => (
              <div key={groupDate} className="space-y-2">
                {multiMealGroups.length > 1 && (
                  <div className="flex items-center gap-2 border-t border-ink-700 pt-2 first:border-t-0 first:pt-0">
                    <span className="text-xs font-medium uppercase tracking-wide text-ink-400">{fmtDate(groupDate)}</span>
                    {groupDate !== date && (
                      <span className="text-xs text-amber-300">not {fmtDate(date)}</span>
                    )}
                  </div>
                )}
                <div className="space-y-3">
                  {idxs.map((i) => (
                    <MultiMealRow key={i} meal={multiMeals[i]} onChange={(p) => updateMultiMeal(i, p)} onRemove={() => removeMultiMeal(i)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
          {multiMeals.length === 0 && (
            <p className="text-sm text-ink-400">No meals left — add at least one or cancel.</p>
          )}
          <div className="flex gap-2">
            <button
              className="btn-primary flex-1"
              disabled={savingMulti || multiMeals.length === 0}
              onClick={() => void saveAllMultiMeals()}
            >
              {savingMulti ? 'Saving…' : `Save ${multiMeals.length} meal${multiMeals.length === 1 ? '' : 's'}`}
            </button>
            <button className="btn-ghost" onClick={resetForm}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {phase === 'review' && analysis && (
        <div className="card space-y-4">
          {editingId && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              Editing a saved meal.
            </div>
          )}

          {image && <img src={image.dataUrl} className="max-h-56 w-full rounded-xl object-cover" alt="meal" />}

          {!image && describeText.trim() && (
            <div className="rounded-lg bg-ink-900 px-3 py-2 text-xs text-ink-400">
              <div className="mb-0.5 text-ink-500">Your description</div>
              {describeText}
            </div>
          )}

          <div>
            <label className="label">Dish</label>
            <input className="field" value={analysis.name} onChange={(e) => patch({ name: e.target.value })} />
          </div>

          <div className="grid grid-cols-5 gap-2">
            <MacroField label="kcal" value={analysis.calories} onChange={(v) => patch({ calories: v })} />
            <MacroField label="Prot" value={analysis.protein_g} onChange={(v) => patch({ protein_g: v })} />
            <MacroField label="Fat" value={analysis.fat_g} onChange={(v) => patch({ fat_g: v })} />
            <MacroField label="Carb" value={analysis.carbs_g} onChange={(v) => patch({ carbs_g: v })} />
            <MacroField label="Fiber" value={analysis.fiber_g} onChange={(v) => patch({ fiber_g: v })} />
          </div>

          <div>
            <div className="label">Ingredients · confidence {analysis.confidence}</div>
            <div className="space-y-1.5">
              {analysis.ingredients.map((ing, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    className="field flex-1 !py-1.5"
                    value={ing.name}
                    placeholder="ingredient"
                    onChange={(e) => updateIngredient(i, 'name', e.target.value)}
                  />
                  <input
                    className="field w-28 !py-1.5"
                    value={ing.quantity}
                    placeholder="amount"
                    onChange={(e) => updateIngredient(i, 'quantity', e.target.value)}
                  />
                  <button
                    className="shrink-0 rounded-lg px-2 py-1 text-ink-400 hover:bg-ink-700 hover:text-red-400"
                    onClick={() => removeIngredient(i)}
                    aria-label="Remove ingredient"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button className="btn-ghost mt-2 !py-1.5 text-sm" onClick={addIngredient}>
              + Add ingredient
            </button>
            <p className="mt-1 text-xs text-ink-400">
              Tap any field to correct it. Edit the macros above directly, or re-estimate below.
            </p>
          </div>

          <div>
            <label className="label">Ate something not accounted for above?</label>
            <textarea
              className="field min-h-[3rem]"
              placeholder="e.g. 'a cup of blueberries, one kiwi, a slice of bread with almond butter'"
              value={extraItems}
              onChange={(e) => setExtraItems(e.target.value)}
            />
          </div>

          {analysis.clarifying_questions.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
              <div className="label !text-amber-300">To improve the estimate</div>
              <ul className="mb-2 list-disc space-y-1 pl-4 text-sm text-amber-100">
                {analysis.clarifying_questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
              <textarea
                className="field min-h-[3rem]"
                placeholder="Answer here, e.g. 'chicken was ~200g, cooked in 1 tbsp olive oil'"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
              />
            </div>
          )}

          {(answer.trim() || extraItems.trim() || analysis.clarifying_questions.length > 0 || ingredientsDirty) && (
            <button className="btn-ghost w-full" onClick={() => void reEstimate()}>
              Re-estimate from edits, extra items & answers
            </button>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <label className="label !mb-0">Date</label>
            <input
              type="date"
              className="field !w-auto"
              value={date}
              max={todayISO()}
              onChange={(e) => setDate(e.target.value)}
            />
            <label className="label !mb-0">Time</label>
            <input
              type="time"
              className="field !w-auto"
              value={entryTime ?? ''}
              onChange={(e) => setEntryTime(e.target.value || null)}
            />
          </div>

          <div>
            <label className="label">Meal type</label>
            <div className="flex flex-wrap gap-1.5">
              {MEAL_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  className={analysis.meal_type === t.value ? 'chip-on' : 'chip'}
                  onClick={() => patch({ meal_type: t.value })}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <input
            ref={attachFileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void onAttachPhoto(f)
              e.target.value = ''
            }}
          />
          {!image && (
            <div>
              {existingPhotoPath ? (
                <div className="flex items-center justify-between rounded-lg bg-ink-900 px-3 py-2 text-xs text-ink-400">
                  <span>📷 Photo already attached</span>
                  <button className="text-brand-300 underline" onClick={() => attachFileRef.current?.click()}>
                    Replace
                  </button>
                </div>
              ) : (
                <button className="btn-ghost flex w-full items-center justify-center gap-2 !py-2 text-sm" onClick={() => attachFileRef.current?.click()}>
                  <IconCamera width={16} height={16} /> Attach a photo{editingId ? '' : ' (optional — or add it later)'}
                </button>
              )}
            </div>
          )}

          {isConfigured() && image && (
            <label className="flex items-center gap-2 text-sm text-ink-300">
              <input type="checkbox" checked={savePhoto} onChange={(e) => setSavePhoto(e.target.checked)} />
              Also save the photo to Dropbox
            </label>
          )}

          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={() => void save()}>
              {editingId ? 'Save changes' : 'Save meal'}
            </button>
            <button className="btn-ghost" onClick={resetForm}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {phase === 'input' && captureMode === 'choose' && meals.length > 0 && (
        <div className="space-y-2">
          <div className="label">Recent meals</div>
          {meals.map((m) => (
            <div key={m.id} className="card flex items-start gap-3.5">
              <div className="min-w-0 flex-1">
                {/* Real meal names run long ("Homemade Nut & Seed Cereal with Rice
                    Milk") — the row holds the full wrapped title (up to ~4 lines)
                    rather than truncating it. */}
                <div className="text-[15px] leading-snug text-cream">{m.name}</div>
                <div className="mt-1.5 text-xs text-ink-500">
                  {fmtDate(m.date)}
                  {m.time ? ` · ${m.time}` : ''}
                  {m.meal_type ? ` · ${mealTypeLabel(m.meal_type)}` : ''}
                  {m.photo_path ? ' · 📷' : ''}
                  {m.source === 'text' ? ' · 🎙' : ''}
                  {m.source === 'builder' ? ' · 🥣' : ''}
                </div>
                <div className="mt-2 text-[13px] text-ink-300">
                  {m.calories ?? '—'} kcal ·{' '}
                  <span className="text-ink-500">
                    P{fmt(m.protein_g)} · F{fmt(m.fat_g)} · C{fmt(m.carbs_g)} · Fb{fmt(m.fiber_g)}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-1.5">
                <button
                  className="btn-ghost !h-[38px] w-16 !px-0 !py-0 text-xs"
                  onClick={() => startEditMeal(m)}
                  aria-label="Edit meal"
                >
                  Edit
                </button>
                <button
                  className="btn-ghost !h-[38px] w-16 !px-0 !py-0 text-xs"
                  onClick={() => duplicateMeal(m)}
                  aria-label="Duplicate meal"
                >
                  Duplicate
                </button>
                <button
                  className="btn-destructive !h-[38px] w-16 !px-0 !py-0 text-xs"
                  onClick={() => void removeMeal(m.id)}
                  aria-label="Delete meal"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MultiMealRow({
  meal,
  onChange,
  onRemove,
}: {
  meal: MultiMealItem
  onChange: (patch: Partial<MultiMealItem>) => void
  onRemove: () => void
}) {
  return (
    <div className="rounded-xl bg-ink-900 p-3">
      <div className="mb-2 flex items-center gap-2">
        <input
          className="field flex-1 !py-1.5 text-sm"
          value={meal.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        <button
          className="shrink-0 rounded-lg px-2 py-1 text-ink-400 hover:bg-ink-700 hover:text-red-400"
          onClick={onRemove}
          aria-label="Remove meal"
        >
          ✕
        </button>
      </div>
      <div className="mb-2 flex items-center gap-2">
        <input
          type="date"
          className="field !w-auto !py-1 text-xs"
          value={meal.date}
          max={todayISO()}
          onChange={(e) => onChange({ date: e.target.value })}
        />
        <input
          type="time"
          className="field !w-auto !py-1 text-xs"
          value={meal.meal_time}
          onChange={(e) => onChange({ meal_time: e.target.value })}
        />
      </div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {MEAL_TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            className={(meal.meal_type === t.value ? 'chip-on' : 'chip') + ' !py-1 text-xs'}
            onClick={() => onChange({ meal_type: t.value })}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        <MacroField label="kcal" value={meal.calories} onChange={(v) => onChange({ calories: v })} />
        <MacroField label="Prot" value={meal.protein_g} onChange={(v) => onChange({ protein_g: v })} />
        <MacroField label="Fat" value={meal.fat_g} onChange={(v) => onChange({ fat_g: v })} />
        <MacroField label="Carb" value={meal.carbs_g} onChange={(v) => onChange({ carbs_g: v })} />
        <MacroField label="Fiber" value={meal.fiber_g} onChange={(v) => onChange({ fiber_g: v })} />
      </div>
      {meal.ingredients.length > 0 && (
        <div className="mt-1.5 text-xs text-ink-400">
          {meal.ingredients.map((i) => `${i.name}${i.quantity ? ` (${i.quantity})` : ''}`).join(', ')}
        </div>
      )}
    </div>
  )
}

function MacroField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="label !text-[10px]">{label}</label>
      <input
        type="number"
        inputMode="decimal"
        className="field !px-2 !py-1.5 text-center"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}

function fmt(v: number | null): string {
  return v == null ? '—' : String(Math.round(v))
}
function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
