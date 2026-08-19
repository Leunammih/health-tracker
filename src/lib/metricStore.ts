// One read/write interface over the three tables a metric can live in.
//
// Most metrics are rows in `tracks`, but energy and mood are columns on
// `wellbeing` and stress is a column on `day_context` — each with its own upsert
// so a single-column edit doesn't disturb its siblings. Both the Log tab's
// QuickEntryPanel and the Insights tap-to-log sheet need to handle all three, and
// they used to branch on `def.store` separately in five places between them. This
// module is the single dispatch point instead: adding a fourth store is one entry
// here rather than an edit in every consumer.

import {
  trackRowOn, lastTrackValueOnOrBefore, upsertTrackValue, tracksSince,
  wellbeingOn, lastWellbeingOnOrBefore, upsertWellbeingField, wellbeingSince, type WellbeingField,
  dayContextOn, lastDayContextOnOrBefore, upsertDayContextField, dayContextSince, type DayContextField,
  segmentsOn, upsertSegmentValue,
} from '../db/queries'
import { canonicalTrackName, categoryForDef, defForName, rollupFor, scaleForTrack, storeForName, type MetricStore, type Rollup } from './metrics'
import type { Segment, SegmentValue } from '../types'

export interface MetricValue {
  value: number | null
  note: string | null
  // Duration metrics only, and therefore `tracks` only — energy and mood are 0-10
  // ratings and stress lives on day_context, so those two stores report null and
  // ignore what they are given. Kept on the shared shape rather than special-cased
  // in the callers, which is the whole reason this dispatch table exists.
  intensity: number | null
}

interface StoreOps {
  // Saved state for this metric on this date.
  read: (date: string, key: string) => MetricValue
  // Most recent value at or before this date — the "start at your last value" default.
  readLast: (date: string, key: string) => number | null
  // `note` and `intensity` are tri-state, matching the underlying upserts: omit to
  // keep whatever is stored, null to clear, a value to set.
  write: (
    date: string,
    key: string,
    value: number | null,
    note?: string | null,
    intensity?: number | null,
  ) => Promise<void>
  // Every date since `sinceISO` that already has a non-null value for this metric —
  // used to dot the day-picker strip in QuickLogSheet.
  datesWithValue: (sinceISO: string, key: string) => Set<string>
}

const STORES: Record<MetricStore, StoreOps> = {
  tracks: {
    read: (date, key) => {
      const row = trackRowOn(date, key)
      return { value: row?.value ?? null, note: row?.notes ?? null, intensity: row?.intensity ?? null }
    },
    readLast: (date, key) => lastTrackValueOnOrBefore(date, key),
    write: (date, key, value, note, intensity) => {
      const def = defForName(key)
      const scale = scaleForTrack(key, null)
      return upsertTrackValue(date, key, def ? categoryForDef(def) : null, value, value == null ? null : scale.unit, note, intensity)
    },
    datesWithValue: (since, key) =>
      new Set(tracksSince(since).filter((t) => t.name === key && t.value != null).map((t) => t.date)),
  },

  wellbeing: {
    read: (date, key) => {
      const wb = wellbeingOn(date)
      const isEnergy = key === 'energy'
      return {
        value: (isEnergy ? wb?.energy : wb?.mood) ?? null,
        note: (isEnergy ? wb?.energy_notes : wb?.mood_notes) ?? null,
        intensity: null, // a 0-10 rating has no separate intensity
      }
    },
    readLast: (date, key) => lastWellbeingOnOrBefore(date, key as WellbeingField),
    write: (date, key, value, note) => upsertWellbeingField(date, key as WellbeingField, value, note),
    datesWithValue: (since, key) => {
      const isEnergy = key === 'energy'
      return new Set(
        wellbeingSince(since)
          .filter((w) => (isEnergy ? w.energy : w.mood) != null)
          .map((w) => w.date),
      )
    },
  },

  day_context: {
    read: (date) => {
      const dc = dayContextOn(date)
      return { value: dc?.stress_load ?? null, note: dc?.stress_notes ?? null, intensity: null }
    },
    readLast: (date, key) => lastDayContextOnOrBefore(date, key as DayContextField),
    write: (date, key, value, note) => upsertDayContextField(date, key as DayContextField, value, note),
    datesWithValue: (since) =>
      new Set(dayContextSince(since).filter((d) => d.stress_load != null).map((d) => d.date)),
  },
}

// Writes canonicalise names (`breathwork` → `breath work`) but the single-row
// readers historically did not, so a read with an alias missed the row its own
// write had just created. Every entry point here goes through the same
// normalisation so that can't happen.
function keyFor(name: string): string {
  return canonicalTrackName(name)
}

export function readMetric(date: string, name: string): MetricValue {
  const key = keyFor(name)
  return STORES[storeForName(key)].read(date, key)
}

export function lastMetricValue(date: string, name: string): number | null {
  const key = keyFor(name)
  return STORES[storeForName(key)].readLast(date, key)
}

export async function writeMetric(
  date: string,
  name: string,
  value: number | null,
  note?: string | null,
  intensity?: number | null,
): Promise<void> {
  const key = keyFor(name)
  await STORES[storeForName(key)].write(date, key, value, note, intensity)
}

export function datesWithMetric(sinceISO: string, name: string): Set<string> {
  const key = keyFor(name)
  return STORES[storeForName(key)].datesWithValue(sinceISO, key)
}

// ---- Time-of-day segments (morning/afternoon/evening) ----
// Segments are additive rows on top of whatever store a metric normally lives in
// (see segment_values in db/schema.ts) — writing one recomputes and writes the
// day's rollup through the same store above, so readMetric/writeMetric above never
// need to know segments exist. These three are for the segment-entry UI itself.

// How this metric's segments combine into a rollup — 'sum' (minutes), 'avg' (0-10 /
// percent), or 'last' (a point-in-time reading like weight or Bristol stool, which
// doesn't make sense to split by time of day). The Log tab's segment picker hides
// itself for 'last' metrics.
export function rollupKindFor(name: string): Rollup {
  return rollupFor(keyFor(name))
}

export function readSegments(date: string, name: string): SegmentValue[] {
  return segmentsOn(date, keyFor(name))
}

export async function writeSegment(
  date: string,
  segment: Segment,
  name: string,
  value: number | null,
  note?: string | null,
  intensity?: number | null,
): Promise<void> {
  await upsertSegmentValue(date, segment, keyFor(name), value, note, intensity)
}
