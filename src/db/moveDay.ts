// Move a day's logs to another date — for the "logged a whole evening onto the
// wrong day" case. Two steps, so the sheet can ask before anything is written:
//
//   planMove(from, to)  → what's on `from`, and where it clashes with `to`
//   applyMove(...)      → do it, with the answer he gave for every clash
//
// Clashes come in two shapes, because the tables do:
//   - one value per day (energy, a tracked item, stress, sleep, a day note):
//     Replace / Keep existing / Merge. Merge only where it means something —
//     minutes add up, text joins. Two energy ratings can't be "merged" honestly.
//     Keep existing leaves the moved value where it was, so nothing is deleted
//     except by an explicit Replace.
//   - things that can repeat (meals, activities, diary entries…): Keep both /
//     Replace existing / Keep existing (= don't move these).
//
// Supplement regimens (start/end dates) are not day logs and never move; the
// day's skips do.

import { getDb, exportBytes, persist } from './sqlite'
import { all } from './queries'
import { uid } from '../lib/id'
import { formatValue, labelForTrack, rollupFor, scaleForTrack } from '../lib/metrics'

export type Choice = 'replace' | 'keep' | 'merge'

export interface MoveItem {
  key: string
  label: string
  // Set when `to` already has something in this item's slot (single-value items)
  // or of this item's kind (repeatable items — the clash is then the group's).
  clashKey: string | null
}

export interface Clash {
  key: string
  label: string        // what it is, e.g. "Energy" or "Meals"
  existing: string     // what's already on the target day
  options: Choice[]
  mergeHint?: string   // what Merge does here
  repeatable: boolean  // meals/activities/…: Merge = keep both
}

export interface MoveGroup {
  title: string
  items: MoveItem[]
}

export interface MovePlan {
  groups: MoveGroup[]
  clashes: Record<string, Clash>
}

// ---- Shapes of the movable data ----

// Tables where several rows per day is normal. Each row moves on its own.
const REPEATABLE = [
  { table: 'entries', col: 'entry_date', title: 'Diary entries', noun: 'diary entries' },
  { table: 'activities', col: 'date', title: 'Activities', noun: 'activities' },
  { table: 'gut_events', col: 'date', title: 'Gut & illness', noun: 'gut episodes' },
  { table: 'infections', col: 'date', title: 'Gut & illness', noun: 'infections' },
  { table: 'events', col: 'date', title: 'Events', noun: 'events' },
  { table: 'meals', col: 'date', title: 'Meals', noun: 'meals' },
] as const
type RepeatableTable = (typeof REPEATABLE)[number]['table']

// One-per-day fields on wellbeing / day_context, grouped the way he logs them:
// a rating travels with its note (and its morning/afternoon/evening segments),
// sleep is three columns that only make sense together.
interface FieldSlot {
  key: string
  table: 'wellbeing' | 'day_context'
  cols: string[]          // first is the "is there anything here" column, except sleep
  segment?: string        // segment_values.metric that rolls up into this field
  text?: boolean          // free text: Merge joins
  label: string
}
const FIELD_SLOTS: FieldSlot[] = [
  { key: 'wb:energy', table: 'wellbeing', cols: ['energy', 'energy_notes'], segment: 'energy', label: 'Energy' },
  { key: 'wb:mood', table: 'wellbeing', cols: ['mood', 'mood_notes'], segment: 'mood', label: 'Mood' },
  { key: 'wb:sleep', table: 'wellbeing', cols: ['sleep_start', 'sleep_end', 'sleep_quality'], label: 'Sleep' },
  { key: 'wb:notes', table: 'wellbeing', cols: ['notes'], text: true, label: 'Wellbeing note' },
  { key: 'dc:stress', table: 'day_context', cols: ['stress_load', 'stress_notes'], segment: 'stress', label: 'Stress' },
  { key: 'dc:tasks', table: 'day_context', cols: ['tasks'], text: true, label: 'Tasks' },
  { key: 'dc:travel', table: 'day_context', cols: ['travel'], text: true, label: 'Travel' },
  { key: 'dc:work', table: 'day_context', cols: ['work'], text: true, label: 'Work' },
  { key: 'dc:retreat', table: 'day_context', cols: ['retreat'], text: true, label: 'Retreat' },
  { key: 'dc:relaxation', table: 'day_context', cols: ['relaxation'], text: true, label: 'Relaxation' },
  { key: 'dc:notes', table: 'day_context', cols: ['notes'], text: true, label: 'Day note' },
]
const DATA_COLS: Record<FieldSlot['table'], string[]> = {
  wellbeing: FIELD_SLOTS.filter((f) => f.table === 'wellbeing').flatMap((f) => f.cols),
  day_context: FIELD_SLOTS.filter((f) => f.table === 'day_context').flatMap((f) => f.cols),
}

