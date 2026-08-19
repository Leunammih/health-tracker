// Getting a new build onto the phone, on purpose rather than by luck.
//
// The problem this fixes: vite.config.ts registered the service worker through the
// script vite-plugin-pwa injects into index.html, and nothing in the app ever
// called registerSW itself. A new worker is therefore only fetched on a real
// navigation — and an installed iOS PWA resumed from the background essentially
// never performs one, which is why pull-to-refresh kept serving the old build.
//
// Three things happen here:
//   1. registerSW is called explicitly, so we hold the registration and can ask it
//      to look for a new version whenever we want.
//   2. We ask on every return to the foreground (throttled), which is the moment a
//      standalone PWA actually has a chance to notice.
//   3. registerType is 'prompt' (see vite.config.ts), so a new version NEVER
//      reloads the page underneath him — a reload mid-entry would discard slider
//      drafts that haven't been saved. He presses Update.
//
// Subscription shape mirrors subscribeTheme (lib/theme.ts) and subscribeSync
// (sync/manager.ts) so it reads like the rest of the app.

import { registerSW } from 'virtual:pwa-register'

export type UpdateState = 'idle' | 'checking' | 'ready'
export type CheckResult = 'ready' | 'current' | 'unsupported' | 'failed'

const THROTTLE_MS = 60_000

let state: UpdateState = 'idle'
let lastCheck = 0
let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null
let registration: ServiceWorkerRegistration | undefined
const subs = new Set<(s: UpdateState) => void>()

function set(next: UpdateState): void {
  if (next === state) return
  state = next
  subs.forEach((fn) => fn(state))
}

export function getUpdateState(): UpdateState {
  return state
}

export function subscribeUpdate(fn: (s: UpdateState) => void): () => void {
  subs.add(fn)
  fn(state)
  return () => subs.delete(fn)
}

// True when a service worker is actually running — false in `npm run dev`, where
// vite-plugin-pwa doesn't register one. Settings says so rather than claiming
// "you're on the latest version" on no evidence.
export function hasServiceWorker(): boolean {
  return registration != null
}

export function buildId(): string {
  return __BUILD_ID__
}

export function initAppUpdate(): void {
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      set('ready')
    },
    onRegisteredSW(_url, r) {
      registration = r
    },
  })

  // The actual fix for a resumed standalone PWA: there is no navigation to hang an
  // update check on, but there is always a return to the foreground.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkForUpdate(true)
  })
}

// Ask the browser to re-fetch the service worker script and report what it found.
// `throttled` is for the automatic foreground check; the Settings button passes
// nothing so a deliberate press always does a real check.
export async function checkForUpdate(throttled = false): Promise<CheckResult> {
  if (state === 'ready') return 'ready'
  if (!registration) return 'unsupported'
  if (throttled && Date.now() - lastCheck < THROTTLE_MS) return 'current'

  lastCheck = Date.now()
  set('checking')
  try {
    await registration.update()
  } catch {
    // Offline, or the SW script didn't come back. Not an error worth a red banner.
    set('idle')
    return 'failed'
  }

  // update() resolves once the script has been fetched — a new worker may still be
  // installing its precache. Wait for it to finish rather than guessing with a
  // timeout, so "you're on the latest version" is a claim we can actually make.
  const installing = registration.installing
  if (installing) {
    await new Promise<void>((resolve) => {
      const onChange = () => {
        if (installing.state === 'installed' || installing.state === 'redundant' || installing.state === 'activated') {
          installing.removeEventListener('statechange', onChange)
          resolve()
        }
      }
      installing.addEventListener('statechange', onChange)
      onChange()
    })
  }

  if (registration.waiting) {
    set('ready')
    return 'ready'
  }
  set('idle')
  return 'current'
}

// Activate the waiting worker and reload into it.
export async function applyUpdate(): Promise<void> {
  await updateSW?.(true)
}
