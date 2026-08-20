// The categories the Log tab groups metrics under, and which metric sits in which.
//
// These used to be five values hardcoded in metrics.ts, with Insights matching on
// those exact names to decide what to chart. That meant the five could not be
// renamed to match how he actually thinks, an item filed in the wrong one could not
// be moved, and there was no way to add a category at all. This makes the whole
// layer user-defined — deliberately so, since the app is headed for other people
// whose five categories are not his.
//
// Stored as one JSON blob in the `meta` table, exactly like custom_metrics and
// hidden_metrics: it syncs to the phone via Dropbox and survives an export/import.
// ONE key rather than four, because the four parts are always read and written
// together and a half-applied config would be worse than none.
//
// Direction of imports is groups -> metrics, never the reverse: db/queries imports
// metrics, so a metrics -> groups -> queries edge would close a cycle. Like the
// custom metric registry, this one is PUSHED into metrics.ts via a setter.

import { getMeta, setMeta } from '../db/queries'
import { setGroupConfig, BUILTIN_GROUPS, BUILTIN_GROUP_TITLES, type MetricGroup } from './metrics'

const KEY = 'groups_config'

export interface CustomGroup {
  key: string
  label: string
  icon?: string
}

export interface GroupsConfig {
  labels: Record<string, string> // renames, built-in or custom
  custom: CustomGroup[]
  order: string[] // full display order, built-ins included
  assignments: Record<string, string> // metric name -> group key
}

export interface ResolvedGroup {
  key: string
  label: string
  icon?: string
  isCustom: boolean
}

