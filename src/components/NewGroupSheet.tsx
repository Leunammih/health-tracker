import { useMemo, useState } from 'react'
import { EMOJI_PREFIX, GlyphIcon, GroupIcon, searchGlyphs } from './metricIcons'

// Create a category from scratch — a name and, optionally, an icon.
//
// Not window.prompt(): a bare browser prompt is jarring against the app's own
// sheet-based design (every other "add" surface — AddMetricSheet, EditGroupSheet —
// is a bottom sheet), and standalone iOS PWAs render native prompt() inconsistently.
export default function NewGroupSheet({
  onAdd,
  onClose,
}: {
  onAdd: (label: string, icon?: string) => void
  onClose: () => void
}) {
  const [label, setLabel] = useState('')
  const [iconQuery, setIconQuery] = useState('')
  const [icon, setIcon] = useState<string | undefined>(undefined)
  const [emoji, setEmoji] = useState('')
  const matches = useMemo(() => searchGlyphs(iconQuery), [iconQuery])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-2xl border-t border-ink-700 bg-ink-900 p-4 pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[17px] text-cream">New category</span>
          <button className="text-sm text-ink-400 hover:text-cream" onClick={onClose}>
            Cancel
          </button>
        </div>

        <label className="label">Name</label>
        <input
          className="field"
          autoFocus
          placeholder="e.g. 'Sports', 'Home', 'Mind'"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />

        <div className="mt-3">
          <div className="label">Icon</div>
          <input
            className="field !py-1.5 text-sm"
            placeholder="Search — 'ball', 'water', 'outdoors'…"
            value={iconQuery}
            onChange={(e) => setIconQuery(e.target.value)}
          />
          <div className="mt-2 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
            <button
              type="button"
              aria-label="Default icon"
              onClick={() => { setIcon(undefined); setEmoji('') }}
              className={`flex h-9 w-9 items-center justify-center rounded-xl border ${
                !icon ? 'border-brand-500 text-cream' : 'border-ink-700 text-ink-400'
              }`}
            >
              <GroupIcon group="other" size={18} />
            </button>
            {matches.map((name) => (
              <button
                key={name}
                type="button"
                aria-label={name}
                title={name}
                onClick={() => { setIcon(name); setEmoji('') }}
                className={`flex h-9 w-9 items-center justify-center rounded-xl border ${
                  icon === name ? 'border-brand-500 text-cream' : 'border-ink-700 text-ink-400'
                }`}
              >
                <GlyphIcon name={name} size={18} />
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input
              className="field !w-20 !py-1.5 text-center text-lg"
              placeholder="🙂"
              maxLength={4}
              value={emoji}
              onChange={(e) => {
                const v = [...e.target.value.trim()].slice(0, 2).join('')
                setEmoji(v)
                setIcon(v ? EMOJI_PREFIX + v : undefined)
              }}
            />
            <span className="text-xs text-ink-400">…or type an emoji.</span>
          </div>
        </div>

        <button
          className="btn-primary mt-4 w-full"
          disabled={!label.trim()}
          onClick={() => onAdd(label.trim(), icon)}
        >
          Create category
        </button>
      </div>
    </div>
  )
}
