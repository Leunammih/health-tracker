// What the metric sliders should NOT offer.
//
// The Log tab's quick-entry list is built from whatever names turn up in `tracks`,
// and dictation puts things there that aren't metrics at all — above all supplements,
// which have their own card with a dose, a start/stop date and a check-in rhythm.
// "Digestive enzymes" as a 0-10 slider is not a question with an answer.
//
// Two mechanisms: supplements are excluded automatically, and anything else can be
// hidden by hand. The hand-hidden list lives in the DB's `meta` table (like goals in
// lib/goals.ts, not localStorage) so it syncs to the phone via Dropbox and survives
// an export/import — hiding a stray row on the laptop must not leave it on the phone.
//
// SCOPE, decided 2026-08-12: hiding suppresses ENTRY only — the quick-entry sliders,
// the Insights tap-to-log chips, and a supplement's own stray chart. A hidden
// metric's history keeps its normal chart. Hiding means "stop asking me for this
// number", not "delete this from my trends", and the charts are the point of the
// app. Do not extend this predicate to the movement/practice/pain chart series.

import { allSupplementNames, getMeta, setMeta } from '../db/queries'
import { canonicalTrackName } from './metrics'

const KEY = 'hidden_metrics'

// Words that only ever name a supplement or medication. Deliberately short and
// specific: this suppresses a row, so a false positive silently loses a metric.
const SUPPLEMENT_WORD =
  /\b(enzymes?|probiotics?|prebiotics?|vitamins?|magnesium|zinc|omega[- ]?3|creatine|collagen|melatonin|ashwagandha|curcumin|turmeric|supplements?|capsules?|tablets?|electrolytes?|multivitamin)\b/i

function norm(name: string): string {
  return canonicalTrackName(name)
}

export function loadHiddenMetrics(): Set<string> {
  const raw = getMeta(KEY)
  if (!raw) return new Set()
  try {
    const parsed: unknown = JSON.parse(raw)
    return new Set(Array.isArray(parsed) ? parsed.map((n) => norm(String(n))) : [])
  } catch {
    return new Set()
  }
}

export async function hideMetric(name: string): Promise<void> {
  const next = loadHiddenMetrics()
  next.add(norm(name))
  await setMeta(KEY, JSON.stringify([...next]))
}

export async function unhideMetric(name: string): Promise<void> {
  const next = loadHiddenMetrics()
  next.delete(norm(name))
  await setMeta(KEY, next.size ? JSON.stringify([...next]) : null)
}

// Names of things tracked in the Supplements card, canonicalised for comparison
// against track names.
export function supplementMetricNames(): Set<string> {
  return new Set(allSupplementNames().map(norm))
}

export function isSupplementMetric(name: string, supplements: Set<string>): boolean {
  return supplements.has(norm(name)) || SUPPLEMENT_WORD.test(name)
}

// The one predicate the metric lists use: true = don't offer a slider for this.
export function isSuppressedMetric(
  name: string,
  hidden: Set<string>,
  supplements: Set<string>,
): boolean {
  return hidden.has(norm(name)) || isSupplementMetric(name, supplements)
}
