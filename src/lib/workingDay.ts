// The day he's logging for, shared by the Log and Meals tabs.
//
// It used to be component state initialised to today, so it snapped back to
// today after every save, on every tab switch and whenever iOS reloaded the
// backgrounded app — and a long evening of entries meant for yesterday landed on
// today. Now it stays where he put it until he changes it, with one exception:
// after IDLE_MS without the app being touched it returns to today, so opening the
// app the next morning doesn't quietly log onto yesterday.
//
// localStorage, not the DB's meta table: this is a pointer into one session of
// use on one device, not health data, and syncing it would drag the laptop onto
// whatever day the phone happened to be on.

import { useSyncExternalStore } from 'react'
import { todayISO } from './dates'

const KEY = 'ht.workingDay'
const IDLE_MS = 6 * 60 * 60 * 1000
const TOUCH_EVERY_MS = 60 * 1000

// null = follow today (including across midnight). Picking today stores null,
// so "today" stays today rather than freezing on the date it was picked.
let pinned: string | null = null
let lastTouch = Date.now()
const listeners = new Set<() => void>()

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ date: pinned, at: lastTouch }))
  } catch {
    // Private mode / storage full: the day still holds for this session.
  }
}

function load(): void {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as { date?: unknown; at?: unknown }
    const at = typeof parsed.at === 'number' ? parsed.at : 0
    const date = typeof parsed.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null
    pinned = Date.now() - at > IDLE_MS ? null : date
  } catch {
    pinned = null
  }
}

function emit(): void {
  listeners.forEach((l) => l())
}

// Called on interaction: a fresh touch keeps the pin alive; a stale one means
// the app sat unused long enough that "today" is the safer default again.
function touch(): void {
  const now = Date.now()
  if (now - lastTouch > IDLE_MS && pinned) {
    pinned = null
    emit()
  }
  if (now - lastTouch > TOUCH_EVERY_MS) {
    lastTouch = now
    save()
  }
}

if (typeof window !== 'undefined') {
  load()
  lastTouch = Date.now()
  save()
  window.addEventListener('pointerdown', touch, { passive: true })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      touch()
      // Midnight may have passed while hidden; let "today" re-render.
      emit()
    }
  })
}

export function getWorkingDay(): string {
  const today = todayISO()
  // A pinned day can't be in the future (pickers stop at today), but a clock
  // change could make it so — treat that as today.
  return pinned && pinned < today ? pinned : today
}

export function setWorkingDay(date: string): void {
  pinned = date >= todayISO() ? null : date
  lastTouch = Date.now()
  save()
  emit()
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function useWorkingDay(): [string, (date: string) => void] {
  const day = useSyncExternalStore(subscribe, getWorkingDay)
  return [day, setWorkingDay]
}
