import { useMemo, useRef, useState } from 'react'
import { analyseMeal, analyseMealText, analyseMealsText } from '../ai/anthropic'
import { saveMeal, updateMeal, deleteMeal, recentMeals } from '../db/queries'
import { prepareImage, type PreparedImage } from '../lib/image'
import { isConfigured, pushPhoto } from '../sync/dropbox'
import { todayISO, nowTime, fmtDate } from '../lib/dates'
import { uid } from '../lib/id'
import { IconCamera, IconMic } from '../components/icons'
import type { MealAnalysis, Ingredient, Meal, MultiMealItem } from '../types'

type Phase = 'input' | 'analysing' | 'review' | 'multiReview'
type CaptureMode = 'choose' | 'text'

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
  const [isMultiMeal, setIsMultiMeal] = useState(false)
  const [multiMeals, setMultiMeals] = useState<MultiMealItem[] | null>(null)
  const [savingMulti, setSavingMulti] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [existingPhotoPath, setExistingPhotoPath] = useState<string | null>(null)
  const [entryTime, setEntryTime] = useState<string | null>(null)

  const meals = useMemo(() => recentMeals(10), [refreshKey, phase])

  async function onPick(file: File) {
    setError(null)
    try {
      const prepared = await prepareImage(file)
      setImage(prepared)
      setPhase('analysing')
      const res = await analyseMeal(prepared.base64, prepared.mediaType)
      setAnalysis(res)
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
      if (isMultiMeal) {
        const meals = await analyseMealsText(describeText.trim(), date)
        setMultiMeals(meals)
        setPhase('multiReview')
      } else {
        const res = await analyseMealText(describeText.trim())
        setAnalysis(res)
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
        ? await analyseMeal(image.base64, image.mediaType, hint)
        : await analyseMealText([describeText.trim(), hint].filter(Boolean).join('. '))
      setAnalysis(res)
      setAnswer('')
      setExtraItems('')
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
    setDate(todayISO())
    setIsMultiMeal(false)
    setMultiMeals(null)
  }

  function startEditMeal(m: Meal) {
    setError(null)
    setEditingId(m.id)
    setExistingPhotoPath(m.photo_path)
    setEntryTime(m.time)
    setDate(m.date)
    setImage(null)
    setDescribeText(m.notes ?? '')
    setAnswer('')
    setExtraItems('')
    setAnalysis({
      name: m.name ?? '',
      ingredients: parseIngredients(m.ingredients),
      calories: m.calories ?? 0,
      protein_g: m.protein_g ?? 0,
      fat_g: m.fat_g ?? 0,
      carbs_g: m.carbs_g ?? 0,
      fiber_g: m.fiber_g ?? 0,
      confidence: (m.confidence as MealAnalysis['confidence']) ?? 'medium',
      clarifying_questions: [],
    })
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
  }
  function addIngredient() {
    setAnalysis((a) => (a ? { ...a, ingredients: [...a.ingredients, { name: '', quantity: '' }] } : a))
  }
  function removeIngredient(idx: number) {
    setAnalysis((a) => (a ? { ...a, ingredients: a.ingredients.filter((_, i) => i !== idx) } : a))
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
          <button className="btn-primary w-full py-6 text-base" onClick={() => fileRef.current?.click()}>
            <IconCamera width={22} height={22} /> Photograph a meal
          </button>
          <button className="btn-ghost w-full py-4 text-base" onClick={() => setCaptureMode('text')}>
            <IconMic width={20} height={20} /> Dictate a meal
          </button>
          <p className="text-xs text-ink-400">
            Claude estimates ingredients, calories and macros, then asks to confirm portions. No photo? Dictate it
            instead and attach a picture later if you get one.
          </p>
        </div>
      )}

      {phase === 'input' && captureMode === 'text' && (
        <div className="card space-y-3">
          <div className="flex items-center gap-2 text-ink-300">
            <IconMic width={18} height={18} />
            <span className="text-sm">Dictate or type this meal</span>
          </div>
          <div>
            <label className="label">Date</label>
            <input
              type="date"
              className="field !w-auto"
              value={date}
              max={todayISO()}
              onChange={(e) => setDate(e.target.value)}
            />
            {date !== todayISO() && (
              <p className="mt-1 text-xs text-amber-300">Logging for {fmtDate(date)}.</p>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-300">
            <input
              type="checkbox"
              className="h-4 w-4 rounded accent-brand-500"
              checked={isMultiMeal}
              onChange={(e) => setIsMultiMeal(e.target.checked)}
            />
            This is more than one meal
          </label>
          <textarea
            className="field min-h-[7rem]"
            placeholder={
              isMultiMeal
                ? "E.g. 'Breakfast was oatmeal with a banana. Lunch was a chicken caesar salad. Yesterday's dinner was pasta with meatballs.'"
                : "Tap here, then use the mic key on your keyboard. E.g. 'Bowl of oatmeal with a banana and peanut butter, about 350g total' or 'Chicken caesar salad, medium bowl, from the place downstairs'"
            }
            value={describeText}
            onChange={(e) => setDescribeText(e.target.value)}
          />
          <div className="flex gap-2">
            <button className="btn-primary flex-1" disabled={!describeText.trim()} onClick={() => void onDescribe()}>
              {isMultiMeal ? 'Split into meals' : 'Estimate nutrition'}
            </button>
            <button className="btn-ghost" onClick={() => setCaptureMode('choose')}>
              Cancel
            </button>
          </div>
          {isMultiMeal && (
            <p className="text-xs text-ink-400">
              Claude will look for breakfast/lunch/dinner/snack and day words to split this into separate meals.
            </p>
          )}
        </div>
      )}

      {phase === 'analysing' && (
        <div className="card space-y-3">
          {image && <img src={image.dataUrl} className="max-h-56 w-full rounded-xl object-cover" alt="meal" />}
          <div className="flex items-center gap-3 text-ink-300">
            <span className="h-3 w-3 animate-pulse rounded-full bg-brand-400" />
            {isMultiMeal ? 'Splitting into meals…' : 'Estimating nutrition…'}
          </div>
        </div>
      )}

      {phase === 'multiReview' && multiMeals && (
        <div className="card space-y-4">
          <div>
            <div className="label">{multiMeals.length} meals found</div>
            <p className="text-xs text-ink-400">Check each one, adjust if needed, then save them all.</p>
          </div>
          <div className="space-y-3">
            {multiMeals.map((m, i) => (
              <MultiMealRow key={i} meal={m} onChange={(p) => updateMultiMeal(i, p)} onRemove={() => removeMultiMeal(i)} />
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

          {(answer.trim() || extraItems.trim() || analysis.clarifying_questions.length > 0) && (
            <button className="btn-ghost w-full" onClick={() => void reEstimate()}>
              Re-estimate from edits, extra items & answers
            </button>
          )}

          <div className="flex items-center gap-3">
            <label className="label !mb-0">Date</label>
            <input type="date" className="field !w-auto" value={date} onChange={(e) => setDate(e.target.value)} />
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
            <div key={m.id} className="card flex items-center justify-between gap-2 !p-3">
              <div className="min-w-0">
                <div className="text-sm text-white">{m.name}</div>
                <div className="text-xs text-ink-400">
                  {fmtDate(m.date)}
                  {m.photo_path ? ' · 📷' : ''}
                  {m.source === 'text' ? ' · 🎙' : ''}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <div className="text-right text-xs text-ink-300">
                  <div className="text-sm font-semibold text-white">{m.calories ?? '—'} kcal</div>
                  <div>
                    P{fmt(m.protein_g)} · F{fmt(m.fat_g)} · C{fmt(m.carbs_g)} · Fb{fmt(m.fiber_g)}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    className="rounded-lg px-2 py-1 text-xs text-ink-300 hover:bg-ink-700"
                    onClick={() => startEditMeal(m)}
                    aria-label="Edit meal"
                  >
                    Edit
                  </button>
                  <button
                    className="rounded-lg px-2 py-1 text-xs text-red-400 hover:bg-red-500/10"
                    onClick={() => void removeMeal(m.id)}
                    aria-label="Delete meal"
                  >
                    Delete
                  </button>
                </div>
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

function parseIngredients(json: string | null): Ingredient[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function fmt(v: number | null): string {
  return v == null ? '—' : String(Math.round(v))
}
function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
