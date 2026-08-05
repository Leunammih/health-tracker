import { useState } from 'react'
import { gramsOf, itemMacros, type BuildItem } from '../lib/mealBuild'
import type { PrepTag } from '../types'

const PREP_TAGS: PrepTag[] = ['raw', 'steamed', 'boiled', 'fried', 'baked', 'grilled']

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

// Serving_label reads like "1 avocado" — strip the leading "1 " so it can sit
// next to the live count ("2 avocado").
function stripLeadingOne(label: string): string {
  return label.replace(/^1\s+/, '')
}

// One ingredient row in the builder: a stepper (0.5 steps up to 2 servings, then
// whole servings) or an exact-grams field, a collapsible prep tag, and a remove
// button. Cooking method is recorded here only — see mealBuild.ts's comment on
// BuildItem.prep — it never changes the macros shown.
export default function BuildItemRow({
  item,
  onChange,
  onRemove,
}: {
  item: BuildItem
  onChange: (patch: Partial<BuildItem>) => void
  onRemove: () => void
}) {
  const [prepOpen, setPrepOpen] = useState(false)
  const macros = itemMacros(item)
  const grams = gramsOf(item)

  function step(s: number): number {
    return s < 2 ? 0.5 : 1
  }
  function dec() {
    onChange({ servings: Math.max(0.5, round1(item.servings - step(item.servings))) })
  }
  function inc() {
    onChange({ servings: round1(item.servings + step(item.servings)) })
  }

  return (
    <div className="rounded-xl bg-ink-900 p-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 truncate text-sm text-cream">{item.name}</div>
        <div className="shrink-0 text-xs text-ink-400">
          {item.per100 ? `${macros.calories} kcal` : <span className="text-amber-300">no numbers</span>}
        </div>
        <button
          className="shrink-0 rounded-lg px-2 py-1 text-ink-400 hover:bg-ink-700 hover:text-red-400"
          onClick={onRemove}
          aria-label="Remove ingredient"
        >
          ✕
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2">
        {item.mode === 'servings' ? (
          <>
            <button type="button" className="btn-ghost !h-8 !w-8 !p-0 text-base" onClick={dec} aria-label="Fewer">
              −
            </button>
            <div className="w-20 text-center text-sm text-cream">
              {item.servings}
              {item.servingLabel && <span className="text-ink-400"> {stripLeadingOne(item.servingLabel)}</span>}
            </div>
            <button type="button" className="btn-ghost !h-8 !w-8 !p-0 text-base" onClick={inc} aria-label="More">
              +
            </button>
            <span className="text-xs text-ink-500">≈ {Math.round(grams)} g</span>
          </>
        ) : (
          <>
            <input
              type="number"
              inputMode="decimal"
              className="field w-24 !py-1.5 text-center"
              value={item.grams ?? 0}
              onChange={(e) => onChange({ grams: Number(e.target.value) })}
            />
            <span className="text-xs text-ink-500">g</span>
          </>
        )}
        <button
          type="button"
          className="ml-auto text-xs text-brand-300 underline"
          onClick={() =>
            onChange(
              item.mode === 'servings'
                ? { mode: 'grams', grams: Math.round(grams * 10) / 10 }
                : { mode: 'servings', servings: item.servingG ? (item.grams ?? item.servingG) / item.servingG : 1 },
            )
          }
        >
          {item.mode === 'servings' ? 'Use grams' : 'Use servings'}
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {item.prep && !prepOpen ? (
          <button type="button" className="chip-on" onClick={() => setPrepOpen(true)}>
            {item.prep}
          </button>
        ) : (
          PREP_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              className={item.prep === tag ? 'chip-on' : 'chip'}
              onClick={() => {
                onChange({ prep: item.prep === tag ? null : tag })
                setPrepOpen(false)
              }}
            >
              {tag}
            </button>
          ))
        )}
      </div>
    </div>
  )
}
