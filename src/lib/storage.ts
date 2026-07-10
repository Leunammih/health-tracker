// On-device persistence:
//  - Settings (API key, Dropbox config, model) in localStorage.
//  - The SQLite database blob cached in IndexedDB for fast offline load.

export interface Settings {
  anthropicKey: string
  model: string
  dropboxAppKey: string // the Dropbox app's public "App key" (safe on-device; PKCE client)
  dropboxRefreshToken: string // obtained via OAuth PKCE; used to mint short-lived access tokens
  syncEnabled: boolean
}

const SETTINGS_KEY = 'ht.settings.v1'

export const DEFAULT_SETTINGS: Settings = {
  anthropicKey: '',
  model: 'claude-sonnet-5',
  dropboxAppKey: '',
  dropboxRefreshToken: '',
  syncEnabled: false,
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
}

// ---- IndexedDB blob store for the SQLite file ----

const DB_NAME = 'ht-store'
const STORE = 'blobs'
const DB_KEY = 'health.db'

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveDbBlob(bytes: Uint8Array): Promise<void> {
  const db = await openIdb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(bytes, DB_KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

export async function loadDbBlob(): Promise<Uint8Array | null> {
  const db = await openIdb()
  const result = await new Promise<Uint8Array | null>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(DB_KEY)
    req.onsuccess = () => resolve((req.result as Uint8Array) ?? null)
    req.onerror = () => reject(req.error)
  })
  db.close()
  return result
}

// Remember the last synced ETag so we can detect remote changes cheaply.
export function getSyncMeta(): { etag: string | null; lastSyncedAt: string | null } {
  return {
    etag: localStorage.getItem('ht.sync.etag'),
    lastSyncedAt: localStorage.getItem('ht.sync.at'),
  }
}

export function setSyncMeta(etag: string | null, lastSyncedAt: string): void {
  if (etag) localStorage.setItem('ht.sync.etag', etag)
  localStorage.setItem('ht.sync.at', lastSyncedAt)
}

// Timestamp of the last time the DB was written to on-device storage.
export function setLastLocalSave(iso: string): void {
  localStorage.setItem('ht.lastLocalSave', iso)
}
export function getLastLocalSave(): string | null {
  return localStorage.getItem('ht.lastLocalSave')
}
