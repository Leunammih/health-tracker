import { useState } from 'react'
import { SHAPE_LABEL, canonicalKey, isBuiltinKey, type MetricShape } from '../lib/customMetrics'
import { labelForTrack, type MetricGroup } from '../lib/metrics'
import { GLYPH_NAMES, MetricIcon, GroupIcon } from './metricIcons'

const SHAPES: MetricShape[] = ['duration', 'rating', 'checkmark', 'number']

const GROUP_TITLE: Record<MetricGroup, string> = {
  movement: 'Movement',
  practice: 'Practice',
  symptom: 'Health & pain',
  wellbeing: 'Wellbeing',
  other: 'Other',
}

// "Track something else" — the sheet behind the + on each group heading.
//
// The group arrives pre-chosen from whichever heading was tapped, so the only
// required decision is a name; shape defaults to a 0-10 rating, which is what most
// things he'd add by hand turn out to be.
export default function AddMetricSheet({
  group,
  existingKeys,
  onAdd,
  onClose,
}: {
  group: MetricGroup
  existingKeys: Set<string>
  onAdd: (spec: { label: string; group: MetricGroup; shape: MetricShape; lowerIsBetter?: boolean; icon?: string }) => void
  onClose: () => void
}) {
  const [label, setLabel] = useState('')
  const [shape, setShape] = useState<MetricShape>('rating')
  const [lowerIsBetter, setLowerIsBetter] = useState(group === 'symptom')
  const [icon, setIcon] = useState<string | undefined>(undefined)

  const key = canonicalKey(label)
  const taken = !!key && (isBuiltinKey(key) || existingKeys.has(key))
  const canAdd = !!key && !taken

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-2xl border-t border-ink-700 bg-ink-900 p-4 pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="flex items-center gap-2 text-[17px] text-cream">
            <GroupIcon group={group} size={16} />
            Track something else in {GROUP_TITLE[group]}
          </span>
          <button className="text-sm text-ink-400 hover:text-cream" onClick={onClose}>
            Cancel
          </button>
        </div>

        <label className="label">Name</label>
        <input
          className="field"
          autoFocus
          placeholder="e.g. 'sauna', 'water', 'neck tension'"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        {taken && (
          <p className="warn-box mt-2">
            {isBuiltinKey(key) ? `"${labelForTrack(key)}" already exists — add it from the Add row instead.` : 'You already track something with that name.'}
          </p>
        )}

        <div className="mt-3">
          <div className="label">What kind of thing is it?</div>
          <div className="flex flex-wrap gap-1.5">
            {SHAPES.map((sh) => (
              <button key={sh} type="button" className={shape === sh ? 'chip-on' : 'chip'} onClick={() => setShape(sh)}>
                {SHAPE_LABEL[sh]}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-ink-400">
            {shape === 'duration' && 'Minutes, summed over the day. Gets a Low / Med / High intensity too.'}
            {shape === 'rating' && 'A 0-10 slider, averaged if you log it more than once in a day.'}
            {shape === 'checkmark' && 'A yes/no tick — for things that either happened or did not.'}
            {shape === 'number' && 'A plain number (a count, a measurement). The day keeps the last one you enter.'}
          </p>
        </div>

        {shape === 'rating' && (
          <label className="mt-3 flex items-center gap-2 text-sm text-ink-300">
            <input
              type="checkbox"
              className="h-4 w-4 rounded accent-brand-500"
              checked={lowerIsBetter}
              onChange={(e) => setLowerIsBetter(e.target.checked)}
            />
            Lower is better (pain, tension — draws with 0 at the top)
          </label>
        )}

        <div className="mt-3">
          <div className="label">Icon</div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              aria-label="Use the group's own icon"
              onClick={() => setIcon(undefined)}
              className={`flex h-9 w-9 items-center justify-center rounded-xl border ${
                icon == null ? 'border-brand-500 text-cream' : 'border-ink-700 text-ink-400'
              }`}
            >
              <GroupIcon group={group} size={18} />
            </button>
            {GLYPH_NAMES.map((name) => (
              <button
                key={name}
                type="button"
                aria-label={name}
                onClick={() => setIcon(name)}
                className={`flex h-9 w-9 items-center justify-center rounded-xl border ${
                  icon === name ? 'border-brand-500 text-cream' : 'border-ink-700 text-ink-400'
                }`}
              >
                <MetricIcon name={name} size={18} />
              </button>
            ))}
          </div>
        </div>

        <button
          className="btn-primary mt-4 w-full"
          disabled={!canAdd}
          onClick={() => onAdd({ label: label.trim(), group, shape, lowerIsBetter: shape === 'rating' ? lowerIsBetter : undefined, icon })}
        >
          Add to {GROUP_TITLE[group]}
        </button>
        <p className="mt-2 text-xs text-ink-400">
          It appears as a row straight away, and shows up in Insights once you've logged it.
          Removing it later keeps everything you already recorded.
        </p>
      </div>
    </div>
  )
}
