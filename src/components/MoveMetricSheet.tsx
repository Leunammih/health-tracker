import { useState } from 'react'
import { GroupIcon, MetricIcon } from './metricIcons'
import { axisKindFor, chartMemberLabel, combineVerdict, defaultChartFor, FIXED_CHART_TITLES, FIXED_DEFAULTS, FX_ILLNESS, FX_WELLBEING, ownChart, type Verdict } from '../lib/chartLayout'

// A category, or one of the two fixed sections (Wellbeing & sleep, Illness & gut).
export interface Destination {
  key: string
  label: string
  icon?: string
}
type ResolvedGroup = Destination

// The fixed sections have no category icon of their own; borrow the matching one.
const iconGroup = (key: string) => (key === FX_WELLBEING ? 'wellbeing' : key === FX_ILLNESS ? 'symptom' : key)

export interface ChartOption {
  id: string
  title: string
  members: string[]
}

// Move one tracked item into a different category — and, from Insights, onto an
// exact chart in it (G-13).
//
// Worth knowing before tapping: this is retroactive. Groups drive which Insights
// chart a metric is drawn on, so moving something moves ALL of its history to the
// other chart, not just what gets logged from now on.
//
// With `charts` (Insights): step 1 picks the category, step 2 the chart inside it,
// each marked with what combining would do to its axes; a combination that doesn't
// fit (too many axes, a yes/no among numbers, too many lines) gets a step 3 that
// says why and asks before doing it. Without `charts` (the Log tab) it stays the
// original one-step category picker.
export default function MoveMetricSheet({
  metric,
  currentGroup,
  groups,
  membersByGroup,
  charts,
  currentChart,
  onMove,
  onMoveToChart,
  onClose,
}: {
  metric: string
  currentGroup: string
  groups: ResolvedGroup[]
  membersByGroup?: Record<string, string[]>
  charts?: Record<string, ChartOption[]>
  currentChart?: string
  onMove: (group: string) => void
  onMoveToChart?: (group: string, chart: string) => void
  onClose: () => void
}) {
  const [group, setGroup] = useState<ResolvedGroup | null>(null)
  const [confirm, setConfirm] = useState<{ option: ChartOption; verdict: Verdict } | null>(null)
  const stepped = !!charts && !!onMoveToChart

  function pickChart(option: ChartOption, verdict: Verdict) {
    if (verdict.level === 'warn') setConfirm({ option, verdict })
    else onMoveToChart!(group!.key, option.id)
  }

  // Step 2's list: every chart in the category, plus a fresh chart for this item
  // if none of the existing ones is where it would go on its own.
  function optionsFor(g: ResolvedGroup): ChartOption[] {
    const list = (charts?.[g.key] ?? []).map((c) => ({ ...c, members: c.members.filter((m) => m !== metric) }))
    const own = ownChart(metric)
    // A fixed item's usual place in its home section is its original chart (Stress
    // load, Energy & mood…) — offered even when that chart is empty and gone, so
    // putting it back is one tap.
    const home = FIXED_DEFAULTS[metric]
    const usual = home && home.group === g.key ? home.chart : defaultChartFor(metric)
    const extra: ChartOption[] = []
    const kind = axisKindFor(metric)
    const scale = kind === 'duration' ? ' (min)' : kind === 'rating' ? ' (0-10)' : kind === 'percent' ? ' (%)' : ''
    const usualTitle = FIXED_CHART_TITLES[usual]
      ? `${FIXED_CHART_TITLES[usual]} (its usual chart)`
      : usual === own ? 'A chart of its own' : `New ${g.label} chart${scale}`
    if (!list.some((c) => c.id === usual)) extra.push({ id: usual, title: usualTitle, members: [] })
    if (usual !== own && !list.some((c) => c.id === own)) extra.push({ id: own, title: 'A chart of its own', members: [] })
    return [...list.filter((c) => c.members.length || c.id === currentChart), ...extra]
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-2xl border-t border-ink-700 bg-ink-900 p-4 pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2 text-[17px] text-cream">
            {group && stepped && (
              <button
                type="button"
                className="shrink-0 pr-1 text-ink-400 hover:text-cream"
                aria-label="Back"
                onClick={() => (confirm ? setConfirm(null) : setGroup(null))}
              >
                ‹
              </button>
            )}
            <MetricIcon name={metric === '~gutpain' ? 'stomach pain' : metric} size={18} />
            <span className="truncate">
              Move {chartMemberLabel(metric)}
              {group && stepped ? ` → ${group.label}` : ''}
            </span>
          </span>
          <button className="shrink-0 text-sm text-ink-400 hover:text-cream" onClick={onClose}>
            Cancel
          </button>
        </div>

        {/* Step 3: the combination doesn't fit well — say why, then let him decide. */}
        {confirm && group ? (
          <div className="space-y-3">
            <div className="warn-box !text-sm">
              <div className="mb-1 font-medium">Putting it on “{confirm.option.title}” may not work well</div>
              {confirm.verdict.detail}
            </div>
            {confirm.verdict.note && <p className="text-xs text-ink-400">{confirm.verdict.note}</p>}
            <button className="btn-primary w-full" onClick={() => onMoveToChart!(group.key, confirm.option.id)}>
              Move it there anyway
            </button>
            <button className="btn-ghost w-full" onClick={() => setConfirm(null)}>
              Pick another chart
            </button>
          </div>
        ) : group && stepped ? (
          // Step 2: which chart in that category.
          <div className="space-y-1.5">
            <p className="mb-2 text-xs text-ink-400">Which chart should it go on?</p>
            {optionsFor(group).map((c) => {
              const isCurrent = group.key === currentGroup && c.id === currentChart
              const verdict = combineVerdict(metric, c.members)
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={isCurrent}
                  onClick={() => pickChart(c, verdict)}
                  className={`flex w-full flex-col gap-0.5 rounded-xl border px-3 py-2.5 text-left text-sm ${
                    isCurrent ? 'border-brand-500 text-cream' : 'border-ink-700 text-ink-300 hover:text-cream'
                  }`}
                >
                  <span className="flex w-full items-center gap-2">
                    <span className="min-w-0 flex-1">{c.title}</span>
                    {isCurrent ? (
                      <span className="shrink-0 text-[11px] text-brand-500">current</span>
                    ) : c.members.length ? (
                      <span className={`shrink-0 text-[11px] ${verdict.level === 'warn' ? 'warn-chip' : 'text-ink-500'}`}>
                        {verdict.level === 'warn' ? '⚠ ' : ''}{verdict.text}
                      </span>
                    ) : null}
                  </span>
                  {c.members.length > 0 && (
                    <span className="text-[11px] text-ink-400">with {c.members.map(chartMemberLabel).join(', ')}</span>
                  )}
                  {!isCurrent && verdict.level === 'axis' && c.members.length > 0 && (
                    <span className="text-[11px] text-ink-500">Its scale differs, so it gets its own axis on the right.</span>
                  )}
                  {!isCurrent && verdict.level !== 'warn' && verdict.note && c.members.length > 0 && (
                    <span className="text-[11px] text-ink-500">{verdict.note}</span>
                  )}
                </button>
              )
            })}
          </div>
        ) : (
          // Step 1: which category.
          <div className="space-y-1.5">
            {groups.map((g) => {
              const members = (membersByGroup?.[g.key] ?? []).filter((m) => m !== metric)
              const isCurrent = g.key === currentGroup
              return (
                <button
                  key={g.key}
                  type="button"
                  // From Insights the current category stays tappable: step 2 can move
                  // it to a different chart within the same category.
                  disabled={isCurrent && !stepped}
                  onClick={() => (stepped ? setGroup(g) : onMove(g.key))}
                  className={`flex w-full flex-col gap-0.5 rounded-xl border px-3 py-2.5 text-left text-sm ${
                    isCurrent ? 'border-brand-500 text-cream' : 'border-ink-700 text-ink-300 hover:text-cream'
                  }`}
                >
                  <span className="flex w-full items-center gap-2">
                    <GroupIcon group={iconGroup(g.key)} icon={g.icon} size={16} />
                    {g.label}
                    {isCurrent && <span className="ml-auto text-[11px] text-brand-500">current</span>}
                    {stepped && !isCurrent && <span className="ml-auto text-ink-500">›</span>}
                  </span>
                  {members.length > 0 && (
                    <span className="pl-6 text-[11px] text-ink-400">with {members.map(chartMemberLabel).join(', ')}</span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {!confirm && (
          <p className="mt-3 text-xs text-ink-400">
            This also changes which Insights chart it appears on — including everything you've already
            logged, not just from today.
          </p>
        )}
      </div>
    </div>
  )
}
