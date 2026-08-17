// Barcode -> Food, find-or-create. Order matters: a barcode-index hit costs a
// local read; only a genuine miss reaches the network.
import { findFoodByBarcode, findFoodByKey, insertFood, updateFood } from '../db/queries'
import { lookupBarcode } from './openFoodFacts'
import type { Food } from '../types'

export type BarcodeLookupResult =
  | { status: 'found'; food: Food }
  | { status: 'not-found' }

export async function resolveBarcodeFood(barcode: string): Promise<BarcodeLookupResult> {
  const existing = findFoodByBarcode(barcode)
  if (existing) return { status: 'found', food: existing }

  const product = await lookupBarcode(barcode)
  if (!product) return { status: 'not-found' }

  // Every food-creation path must call findFoodByKey first (see its comment in
  // db/queries.ts — name_key has no unique index on purpose). A name collision
  // here means someone already typed/AI-described this same product by name
  // before it had a barcode: fill in the real label numbers + barcode on that
  // row rather than inserting a duplicate.
  const byName = findFoodByKey(product.name)
  if (byName) {
    await updateFood(byName.id, {
      kcal_100g: product.kcal_100g,
      protein_100g: product.protein_100g,
      fat_100g: product.fat_100g,
      carbs_100g: product.carbs_100g,
      fiber_100g: product.fiber_100g,
      serving_g: product.serving_g,
      serving_label: product.serving_label,
      food_groups: JSON.stringify(product.food_groups),
      brand: byName.brand ?? product.brand,
      barcode,
      source: 'off',
    })
    return { status: 'found', food: { ...byName, barcode, brand: byName.brand ?? product.brand, source: 'off' } }
  }

  const food = await insertFood({
    name: product.name,
    kcal_100g: product.kcal_100g,
    protein_100g: product.protein_100g,
    fat_100g: product.fat_100g,
    carbs_100g: product.carbs_100g,
    fiber_100g: product.fiber_100g,
    serving_g: product.serving_g,
    serving_label: product.serving_label,
    food_groups: JSON.stringify(product.food_groups),
    brand: product.brand,
    barcode,
    source: 'off',
    seed_count: 0,
    seed_slots: null,
    seed_last_used: null,
    archived: 0,
  })
  return { status: 'found', food }
}