type Row = Record<string, unknown>

function firstRow(table: string, date: string): Row | null {
  return all<Row>(`SELECT * FROM ${table} WHERE date = ? LIMIT 1`, [date])[0] ?? null
}

function slotHas(slot: FieldSlot, row: Row | null): boolean {
  if (!row) return false
  // Sleep counts as present if any of its three parts is; a rating only if the
  // rating itself is (a bare note without a value isn't a logged energy).
  const cols = slot.key === 'wb:sleep' ? slot.cols : [slot.cols[0]]
  return cols.some((c) => row[c] != null && row[c] !== '')
}

function clip(s: string, n = 48): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}

function describeSlot(slot: FieldSlot, row: Row): string {
  if (slot.key === 'wb:sleep') {
    const span = row.sleep_start && row.sleep_end ? `${row.sleep_start}–${row.sleep_end}` : (row.sleep_start ?? row.sleep_end ?? '')
    const q = row.sleep_quality != null ? ` · quality ${row.sleep_quality}` : ''
    return `Sleep ${span}${q}`.trim()
  }
  const v = row[slot.cols[0]]
  return slot.text ? `${slot.label}: ${clip(String(v))}` : `${slot.label} ${v}`
}

function describeRow(table: RepeatableTable, r: Row): string {
  switch (table) {
    case 'entries':
      return `“${clip(String(r.raw_text ?? ''), 60)}”`
    case 'activities':
      return [r.type || 'Activity', r.duration_min != null ? `${r.duration_min} min` : null].filter(Boolean).join(' · ')
    case 'gut_events':
      return ['Gut episode', r.pain != null ? `pain ${r.pain}` : null, r.stool_consistency != null ? `Bristol ${r.stool_consistency}` : null]
        .filter(Boolean).join(' · ')
    case 'infections':
      return [r.kind || 'Infection', r.severity].filter(Boolean).join(' · ')
    case 'events':
      return String(r.label ?? 'Event')
    case 'meals':
      return [r.time, r.name || 'Meal', r.calories != null ? `${r.calories} kcal` : null].filter(Boolean).join(' · ')
  }
}

interface TrackRow { id: string; name: string; category: string | null; value: number | null; notes: string | null; intensity: number | null }

// One per name: a (date, name) pair is meant to be unique, and older data that
// isn't would otherwise list the same item twice. moveTrack moves every row.
function tracksOn(date: string): TrackRow[] {
  const rows = all<TrackRow>('SELECT id, name, category, value, notes, intensity FROM tracks WHERE date = ? ORDER BY name', [date])
  return [...new Map(rows.map((r) => [r.name, r])).values()]
}

function segmentLabels(date: string, metric: string): string[] {
  return all<{ segment: string }>('SELECT segment FROM segment_values WHERE date = ? AND metric = ?', [date, metric]).map((r) => r.segment)
}

