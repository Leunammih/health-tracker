// Order and fold state for the Insights page's sections — a chart, or a fixed
// combined block like "Wellbeing & sleep".
//
// Modelled directly on lib/groups.ts: one JSON blob in the `meta` table, so it
// syncs via Dropbox and survives an export/import. Deliberately a SEPARATE store
// from the Log tab's own collapsed-group state (lib/uiPrefs.ts) — folding a chart
// while browsing Insights has no reason to also fold the matching quick-entry
// group on the Log tab, and vice versa; they're different questions asked in
// different places.
//
// Which sections exist is decided by InsightsTab at render time (a chart with
// nothing logged for it doesn't exist yet), so unlike groups.ts's BUILTIN_GROUPS
// there is no fixed "known ids" list here — every function that needs one takes the
// caller's current list of visible ids as a parameter.

import { getMeta, setMeta } from '../db/queries'

const KEY = 'insights_layout'

export interface InsightsLayout {
  order: string[]
  collapsed: string[]
}

function parse(raw: string | null): InsightsLayout {
  if (!raw) return { order: [], collapsed: [] }
  try {
    const p = JSON.parse(raw) as Partial<InsightsLayout>
    return {
      order: Array.isArray(p.order) ? p.order.filter((k) => typeof k === 'string') : [],
      collapsed: Array.isArray(p.collapsed) ? p.collapsed.filter((k) => typeof k === 'string') : [],
    }
  } catch {
    return { order: [], collapsed: [] }
  }
}

export function loadInsightsLayout(): InsightsLayout {
  return parse(getMeta(KEY))
}

async function save(layout: InsightsLayout): Promise<InsightsLayout> {
  const empty = !layout.order.length && !layout.collapsed.length
  await setMeta(KEY, empty ? null : JSON.stringify(layout))
  return layout
}

// Stored order first (for ids that still exist), then anything new appended in its
// natural position — the same "never silently reshuffle, never silently drop"
// contract allGroups() uses. De-duplicated for the same reason it is there: a
// duplicate id is a duplicate React key, not just untidy data.
export function orderIds(knownIds: string[], layout: InsightsLayout): string[] {
  return [...new Set([...layout.order.filter((k) => knownIds.includes(k)), ...knownIds.filter((k) => !layout.order.includes(k))])]
}

export async function setSectionCollapsed(id: string, collapsed: boolean): Promise<InsightsLayout> {
  const layout = loadInsightsLayout()
  const set = new Set(layout.collapsed)
  if (collapsed) set.add(id)
  else set.delete(id)
  return save({ ...layout, collapsed: [...set] })
}

// `knownIds` is THIS render's visible section list — reordering only ever
// rearranges sections that currently exist, never a stale id from a chart that no
// longer has data.
export async function moveSection(id: string, delta: -1 | 1, knownIds: string[]): Promise<InsightsLayout> {
  const layout = loadInsightsLayout()
  const ids = orderIds(knownIds, layout)
  const i = ids.indexOf(id)
  const j = i + delta
  if (i < 0 || j < 0 || j >= ids.length) return layout
  ;[ids[i], ids[j]] = [ids[j], ids[i]]
  return save({ ...layout, order: ids })
}
