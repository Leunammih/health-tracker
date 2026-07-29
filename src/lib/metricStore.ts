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
} from '../db/queries'
import { canonicalTrackName, categoryForDef, defForName, scaleForTrack, storeForName, type MetricStore } from './metrics'

export interface MetricValue {
  value: number | null
  note: string | null
}

interface StoreOps {
  // Saved state for this metric on this date.
  read: (date: string, key: string) => MetricValue
  // Most recent value at or before this date — the "start at your last value" default.
  readLast: (date: string, key: string) => number | null
  // `note` is tri-state, matching the underlying upserts: omit to keep whatever is
  // stored, null to clear, string to set.
  write: (date: string, key: string, value: number | null, note?: string | null) => Promise<void>
  // Every date since `sinceISO` that already has a non-null value for this metric —
  // used to dot the day-picker strip in QuickLogSheet.
  datesWithValue: (sinceISO: string, key: string) => Set<string>
}

const STORES: Record<MetricStore, StoreOps> = {
  tracks: {
    read: (date, key) => {
      const row = trackRowOn(date, key)
      return { value: row?.value ?? null, note: row?.notes ?? null }
    },
    readLast: (date, key) => lastTrackValueOnOrBefore(date, key),
    write: (date, key, value, note) => {
      const def = defForName(key)
      const scale = scaleForTrack(key, null)
      return upsertTrackValue(date, key, def ? categoryForDef(def) : null, value, value == null ? null : scale.unit, note)
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
      return { value: dc?.stress_load ?? null, note: dc?.stress_notes ?? null }
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
): Promise<void> {
  const key = keyFor(name)
  await STORES[storeForName(key)].write(date, key, value, note)
}

export function datesWithMetric(sinceISO: string, name: string): Set<string> {
  const key = keyFor(name)
  return STORES[storeForName(key)].datesWithValue(sinceISO, key)
}