function describeTrack(t: TrackRow, date: string): string {
  const scale = scaleForTrack(t.name, t.category)
  const unit = scale.display?.unit ?? scale.unit
  const value = t.value == null ? '' : ` ${formatValue(t.value, scale)}${unit === '/10' || unit === '%' ? unit : unit ? ` ${unit}` : ''}`
  const segs = segmentLabels(date, t.name)
  return `${labelForTrack(t.name)}${value}${segs.length ? ` (${segs.join(', ')})` : ''}`
}

// ---- Plan ----

export function planMove(from: string, to: string): MovePlan {
  const groups = new Map<string, MoveItem[]>()
  const clashes: Record<string, Clash> = {}
  const push = (title: string, item: MoveItem) => {
    const list = groups.get(title)
    if (list) list.push(item)
    else groups.set(title, [item])
  }

  // Order follows the Log screen: diary first, then what the sliders write, then meals.
  for (const spec of REPEATABLE.filter((s) => s.table === 'entries')) addRepeatable(spec)

  // Tracked items (movement, practice, pain, custom metrics…)
  const targetTracks = new Map(tracksOn(to).map((t) => [t.name, t]))
  for (const t of tracksOn(from)) {
    const clashKey = targetTracks.has(t.name) ? `track:${t.name}` : null
    if (clashKey) {
      const sum = rollupFor(t.name, t.category) === 'sum'
      clashes[clashKey] = {
        key: clashKey,
        label: labelForTrack(t.name),
        existing: describeTrack(targetTracks.get(t.name)!, to),
        options: sum ? ['replace', 'keep', 'merge'] : ['replace', 'keep'],
        mergeHint: sum ? 'adds the two together' : undefined,
        repeatable: false,
      }
    }
    push('Tracked items', { key: `track:${t.name}`, label: describeTrack(t, from), clashKey })
  }

  // Energy / mood / sleep / stress / day notes
  const rows = { wellbeing: [firstRow('wellbeing', from), firstRow('wellbeing', to)], day_context: [firstRow('day_context', from), firstRow('day_context', to)] }
  for (const slot of FIELD_SLOTS) {
    const [src, dst] = rows[slot.table]
    if (!slotHas(slot, src)) continue
    const clashKey = slotHas(slot, dst) ? slot.key : null
    if (clashKey) {
      clashes[clashKey] = {
        key: clashKey,
        label: slot.label,
        existing: describeSlot(slot, dst!),
        options: slot.text ? ['replace', 'keep', 'merge'] : ['replace', 'keep'],
        mergeHint: slot.text ? 'keeps both texts' : undefined,
        repeatable: false,
      }
    }
    const segs = slot.segment ? segmentLabels(from, slot.segment) : []
    push(slot.table === 'wellbeing' ? 'Energy, mood & sleep' : 'Stress & day context', {
      key: slot.key,
      label: describeSlot(slot, src!) + (segs.length ? ` (${segs.join(', ')})` : ''),
      clashKey,
    })
  }

  for (const spec of REPEATABLE.filter((s) => s.table !== 'entries')) addRepeatable(spec)

  // Supplement skips. A skip already on the target day for the same supplement
  // is the same fact twice — no question to ask, the duplicate just goes.
  const skips = all<{ id: string; name: string | null }>(
    `SELECT k.id, s.name FROM supplement_skips k LEFT JOIN supplements s ON s.id = k.supplement_id WHERE k.date = ?`,
    [from],
  )
  for (const k of skips) push('Supplements', { key: `skip:${k.id}`, label: `Skipped ${k.name ?? 'a supplement'}`, clashKey: null })

  return { groups: [...groups.entries()].map(([title, items]) => ({ title, items })), clashes }

  function addRepeatable(spec: (typeof REPEATABLE)[number]) {
    const src = all<Row>(`SELECT * FROM ${spec.table} WHERE ${spec.col} = ? ORDER BY rowid`, [from])
    if (!src.length) return
    const dst = all<Row>(`SELECT * FROM ${spec.table} WHERE ${spec.col} = ? ORDER BY rowid`, [to])
    const clashKey = dst.length ? `kind:${spec.table}` : null
    if (clashKey) {
      clashes[clashKey] = {
        key: clashKey,
        label: spec.noun[0].toUpperCase() + spec.noun.slice(1),
        existing: dst.map((r) => describeRow(spec.table, r)).join('; '),
        options: ['merge', 'replace', 'keep'],
        mergeHint: 'keeps both',
        repeatable: true,
      }
    }
    for (const r of src) push(spec.title, { key: `row:${spec.table}:${r.id}`, label: describeRow(spec.table, r), clashKey })
  }
}