export function canonicalGroupKey(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

// A fresh object every call — NEVER a shared singleton. Every caller of
// groupsConfig() mutates what it gets back directly (cfg.custom.push(...),
// cfg.order = ..., cfg.labels[k] = ...) rather than cloning first, on the
// assumption that groupsConfig() itself already handed them a private copy. A
// single shared "empty" object returned by reference until the first save — the
// original bug here — meant the FIRST-EVER addGroup() call polluted that shared
// object mid-call: its own `cfg.custom.push` was visible to the `allGroups()` call
// three lines later in the same function (same object, read again), which made a
// brand new category appear "already known" and get written into `order` twice.
function parse(raw: string | null): GroupsConfig {
  if (!raw) return { labels: {}, custom: [], order: [], assignments: {} }
  try {
    const p = JSON.parse(raw) as Partial<GroupsConfig>
    return {
      labels: p.labels && typeof p.labels === 'object' ? p.labels : {},
      custom: Array.isArray(p.custom) ? p.custom.filter((c) => c && typeof c.key === 'string' && !!c.key) : [],
      order: Array.isArray(p.order) ? p.order.filter((k) => typeof k === 'string') : [],
      assignments: p.assignments && typeof p.assignments === 'object' ? p.assignments : {},
    }
  } catch {
    return { labels: {}, custom: [], order: [], assignments: {} }
  }
}

export function groupsConfig(): GroupsConfig {
  return parse(getMeta(KEY))
}

// Every group, in display order. Built-ins always survive — they can be renamed and
// reordered but not deleted, because metrics fall back to them (see `other` in
// groupForTrack) and a database with no group to land in has nowhere to put a row.
export function allGroups(): ResolvedGroup[] {
  const cfg = groupsConfig()
  const customKeys = cfg.custom.map((c) => c.key)
  const known = [...BUILTIN_GROUPS, ...customKeys]
  // `order` drives, but anything missing from it (a built-in on an old config, a
  // group added on another device) still has to appear, appended in its natural
  // order rather than silently vanishing.
  // De-duplicated as a second line of defense: a duplicate key here isn't just
  // cosmetic, it's a duplicate React `key` in every list that renders allGroups(),
  // which silently drops one of the two rows rather than erroring.
  const ordered = [...new Set([...cfg.order.filter((k) => known.includes(k)), ...known.filter((k) => !cfg.order.includes(k))])]
  return ordered.map((key) => {
    const custom = cfg.custom.find((c) => c.key === key)
    return {
      key,
      label: cfg.labels[key] ?? custom?.label ?? BUILTIN_GROUP_TITLES[key] ?? key,
      icon: custom?.icon,
      isCustom: !!custom,
    }
  })
}

export function labelForGroup(key: string): string {
  const cfg = groupsConfig()
  return cfg.labels[key] ?? cfg.custom.find((c) => c.key === key)?.label ?? BUILTIN_GROUP_TITLES[key] ?? key
}

async function save(cfg: GroupsConfig): Promise<ResolvedGroup[]> {
  const empty =
    !Object.keys(cfg.labels).length && !cfg.custom.length && !cfg.order.length && !Object.keys(cfg.assignments).length
  await setMeta(KEY, empty ? null : JSON.stringify(cfg))
  return loadGroups()
}

// Read the stored config and hand it to the registry. Called once at boot (after
// initDb, since it reads the database) and again after every change — and after a
// Dropbox pull or a .db import, which replace the whole database underneath us.
export function loadGroups(): ResolvedGroup[] {
  setGroupConfig(groupsConfig().assignments)
  return allGroups()
}

export async function addGroup(label: string, icon?: string): Promise<ResolvedGroup[]> {
  const key = canonicalGroupKey(label)
  const cfg = groupsConfig()
  if (!key || BUILTIN_GROUPS.includes(key) || cfg.custom.some((c) => c.key === key)) return loadGroups()
  cfg.custom.push({ key, label: label.trim(), icon })
  cfg.order = allGroups().map((g) => g.key).concat(key)
  return save(cfg)
}

export async function renameGroup(key: string, label: string): Promise<ResolvedGroup[]> {
  const cfg = groupsConfig()
  const next = label.trim()
  // A rename back to the original name clears the override rather than storing a
  // label identical to the built-in title.
  if (!next || next === BUILTIN_GROUP_TITLES[key]) delete cfg.labels[key]
  else cfg.labels[key] = next
  const custom = cfg.custom.find((c) => c.key === key)
  if (custom && next) custom.label = next
  return save(cfg)
}

export async function setGroupIcon(key: string, icon: string | undefined): Promise<ResolvedGroup[]> {
  const cfg = groupsConfig()
  const custom = cfg.custom.find((c) => c.key === key)
  if (custom) custom.icon = icon
  else if (icon) cfg.labels[`${key}__icon`] = icon // built-ins keep their glyph; see metricIcons
  return save(cfg)
}

export async function moveGroup(key: string, delta: -1 | 1): Promise<ResolvedGroup[]> {
  const cfg = groupsConfig()
  const keys = allGroups().map((g) => g.key)
  const i = keys.indexOf(key)
  const j = i + delta
  if (i < 0 || j < 0 || j >= keys.length) return loadGroups()
  ;[keys[i], keys[j]] = [keys[j], keys[i]]
  cfg.order = keys
  return save(cfg)
}

// Only custom groups can go. Their metrics are reassigned to `other` rather than
// deleted — the same principle as deleting a custom metric keeping its history.
export async function deleteGroup(key: string): Promise<ResolvedGroup[]> {
  const cfg = groupsConfig()
  if (!cfg.custom.some((c) => c.key === key)) return loadGroups()
  cfg.custom = cfg.custom.filter((c) => c.key !== key)
  cfg.order = cfg.order.filter((k) => k !== key)
  delete cfg.labels[key]
  for (const [metric, g] of Object.entries(cfg.assignments)) {
    if (g === key) cfg.assignments[metric] = 'other'
  }
  return save(cfg)
}

export async function assignMetricToGroup(metric: string, group: string): Promise<ResolvedGroup[]> {
  const cfg = groupsConfig()
  cfg.assignments[metric] = group
  return save(cfg)
}

// Which group a metric has been explicitly moved to, if any. Only used by the UI to
// show the current selection; groupForTrack in metrics.ts is the real resolver.
export function assignedGroup(metric: string): MetricGroup | undefined {
  return groupsConfig().assignments[metric]
}
