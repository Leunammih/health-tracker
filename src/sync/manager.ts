// Coordinates local DB <-> Nextcloud: pull on start, debounced push on change.
import { exportBytes, replaceDb, onDbChange } from '../db/sqlite'
import { getSyncMeta, setSyncMeta } from '../lib/storage'
import { nowISO } from '../lib/dates'
import { isConfigured, pullDb, pushDb, remoteEtag } from './nextcloud'

export type SyncState = 'idle' | 'syncing' | 'error' | 'offline' | 'disabled'
export interface SyncStatus {
  state: SyncState
  message: string
  lastSyncedAt: string | null
}

let status: SyncStatus = { state: 'disabled', message: 'Sync off', lastSyncedAt: getSyncMeta().lastSyncedAt }
const subs = new Set<(s: SyncStatus) => void>()
let pushTimer: ReturnType<typeof setTimeout> | null = null
let suppressPush = false

function set(next: Partial<SyncStatus>) {
  status = { ...status, ...next }
  subs.forEach((f) => f(status))
}

export function subscribeSync(fn: (s: SyncStatus) => void): () => void {
  subs.add(fn)
  fn(status)
  return () => subs.delete(fn)
}

export function getStatus(): SyncStatus {
  return status
}

// Pull the newest remote DB into the local store (called on app open / manual sync).
export async function pullIfNewer(): Promise<void> {
  if (!isConfigured()) {
    set({ state: 'disabled', message: 'Sync off' })
    return
  }
  set({ state: 'syncing', message: 'Checking Nextcloud…' })
  try {
    const localEtag = getSyncMeta().etag
    const rEtag = await remoteEtag()
    if (rEtag && rEtag === localEtag) {
      set({ state: 'idle', message: 'Up to date', lastSyncedAt: getSyncMeta().lastSyncedAt })
      return
    }
    const res = await pullDb()
    if (res.exists && res.bytes) {
      try {
        suppressPush = true
        await replaceDb(res.bytes)
        const at = nowISO()
        setSyncMeta(res.etag, at)
        set({ state: 'idle', message: 'Pulled latest', lastSyncedAt: at })
      } catch (e) {
        // Remote file was invalid/corrupt — local data is untouched (replaceDb
        // validates before swapping). Re-push our good local copy to repair it.
        console.error('Rejected remote DB, re-pushing local copy:', e)
        suppressPush = false
        await pushNow()
        return
      } finally {
        suppressPush = false
      }
    } else {
      // No remote file yet — push our local copy to seed it.
      await pushNow()
    }
  } catch (e) {
    reportError(e)
  }
}

async function pushNow(): Promise<void> {
  if (!isConfigured()) return
  set({ state: 'syncing', message: 'Saving to Nextcloud…' })
  try {
    const etag = await pushDb(exportBytes())
    const at = nowISO()
    setSyncMeta(etag, at)
    set({ state: 'idle', message: 'Saved', lastSyncedAt: at })
  } catch (e) {
    reportError(e)
  }
}

export function pushSoon(delay = 2500): void {
  if (!isConfigured() || suppressPush) return
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => void pushNow(), delay)
}

function reportError(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e)
  const offline = /Failed to fetch|NetworkError/i.test(msg)
  set({ state: offline ? 'offline' : 'error', message: offline ? 'Offline — will retry' : msg })
}

// Wire local DB changes to a debounced push. Call once at startup.
export function startSync(): void {
  onDbChange(() => pushSoon())
  // Flush a pending push when the app is backgrounded / closed.
  const flush = () => {
    if (pushTimer) {
      clearTimeout(pushTimer)
      pushTimer = null
      void pushNow()
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
  window.addEventListener('online', () => void pullIfNewer())
}
