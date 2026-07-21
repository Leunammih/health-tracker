// Small date helpers. All dates stored as ISO 'YYYY-MM-DD'; timestamps as full ISO strings.

export function todayISO(): string {
  const d = new Date()
  const off = d.getTimezoneOffset()
  const local = new Date(d.getTime() - off * 60_000)
  return local.toISOString().slice(0, 10)
}

export function nowISO(): string {
  return new Date().toISOString()
}

export function nowTime(): string {
  return new Date().toTimeString().slice(0, 5)
}

export function fmtDate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso.length <= 10 ? iso + 'T00:00:00' : iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function daysAgoISO(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10)
}

// Every ISO date from `sinceISO` through `untilISO` (default today). Charts render
// against this shared spine so a day with no entry still occupies a column and all
// graphs line up vertically for the same date.
export function dateSpine(sinceISO: string, untilISO: string = todayISO()): string[] {
  return expandDateRange(sinceISO, untilISO)
}

const DAY_NAMES: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
}

// Map free-form weekday labels (e.g. "Mon", "wednesday") to JS getDay() numbers (0=Sun).
// Unrecognised labels are dropped.
export function weekdayNums(labels: string[] | undefined): number[] {
  if (!labels?.length) return []
  const out = new Set<number>()
  for (const l of labels) {
    const n = DAY_NAMES[l.trim().toLowerCase()]
    if (n !== undefined) out.add(n)
  }
  return [...out]
}

// Every ISO date from startISO..endISO inclusive, optionally restricted to the
// given weekday numbers (0=Sun). Handles reversed inputs; capped at `max` dates
// to guard against a runaway range. Returns [] on invalid input.
export function expandDateRange(startISO: string, endISO: string, weekdays: number[] = [], max = 366): string[] {
  const start = new Date(startISO + 'T00:00:00')
  const end = new Date(endISO + 'T00:00:00')
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return []
  let lo = start, hi = end
  if (lo > hi) { lo = end; hi = start }
  const allow = weekdays.length ? new Set(weekdays) : null
  const out: string[] = []
  const cur = new Date(lo)
  while (cur <= hi && out.length < max) {
    if (!allow || allow.has(cur.getDay())) {
      const y = cur.getFullYear()
      const m = String(cur.getMonth() + 1).padStart(2, '0')
      const d = String(cur.getDate()).padStart(2, '0')
      out.push(`${y}-${m}-${d}`)
    }
    cur.setDate(cur.getDate() + 1)
  }
  return out
}
