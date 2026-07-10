import { useMemo, useRef, useState } from 'react'
import { analyseMeal } from '../ai/anthropic'
import { saveMeal, deleteMeal, recentMeals } from '../db/queries'
import { prepareImage, type PreparedImage } from '../lib/image'
import { isConfigured, pushPhoto } from '../sync/nextcloud'
import { todayISO, nowTime, fmtDate } from '../lib/dates'
import { uid } from '../lib/id'
import { IconCamera } from '../components/icons'
import type { MealAnalysis, Ingredient } from '../types'

type Phase = 'input' | 'analysing' | 'review'

export default function NutritionTab() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>('input')
  const [image, setImage] = useState<PreparedImage | null>(null)
  const [analysis, setAnalysis] = useState<MealAnalysis | null>(null)
  const [answer, setAnswer] = useState('')
  const [extraItems, setExtraItems] = useState('')
  const [date, setDate] = useState(todayISO())
  const [savePhoto, setSavePhoto] = useState(isConfigured())
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

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

  async function reEstimate() {
    if (!image || !analysis) return
    setError(null)
    setPhase('analysing')
    try {
      // Feed the current (possibly hand-edited) ingredient list, extra off-photo
      // items, and any answer back to Claude so it re-estimates from the truth.
      const parts: string[] = []
      const ings = analysis.ingredients.filter((i) => i.name.trim())
      if (ings.length) {
        parts.push(
          'Corrected ingredient list (treat as authoritative): ' +
            ings.map((i) => `${i.name}${i.quantity ? ` (${i.quantity})` : ''}`).join(', '),
        )
      }
      if (extraItems.trim()) parts.push(`Also eaten, not visible in photo: ${extraItems.trim()}`)
      if (answer.trim()) parts.push(answer.trim())
      const res = await analyseMeal(image.base64, image.mediaType, parts.join('. '))
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
      let photoPath: string | null = null
      if (savePhoto && image && isConfigured()) {
        photoPath = await pushPhoto(image.bytes, `${date}-${uid().slice(0, 8)}.jpg`)
      }
      await saveMeal(analysis, date, nowTime(), photoPath)
      setNote('Meal saved.')
      setPhase('input')
      setImage(null)
      setAnalysis(null)
      setAnswer('')
      setExtraItems('')
      setRefreshKey((k) => k + 1)
      setTimeout(() => setNote(null), 2500)
    } catch (e) {
      setError(msg(e))
    }
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

      {phase === 'input' && (
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
          <p className="text-xs text-ink-400">
            Claude estimates ingredients, calories and macros, then asks to confirm portions.
          </p>
        </div>
      )}

      {phase === 'analysing' && (
        <div className="card space-y-3">
          {image && <img src={image.dataUrl} className="max-h-56 w-full rounded-xl object-cover" alt="meal" />}
          <div className="flex items-center gap-3 text-ink-300">
            <span className="h-3 w-3 animate-pulse rounded-full bg-brand-400" /> Estimating nutrition…
          </div>
        </div>
      )}

      {phase === 'review' && analysis && (
        <div className="card space-y-4">
          {image && <img src={image.dataUrl} className="max-h-56 w-full rounded-xl object-cover" alt="meal" />}

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
            <label className="label">Ate something not in the photo?</label>
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

          {isConfigured() && (
            <label className="flex items-center gap-2 text-sm text-ink-300">
              <input type="checkbox" checked={savePhoto} onChange={(e) => setSavePhoto(e.target.checked)} />
              Also save the photo to Nextcloud
            </label>
          )}

          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={() => void save()}>
              Save meal
            </button>
            <button
              className="btn-ghost"
              onClick={() => {
                setPhase('input')
                setAnalysis(null)
                setImage(null)
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {phase === 'input' && meals.length > 0 && (
        <div className="space-y-2">
          <div className="label">Recent meals</div>
          {meals.map((m) => (
            <div key={m.id} className="card flex items-center justify-between gap-2 !p-3">
              <div className="min-w-0">
                <div className="text-sm text-white">{m.name}</div>
                <div className="text-xs text-ink-400">{fmtDate(m.date)}</div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <div className="text-right text-xs text-ink-300">
                  <div className="text-sm font-semibold text-white">{m.calories ?? '—'} kcal</div>
                  <div>
                    P{fmt(m.protein_g)} · F{fmt(m.fat_g)} · C{fmt(m.carbs_g)} · Fb{fmt(m.fiber_g)}
                  </div>
                </div>
                <button
                  className="rounded-lg px-2 py-1 text-xs text-red-400 hover:bg-red-500/10"
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
