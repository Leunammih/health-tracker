// Shared by every "apply this to earlier days" control — the Insights tap-to-log
// sheet, the Log tab's quick-entry rows, and the sleep editor — so they all count
// back from the SELECTED day, label their range the same way, and treat notes the
// same way.

import { daysEndingOn, fmtDate } from './dates'

// The three targets offered everywhere: the day before the selected one, and the
// 3- and 7-day spans ending on it (selected day included).
export function applyTargets(selected: string): { key: 'prev' | '3' | '7'; label: string; days: string[] }[] {
  const prev = daysEndingOn(selected, 2)[0]
  const three = daysEndingOn(selected, 3)
  const seven = daysEndingOn(selected, 7)
  return [
    { key: 'prev', label: fmtDate(prev), days: [prev] },
    { key: '3', label: rangeLabel(three), days: three },
    { key: '7', label: rangeLabel(seven), days: seven },
  ]
}

// '16–18 Oct' (or 'Oct 16–18' in a US locale), or 'Sep 28 – Oct 4' across a month
// boundary — whatever fmtDate gives for each end, collapsed when the month matches.
export function rangeLabel(days: string[]): string {
  const first = fmtDate(days[0])
  const last = fmtDate(days[days.length - 1])
  if (days.length === 1) return first
  if (days[0].slice(0, 7) === days[days.length - 1].slice(0, 7)) {
    const lastDay = String(Number(days[days.length - 1].slice(8)))
    return first.replace(/\d+/, (d) => `${d}–${lastDay}`)
  }
  return `${first} – ${last}`
}

// The note a copied-onto day should end up with, as a tri-state note argument
// (undefined = keep the day's own). No note being copied → leave every day's note
// alone. A day with its own different note keeps it with this one appended rather
// than losing it; one that already contains it isn't doubled.
export function mergeNote(existing: string | null | undefined, copied: string): string | undefined {
  const draft = copied.trim()
  if (!draft) return undefined
  const own = existing?.trim()
  if (!own) return draft
  if (own.includes(draft)) return undefined
  return `${own}; ${draft}`
}