// ---- Apply ----

function exec(sql: string, params: unknown[] = []): void {
  getDb().run(sql, params as never)
}

function joinText(a: unknown, b: unknown): string | null {
  const parts = [a, b].map((x) => (x == null ? '' : String(x).trim())).filter(Boolean)
  return parts.length ? parts.join('; ') : null
}

// Returns a snapshot of the whole database from just before the move, for Undo.
export async function applyMove(
  from: string,
  to: string,
  selected: Set<string>,
  choices: Record<string, Choice>,
): Promise<{ snapshot: Uint8Array; moved: number }> {
  if (from === to) throw new Error('Pick a different day to move to.')
  const plan = planMove(from, to)
  const items = plan.groups.flatMap((g) => g.items).filter((i) => selected.has(i.key))
  for (const i of items) {
    if (i.clashKey && !choices[i.clashKey]) throw new Error(`Choose what to do with ${plan.clashes[i.clashKey].label} first.`)
  }

  const snapshot = exportBytes()
  let moved = 0
  const db = getDb()
  db.run('BEGIN')
  try {
    // Repeatable rows: one "replace" per kind clears the target's rows of that
    // kind first; "keep" means these don't move at all.
    const replacedKinds = new Set<string>()
    for (const i of items) {
      if (!i.key.startsWith('row:')) continue
      const [, table, id] = i.key.split(':') as [string, RepeatableTable, string]
      const spec = REPEATABLE.find((s) => s.table === table)!
      const choice = i.clashKey ? choices[i.clashKey] : 'merge'
      if (choice === 'keep') continue
      if (choice === 'replace' && !replacedKinds.has(table)) {
        if (table === 'meals') exec(`DELETE FROM meal_items WHERE meal_id IN (SELECT id FROM meals WHERE date = ?)`, [to])
        exec(`DELETE FROM ${table} WHERE ${spec.col} = ?`, [to])
        replacedKinds.add(table)
      }
      exec(`UPDATE ${table} SET ${spec.col} = ? WHERE id = ?`, [to, id])
      moved++
    }

    for (const i of items) {
      if (i.key.startsWith('track:')) moved += moveTrack(i.key.slice(6), from, to, i.clashKey ? choices[i.clashKey] : null)
    }

    for (const slot of FIELD_SLOTS) {
      const i = items.find((x) => x.key === slot.key)
      if (i) moved += moveSlot(slot, from, to, i.clashKey ? choices[i.clashKey] : null)
    }
    for (const table of ['wellbeing', 'day_context'] as const) {
      exec(`DELETE FROM ${table} WHERE date = ? AND ${DATA_COLS[table].map((c) => `(${c} IS NULL OR ${c} = '')`).join(' AND ')}`, [from])
    }

    for (const i of items) {
      if (!i.key.startsWith('skip:')) continue
      const id = i.key.slice(5)
      exec(
        `DELETE FROM supplement_skips WHERE id = ? AND EXISTS (
           SELECT 1 FROM supplement_skips t WHERE t.date = ? AND t.supplement_id = supplement_skips.supplement_id)`,
        [id, to],
      )
      exec('UPDATE supplement_skips SET date = ? WHERE id = ?', [to, id])
      moved++
    }
    db.run('COMMIT')
  } catch (e) {
    db.run('ROLLBACK')
    throw e
  }
  await persist()
  return { snapshot, moved }
}

