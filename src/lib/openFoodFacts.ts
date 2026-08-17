// Open Food Facts lookup for the barcode scanner — free, no API key, CORS-enabled.
// This is the app's first third-party network call besides Anthropic and Dropbox;
// it sends only the scanned barcode number, never health data (see README).
//
// Note: OFF's own API guidelines ask clients to send a descriptive User-Agent
// header. Browsers silently ignore any attempt to set User-Agent from fetch() —
// it's a forbidden header — so that's simply not possible from here.
import type { FoodGroupBreakdown } from './foodGroups'
import { classifyIngredient } from './foodGroups'

export interface OffProduct {
  name: string
  brand: string | null
  kcal_100g: number
  protein_100g: number
  fat_100g: number
  carbs_100g: number
  fiber_100g: number
  serving_g: number
  serving_label: string
  food_groups: FoodGroupBreakdown
}

// Same shape of trust problem normaliseFoodProfile() (ai/anthropic.ts) solves for
// Claude's numbers: OFF is community-submitted data and occasionally has garbage
// (typo'd decimal points, wrong units). Clamped to the same ranges used there.
function clamp(value: unknown, lo: number, hi: number): number {
  const n = Number(value)
  const safe = Number.isFinite(n) ? n : lo
  return Math.min(hi, Math.max(lo, safe))
}

// "30 g", "1 bar (40g)", "250ml" -> the leading number, or null if nothing parses.
function parseServingGrams(servingSize: string | undefined): number | null {
  if (!servingSize) return null
  const m = servingSize.match(/([\d.]+)\s*g\b/i)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

interface OffApiResponse {
  status: number
  product?: {
    product_name?: string
    brands?: string
    serving_size?: string
    nutriments?: Record<string, unknown>
  }
}

// Returns null for "not found" (OFF status: 0, or HTTP 404) — a normal, expected
// outcome for anything unpackaged or not yet in OFF's database, not an error.
// Throws only for a genuine request failure the caller should surface.
export async function lookupBarcode(barcode: string): Promise<OffProduct | null> {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,brands,nutriments,serving_size`
  const res = await fetch(url)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Open Food Facts lookup failed: ${res.status}`)
  const data = (await res.json()) as OffApiResponse
  if (data.status !== 1 || !data.product) return null

  const p = data.product
  const n = p.nutriments ?? {}
  const kcal_100g = n['energy-kcal_100g']
  // A product with no calorie figure at all isn't usable — OFF has plenty of
  // barely-populated entries (photo-only submissions). Treat as not-found so the
  // caller falls back to the vision path instead of inserting a zero-calorie food.
  if (kcal_100g == null) return null

  const servingG = parseServingGrams(p.serving_size) ?? 100
  const name = p.product_name?.trim() || 'Scanned product'
  const brand = p.brands?.split(',')[0]?.trim() || null

  return {
    name,
    brand,
    kcal_100g: clamp(kcal_100g, 0, 900),
    protein_100g: clamp(n['proteins_100g'], 0, 100),
    fat_100g: clamp(n['fat_100g'], 0, 100),
    carbs_100g: clamp(n['carbohydrates_100g'], 0, 100),
    fiber_100g: clamp(n['fiber_100g'], 0, 100),
    serving_g: clamp(servingG, 1, 2000),
    serving_label: p.serving_size?.trim() || `${Math.round(servingG)} g`,
    food_groups: { ...emptyBreakdown(), [classifyIngredient(name)]: 1 },
  }
}

function emptyBreakdown(): FoodGroupBreakdown {
  return { vegan: 0, dairy_eggs: 0, meat_beef: 0, meat_chicken: 0, meat_fish: 0, meat_other: 0 }
}
