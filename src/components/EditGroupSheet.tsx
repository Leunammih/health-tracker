import { useMemo, useState } from 'react'
import type { ResolvedGroup } from '../lib/groups'
import { EMOJI_PREFIX, GlyphIcon, GroupIcon, searchGlyphs } from './metricIcons'

// Rename a category, give it an icon, move it up or down, or delete it.
//
// Built-in categories can be renamed and reordered but NOT deleted: metrics fall
// back to `other` when nothing else claims them (see groupForTrack), so a database
// with those keys missing would have rows pointing at a category that isn't there.
export default function EditGroupSheet({
  group,
  isFirst,
  isLast,
  memberCount,
  onRename,
  onSetIcon,
  onMove,
  onDelete,
  onClose,
}: {
  group: ResolvedGroup
  isFirst: boolean
  isLast: boolean
  memberCount: number
  onRename: (label: string) => void
  onSetIcon: (icon: string | undefined) => void
  onMove: (delta: -1 | 1) => void
  onDelete: () => void
  onClose: () => void
}) {
  const [label, setLabel] = useState(group.label)
  const [iconQuery, setIconQuery] = useState('')
  const [emoji, setEmoji] = useState(group.icon?.startsWith(EMOJI_PREFIX) ? group.icon.slice(EMOJI_PREFIX.length) : '')
  const matches = useMemo(() => searchGlyphs(iconQuery), [iconQuery])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-2xl border-t border-ink-700 bg-ink-900 p-4 pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="flex items-center gap-2 text-[17px] text-cream">
            <GroupIcon group={group.key} icon={group.icon} size={16} />
            Edit category
          </span>
          <button className="text-sm text-ink-400 hover:text-cream" onClick={onClose}>
            Done
          </button>
        </div>

        <label className="label">Name</label>
        <div className="flex gap-2">
          <input
            className="field"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={() => label.trim() && label !== group.label && onRename(label)}
          />
          <button
            className="btn-primary shrink-0 !px-4"
            disabled={!label.trim() || label === group.label}
            onClick={() => onRename(label)}
          >
            Rename
          </button>
        </div>

        <div className="mt-3">
          <div className="label">Position</div>
          <div className="flex gap-2">
            <button className="btn-ghost flex-1 !py-2 text-sm" disabled={isFirst} onClick={() => onMove(-1)}>
              ↑ Move up
            </button>
            <button className="btn-ghost flex-1 !py-2 text-sm" disabled={isLast} onClick={() => onMove(1)}>
              ↓ Move down
            </button>
          </div>
        </div>

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
              onClick={() => { onSetIcon(undefined); setEmoji('') }}
              className={`flex h-9 w-9 items-center justify-center rounded-xl border ${
                !group.icon ? 'border-brand-500 text-cream' : 'border-ink-700 text-ink-400'
              }`}
            >
              <GroupIcon group={group.key} size={18} />
            </button>
            {matches.map((name) => (
              <button
                key={name}
                type="button"
                aria-label={name}
                title={name}
                onClick={() => { onSetIcon(name); setEmoji('') }}
                className={`flex h-9 w-9 items-center justify-center rounded-xl border ${
                  group.icon === name ? 'border-brand-500 text-cream' : 'border-ink-700 text-ink-400'
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
                onSetIcon(v ? EMOJI_PREFIX + v : undefined)
              }}
            />
            <span className="text-xs text-ink-400">…or type an emoji.</span>
          </div>
        </div>

        {group.isCustom ? (
          <button
            className="btn-destructive mt-4 w-full"
            onClick={() => {
              if (confirm(`Delete the "${group.label}" category? Its ${memberCount} item${memberCount === 1 ? '' : 's'} move to Other — nothing you've logged is lost.`)) onDelete()
            }}
          >
            Delete this category
          </button>
        ) : (
          <p className="mt-4 text-xs text-ink-400">
            This is one of the built-in categories. It can be renamed and reordered, but not deleted —
            items fall back to it when nothing else claims them.
          </p>
        )}
      </div>
    </div>
  )
}
