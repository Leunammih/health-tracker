// Foods can end up duplicated under the same name_key despite findFoodByKey's
// check at every creation path — schema.ts explains why (name_key deliberately
// has no unique index, so a Dropbox merge of two devices that each added "carrot"
// while offline keeps both rows). A duplicate is invisible in the tap-to-build
// grid: two chips that read as the same ingredient ("Carrot", "carrot") carry
// different food ids, so tapping both silently double-counts that ingredient in
// the meal total instead of the existing "already added" merge treating them as
// one. Re-scanning on every mount (not gated by a one-time meta flag, unlike
// foodSeed.ts's backfill) is what actually closes that gap, since a sync merge
// can reintroduce a duplicate at any point after the first launch.
import { allFoods, mergeFoods } from '../db/queries'
import type { Food } from '../types'

// Prefer the row with real numbers over a numberless backfill stub; among two
// with the same numbers-status, prefer the one with more recorded history; fall
// back to whichever was created first, so the survivor is never the newest,
// least-established row.
function pickWinner(group: Food[]): Food {
  return [...group].sort((a, b) => {
    const aHas = a.kcal_100g != null ? 1 : 0
    const bHas = b.kcal_100g != null ? 1 : 0
    if (aHas !== bHas) return bHas - aHas
    if (a.seed_count !== b.seed_count) return b.seed_count - a.seed_count
    return a.created_at < b.created_at ? -1 : 1
  })[0]
}

export async function dedupeFoods(): Promise<number> {
  const groups = new Map<string, Food[]>()
  for (const f of allFoods()) {
    const list = groups.get(f.name_key)
    if (list) list.push(f)
    else groups.set(f.name_key, [f])
  }

  let merged = 0
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const winner = pickWinner(group)
    for (const loser of group) {
      if (loser.id === winner.id) continue
      await mergeFoods(winner.id, loser.id)
      merged++
    }
  }
  return merged
}
