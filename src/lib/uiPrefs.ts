// Small bits of Log-screen UI state that have to follow him to the phone.
//
// Stored in the DB's `meta` table rather than localStorage, for the same reason
// hidden_metrics is (see lib/hiddenMetrics.ts): it syncs via Dropbox and survives
// an export/import, so collapsing "Movement" on the laptop doesn't leave it
// expanded on the phone.

import { getMeta, setMeta } from '../db/queries'

const COLLAPSED_KEY = 'collapsed_groups'

export function loadCollapsedGroups(): Set<string> {
  const raw = getMeta(COLLAPSED_KEY)
  if (!raw) return new Set()
  try {
    const parsed: unknown = JSON.parse(raw)
    return new Set(Array.isArray(parsed) ? parsed.map(String) : [])
  } catch {
    return new Set()
  }
}

export async function setGroupCollapsed(group: string, collapsed: boolean): Promise<Set<string>> {
  const next = loadCollapsedGroups()
  if (collapsed) next.add(group)
  else next.delete(group)
  await setMeta(COLLAPSED_KEY, next.size ? JSON.stringify([...next]) : null)
  return next
}
