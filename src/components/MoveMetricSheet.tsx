import type { ResolvedGroup } from '../lib/groups'
import { GroupIcon, MetricIcon } from './metricIcons'
import { labelForTrack } from '../lib/metrics'

// Move one tracked item into a different category.
//
// Worth knowing before tapping: this is retroactive. Groups drive which Insights
// chart a metric is drawn on, so moving something moves ALL of its history to the
// other chart, not just what gets logged from now on.
export default function MoveMetricSheet({
  metric,
  currentGroup,
  groups,
  membersByGroup,
  onMove,
  onClose,
}: {
  metric: string
  currentGroup: string
  groups: ResolvedGroup[]
  membersByGroup?: Record<string, string[]>
  onMove: (group: string) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-2xl border-t border-ink-700 bg-ink-900 p-4 pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="flex items-center gap-2 text-[17px] text-cream">
            <MetricIcon name={metric} size={18} />
            Move {labelForTrack(metric)}
          </span>
          <button className="text-sm text-ink-400 hover:text-cream" onClick={onClose}>
            Cancel
          </button>
        </div>

        <div className="space-y-1.5">
          {groups.map((g) => {
            const members = (membersByGroup?.[g.key] ?? []).filter((m) => m !== metric)
            return (
              <button
                key={g.key}
                type="button"
                disabled={g.key === currentGroup}
                onClick={() => onMove(g.key)}
                className={`flex w-full flex-col gap-0.5 rounded-xl border px-3 py-2.5 text-left text-sm ${
                  g.key === currentGroup
                    ? 'border-brand-500 text-cream'
                    : 'border-ink-700 text-ink-300 hover:text-cream'
                }`}
              >
                <span className="flex w-full items-center gap-2">
                  <GroupIcon group={g.key} icon={g.icon} size={16} />
                  {g.label}
                  {g.key === currentGroup && <span className="ml-auto text-[11px] text-brand-500">current</span>}
                </span>
                {members.length > 0 && (
                  <span className="pl-6 text-[11px] text-ink-400">with {members.map(labelForTrack).join(', ')}</span>
                )}
              </button>
            )
          })}
        </div>

        <p className="mt-3 text-xs text-ink-400">
          This also changes which Insights chart it appears on — including everything you've already
          logged, not just from today.
        </p>
      </div>
    </div>
  )
}
