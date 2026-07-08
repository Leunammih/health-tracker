// SQLite (via sql.js WASM) held in memory, persisted to IndexedDB, and synced to Nextcloud.
import type { Database, SqlJsStatic } from 'sql.js'
import * as sqlJsNs from 'sql.js'
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url'

// sql.js is a UMD/CJS module; handle both interop shapes across dev (esbuild) and build (rollup).
const initSqlJs = ((sqlJsNs as { default?: unknown }).default ?? sqlJsNs) as (
  config?: { locateFile?: (file: string) => string },
) => Promise<SqlJsStatic>
import { SCHEMA_SQL, SCHEMA_VERSION } from './schema'
import { loadDbBlob, saveDbBlob } from '../lib/storage'

let SQL: SqlJsStatic | null = null
let db: Database | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null

// Callers can subscribe to be notified when a local save happens (used to trigger sync).
type ChangeListener = () => void
const listeners = new Set<ChangeListener>()
export function onDbChange(fn: ChangeListener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

async function getSql(): Promise<SqlJsStatic> {
  if (!SQL) SQL = await initSqlJs({ locateFile: () => sqlWasmUrl })
  return SQL
}

export async function initDb(): Promise<Database> {
  if (db) return db
  const sql = await getSql()
  const cached = await loadDbBlob()
  db = cached ? new sql.Database(cached) : new sql.Database()
  db.run(SCHEMA_SQL)
  db.run('INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)', ['schema_version', String(SCHEMA_VERSION)])
  return db
}

export function getDb(): Database {
  if (!db) throw new Error('DB not initialised — call initDb() first')
  return db
}

const SQLITE_MAGIC = 'SQLite format 3\0'

function isValidSqliteBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 16) return false
  for (let i = 0; i < 16; i++) {
    if (bytes[i] !== SQLITE_MAGIC.charCodeAt(i)) return false
  }
  return true
}

// Replace the in-memory DB with bytes from Nextcloud sync or a manual .db import.
// Builds and validates the replacement before touching the live `db` — a bad
// file (empty, HTML error page, wrong path, unrelated file) must never corrupt
// the working local database, since every query after that would fail.
export async function replaceDb(bytes: Uint8Array): Promise<void> {
  if (!isValidSqliteBytes(bytes)) {
    throw new Error('That file is empty or not a valid SQLite database — ignoring it, your existing data is untouched.')
  }
  const sql = await getSql()
  const next = new sql.Database(bytes)
  try {
    next.run(SCHEMA_SQL)
  } catch (e) {
    next.close()
    throw e
  }
  db?.close()
  db = next
  await saveDbBlob(bytes)
  listeners.forEach((l) => l())
}

export function exportBytes(): Uint8Array {
  return getDb().export()
}

// Persist to IndexedDB immediately + notify listeners (debounced sync happens there).
export async function persist(): Promise<void> {
  const bytes = exportBytes()
  await saveDbBlob(bytes)
  listeners.forEach((l) => l())
}

// Debounced persist for rapid successive writes.
export function schedulePersist(delay = 400): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    void persist()
  }, delay)
}
