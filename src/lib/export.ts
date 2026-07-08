import { exportBytes, replaceDb } from '../db/sqlite'
import { all } from '../db/queries'
import { TABLES } from '../db/schema'

function download(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function downloadDbFile(): void {
  const bytes = exportBytes()
  download('health.db', new Blob([bytes as unknown as BlobPart], { type: 'application/octet-stream' }))
}

// Manual counterpart to downloadDbFile — for providers where automatic
// Nextcloud sync can't work (no browser CORS support), export on one device
// and import the same file on another. replaceDb() validates it's a real
// SQLite file before touching any live data.
export async function importDbFile(file: File): Promise<void> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  await replaceDb(bytes)
}

export function dumpAll(): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {}
  for (const t of TABLES) out[t] = all(`SELECT * FROM ${t}`)
  return out
}

export function downloadJson(): void {
  const json = JSON.stringify(dumpAll(), null, 2)
  download('health-export.json', new Blob([json], { type: 'application/json' }))
}

export async function copyAllJson(): Promise<void> {
  const json = JSON.stringify(dumpAll(), null, 2)
  await navigator.clipboard.writeText(json)
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return ''
  const cols = Object.keys(rows[0])
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const lines = [cols.join(',')]
  for (const r of rows) lines.push(cols.map((c) => esc(r[c])).join(','))
  return lines.join('\n')
}

export function downloadCsvBundle(): void {
  // Simple approach: one CSV containing all tables separated by headers.
  const parts: string[] = []
  for (const t of TABLES) {
    const rows = all<Record<string, unknown>>(`SELECT * FROM ${t}`)
    parts.push(`# ${t}`)
    parts.push(toCsv(rows))
    parts.push('')
  }
  download('health-export.csv', new Blob([parts.join('\n')], { type: 'text/csv' }))
}
