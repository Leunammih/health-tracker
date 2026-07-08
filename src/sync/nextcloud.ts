// Minimal WebDAV client for Nextcloud. Requires the Nextcloud "WebAppPassword" app
// (adds CORS headers) so the browser can reach /remote.php/dav directly.
import { loadSettings, type Settings } from '../lib/storage'

const DB_FILE = 'health.db'

function authHeader(s: Settings): string {
  return 'Basic ' + btoa(`${s.nextcloudUser}:${s.nextcloudPass}`)
}

// Users often paste the full WebDAV URL their provider gave them (already
// including /remote.php/dav/files/<user>/), not just the bare domain. To be
// robust either way, we only ever trust the origin (scheme + host) the user
// entered and always (re)construct the canonical WebDAV path ourselves —
// any path/scheme they included is ignored rather than compounded.
function resolveOrigin(raw: string): string {
  let input = raw.trim()
  if (!input) throw new Error('Nextcloud server URL is empty.')
  if (!/^https?:\/\//i.test(input)) input = 'https://' + input
  try {
    return new URL(input).origin
  } catch {
    throw new Error(`Invalid Nextcloud server URL: "${raw}"`)
  }
}

function baseUrl(s: Settings): string {
  const root = resolveOrigin(s.nextcloudUrl)
  const user = encodeURIComponent(s.nextcloudUser)
  const path = s.nextcloudPath.replace(/^\/+/, '').replace(/\/+$/, '')
  const encPath = path
    .split('/')
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join('/')
  return `${root}/remote.php/dav/files/${user}/${encPath}`
}

export function isConfigured(s = loadSettings()): boolean {
  return !!(s.syncEnabled && s.nextcloudUrl && s.nextcloudUser && s.nextcloudPass)
}

async function ensureFolder(s: Settings): Promise<void> {
  const url = baseUrl(s)
  const res = await fetch(url, { method: 'MKCOL', headers: { Authorization: authHeader(s) } })
  // 201 created, 405 already exists — both fine. Anything else is a real problem
  // (bad URL, wrong path, auth failure, parent folder missing) and must not be
  // swallowed, or "Test connection" can report success when it silently isn't.
  if (res.status === 201 || res.status === 405) return
  if (res.status === 401) throw new Error('Nextcloud auth failed (401). Check user / app password.')
  if (res.status === 404 || res.status === 409) {
    throw new Error(`Nextcloud folder not reachable (${res.status}) at ${url} — check the server URL and folder path.`)
  }
  throw new Error(`Nextcloud error ${res.status} at ${url}`)
}

export interface PullResult {
  bytes: Uint8Array | null
  etag: string | null
  exists: boolean
}

// Fetch the remote DB if present. Returns bytes + ETag.
export async function pullDb(): Promise<PullResult> {
  const s = loadSettings()
  const url = `${baseUrl(s)}/${DB_FILE}`
  const res = await fetch(url, { method: 'GET', headers: { Authorization: authHeader(s) } })
  if (res.status === 404) return { bytes: null, etag: null, exists: false }
  if (res.status === 401) throw new Error('Nextcloud auth failed (401). Check user / app password.')
  if (!res.ok) throw new Error(`Nextcloud pull failed: ${res.status}`)
  const buf = new Uint8Array(await res.arrayBuffer())
  // An empty or zero-length body is not a usable database — treat it as "no file yet"
  // rather than something to load, so a stray empty file can't corrupt local state.
  if (buf.length === 0) return { bytes: null, etag: null, exists: false }
  return { bytes: buf, etag: normEtag(res.headers.get('etag')), exists: true }
}

// Get just the remote ETag cheaply (HEAD). null if the file does not exist yet.
export async function remoteEtag(): Promise<string | null> {
  const s = loadSettings()
  const url = `${baseUrl(s)}/${DB_FILE}`
  const res = await fetch(url, { method: 'HEAD', headers: { Authorization: authHeader(s) } })
  if (res.status === 404) return null
  if (!res.ok) return null
  return normEtag(res.headers.get('etag'))
}

// Upload the DB. Returns the new ETag.
export async function pushDb(bytes: Uint8Array): Promise<string | null> {
  const s = loadSettings()
  await ensureFolder(s)
  const url = `${baseUrl(s)}/${DB_FILE}`
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: authHeader(s), 'Content-Type': 'application/octet-stream' },
    body: sliceToArrayBuffer(bytes),
  })
  if (res.status === 401) throw new Error('Nextcloud auth failed (401). Check user / app password.')
  if (!res.ok && res.status !== 204) throw new Error(`Nextcloud push failed: ${res.status}`)
  // Some servers omit ETag on PUT; fall back to a HEAD.
  return normEtag(res.headers.get('etag')) ?? (await remoteEtag())
}

// Upload a meal photo, return its relative path within the folder.
export async function pushPhoto(bytes: Uint8Array, filename: string): Promise<string> {
  const s = loadSettings()
  await ensureFolder(s)
  // ensure photos subfolder
  await fetch(`${baseUrl(s)}/photos`, { method: 'MKCOL', headers: { Authorization: authHeader(s) } })
  const rel = `photos/${filename}`
  const url = `${baseUrl(s)}/${rel}`
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: authHeader(s), 'Content-Type': 'application/octet-stream' },
    body: sliceToArrayBuffer(bytes),
  })
  if (!res.ok && res.status !== 204) throw new Error(`Photo upload failed: ${res.status}`)
  return rel
}

// Lightweight connectivity check for the Settings screen.
export async function testConnection(): Promise<{ ok: boolean; message: string }> {
  const s = loadSettings()
  if (!isConfigured(s)) return { ok: false, message: 'Fill in URL, user and app password, and enable sync.' }
  try {
    await ensureFolder(s)
    return { ok: true, message: `Connected. Using ${baseUrl(s)}` }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const cors = /Failed to fetch|NetworkError|CORS/i.test(msg)
    return {
      ok: false,
      message: cors
        ? 'Could not reach Nextcloud from the browser. Enable the "WebAppPassword" app on your Nextcloud to allow CORS, then retry.'
        : msg,
    }
  }
}

function normEtag(v: string | null): string | null {
  return v ? v.replace(/^W\//, '').replace(/"/g, '') : null
}

function sliceToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}