function moveTrack(name: string, from: string, to: string, choice: Choice | null): number {
  if (choice === 'keep') return 0
  if (choice === 'merge') {
    const src = all<TrackRow>('SELECT id, name, category, value, notes, intensity FROM tracks WHERE date = ? AND name = ? LIMIT 1', [from, name])[0]
    const dst = all<TrackRow>('SELECT id, name, category, value, notes, intensity FROM tracks WHERE date = ? AND name = ? LIMIT 1', [to, name])[0]
    const srcSegs = segmentLabels(from, name)
    const dstSegs = segmentLabels(to, name)
    if (srcSegs.length && dstSegs.length) {
      // Both split by part of day: add slot by slot, so the day total is still
      // exactly the sum of its segments.
      for (const seg of srcSegs) {
        const s = all<{ id: string; value: number | null; notes: string | null }>(
          'SELECT id, value, notes FROM segment_values WHERE date = ? AND metric = ? AND segment = ?', [from, name, seg])[0]
        const d = all<{ id: string; value: number | null; notes: string | null }>(
          'SELECT id, value, notes FROM segment_values WHERE date = ? AND metric = ? AND segment = ?', [to, name, seg])[0]
        if (d) {
          exec('UPDATE segment_values SET value = ?, notes = ? WHERE id = ?', [(d.value ?? 0) + (s.value ?? 0), joinText(d.notes, s.notes), d.id])
          exec('DELETE FROM segment_values WHERE id = ?', [s.id])
        } else {
          exec('UPDATE segment_values SET date = ? WHERE id = ?', [to, s.id])
        }
      }
    } else {
      // One side only has a whole-day value: segments can no longer add up to
      // the total, so the merged day becomes a single whole-day value.
      exec('DELETE FROM segment_values WHERE metric = ? AND date IN (?, ?)', [name, from, to])
    }
    exec('UPDATE tracks SET value = ?, notes = ?, intensity = ? WHERE id = ?', [
      (dst.value ?? 0) + (src.value ?? 0), joinText(dst.notes, src.notes), dst.intensity ?? src.intensity, dst.id,
    ])
    exec('DELETE FROM tracks WHERE date = ? AND name = ?', [from, name])
    return 1
  }
  if (choice === 'replace') {
    exec('DELETE FROM tracks WHERE date = ? AND name = ?', [to, name])
    exec('DELETE FROM segment_values WHERE date = ? AND metric = ?', [to, name])
  }
  exec('UPDATE tracks SET date = ? WHERE date = ? AND name = ?', [to, from, name])
  exec('UPDATE segment_values SET date = ? WHERE date = ? AND metric = ?', [to, from, name])
  return 1
}

function moveSlot(slot: FieldSlot, from: string, to: string, choice: Choice | null): number {
  if (choice === 'keep') return 0
  const src = firstRow(slot.table, from)
  if (!src) return 0
  const dst = firstRow(slot.table, to)
  const values = slot.cols.map((c) => (choice === 'merge' && slot.text ? joinText(dst?.[c], src[c]) : src[c] ?? null))
  if (dst) {
    exec(`UPDATE ${slot.table} SET ${slot.cols.map((c) => `${c} = ?`).join(', ')} WHERE date = ?`, [...values, to])
  } else {
    exec(`INSERT INTO ${slot.table}(id, entry_id, date, ${slot.cols.join(', ')}) VALUES (?, ?, ?, ${slot.cols.map(() => '?').join(', ')})`, [
      uid(), src.entry_id ?? null, to, ...values,
    ])
  }
  exec(`UPDATE ${slot.table} SET ${slot.cols.map((c) => `${c} = NULL`).join(', ')} WHERE date = ?`, [from])
  if (slot.segment) {
    // The moved value is the rollup of these segments; the target's own
    // segments described the value that was just replaced.
    exec('DELETE FROM segment_values WHERE date = ? AND metric = ?', [to, slot.segment])
    exec('UPDATE segment_values SET date = ? WHERE date = ? AND metric = ?', [to, from, slot.segment])
  }
  return 1
}
