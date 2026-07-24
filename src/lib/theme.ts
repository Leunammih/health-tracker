// Light/parchment toggle. The preference lives in Settings (localStorage) and
// is applied as a `.parchment` class on <html>, which is all src/index.css's
// CSS vars need to repaint every existing bg-ink-*/text-brand-* class — chart
// code that can't rely on CSS cascade (SVG stroke attributes, palette.ts) reads
// getTheme()/subscribeTheme() instead. Mirrors the subscribeSync pattern in
// sync/manager.ts.
import { useEffect, useState } from 'react'
import { loadSettings, saveSettings, type Theme } from './storage'

export type { Theme }

let theme: Theme = loadSettings().theme
const subs = new Set<(t: Theme) => void>()

function apply(t: Theme): void {
  document.documentElement.classList.toggle('parchment', t === 'light')
}

// Call once at boot, before the first paint, so there's no flash of the wrong
// theme.
export function initTheme(): void {
  apply(theme)
}

export function getTheme(): Theme {
  return theme
}

export function isLight(): boolean {
  return theme === 'light'
}

export function setTheme(next: Theme): void {
  if (next === theme) return
  theme = next
  saveSettings({ ...loadSettings(), theme: next })
  apply(next)
  subs.forEach((fn) => fn(theme))
}

export function subscribeTheme(fn: (t: Theme) => void): () => void {
  subs.add(fn)
  fn(theme)
  return () => subs.delete(fn)
}

// For components whose colours are computed in JS rather than CSS (SVG chart
// strokes via palette.ts) — re-renders whenever the toggle in Settings flips.
export function useTheme(): Theme {
  const [t, setT] = useState(theme)
  useEffect(() => subscribeTheme(setT), [])
  return t
}
