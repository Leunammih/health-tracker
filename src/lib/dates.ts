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
