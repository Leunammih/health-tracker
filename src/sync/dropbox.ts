// Dropbox sync for a client-only PWA. Uses OAuth 2 with PKCE (no client secret,
// safe to run entirely in the browser) to obtain a refresh token, then mints
// short-lived access tokens on demand. Dropbox's API endpoints send CORS headers,
// so this works from the browser (unlike the old Nextcloud provider).
import { loadSettings, saveSettings } from '../lib/storage'

const DB_FILE = '/health.db'
const AUTHORIZE_URL = 'https://www.dropbox.com/oauth2/authorize'
const TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token'
const VERIFIER_KEY = 'ht.dropbox.pkce_verifier'

export function isConfigured(s = loadSettings()): boolean {
  return !!(s.syncEnabled && s.dropboxAppKey && s.dropboxRefreshToken)
}

// The OAuth redirect must return to this exact app URL (register it in the
// Dropbox App Console). We strip any query/hash so it matches the base app URL.
function redirectUri(): string {
  return window.location.origin + window.location.pathname
}

// ---- PKCE helpers ----

function base64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function randomVerifier(): string {
  const bytes = new Uint8Array(64)
  crypto.getRandomValues(bytes)
  return base64url(bytes)
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64url(new Uint8Array(digest))
}

// ---- OAuth flow ----

// Step 1: redirect the browser to Dropbox's consent screen.
export async function beginAuth(appKey: string): Promise<void> {
  const verifier = randomVerifier()
  sessionStorage.setItem(VERIFIER_KEY, verifier)
  const challenge = await challengeFor(verifier)
  const params = new URLSearchParams({
    client_id: appKey,
    response_type: 'code',
    redirect_uri: redirectUri(),
    code_challenge: challenge,
    code_challenge_method: 'S256',
    token_access_type: 'offline', // ask for a refresh token
  })
  window.location.href = `${AUTHORIZE_URL}?${params.toString()}`
}

// Step 2: on return, exchange the ?code=… for tokens. Returns true if it handled
// an OAuth redirect (so the caller can clean the URL), false if there was none.
export async function completeAuthFromRedirect(): Promise<boolean> {
  const url = new URL(window.location.href)
  const code = url.searchParams.get('code')
  if (!code) return false
  const verifier = sessionStorage.getItem(VERIFIER_KEY)
  const s = loadSettings()
  if (!verifier || !s.dropboxAppKey) return false

  const body = new URLSearchParams({
    code,
    grant_type: 'authorization_code',
    client_id: s.dropboxAppKey,
    redirect_uri: redirectUri(),
    code_verifier: verifier,
  })
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) throw new Error(`Dropbox token exchange failed: ${res.status} ${await res.text()}`)
  const json = (await res.json()) as { refresh_token?: string; access_token?: string; expires_in?: number }
  if (!json.refresh_token) throw new Error('Dropbox did not return a refresh token — reconnect.')
  saveSettings({ ...s, dropboxRefreshToken: json.refresh_token, syncEnabled: true })
  if (json.access_token) cacheAccessToken(json.access_token, json.expires_in ?? 14400)
  sessionStorage.removeItem(VERIFIER_KEY)
  return true
}

export function disconnect(): void {
  const s = loadSettings()
  saveSettings({ ...s, dropboxRefreshToken: '', syncEnabled: false })
  accessToken = null
}

// ---- Access-token cache (refresh-token → short-lived access token) ----

let accessToken: { value: string; expiresAt: number } | null = null

function cacheAccessToken(value: string, expiresIn: number): void {
  accessToken = { value, expiresAt: Date.now() + (expiresIn - 60) * 1000 }
}

async function getAccessToken(): Promise<string> {
  if (accessToken && accessToken.expiresAt > Date.now()) return accessToken.value
  const s = loadSettings()
  if (!s.dropboxRefreshToken || !s.dropboxAppKey) throw new Error('Dropbox not connected.')
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: s.dropboxRefreshToken,
    client_id: s.dropboxAppKey,
  })
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (res.status === 400 || res.status === 401) {
    throw new Error('Dropbox authorization expired — reconnect in Settings.')
  }
  if (!res.ok) throw new Error(`Dropbox token refresh failed: ${res.status}`)
  const json = (await res.json()) as { access_token: string; expires_in: number }
  cacheAccessToken(json.access_token, json.expires_in)
  return json.access_token
}

// ---- File operations ----

export interface PullResult {
  bytes: Uint8Array | null
  rev: string | null
  exists: boolean
}

async function apiRpc(endpoint: string, arg: unknown): Promise<Response> {
  const token = await getAccessToken()
  // Endpoints with no parameters (e.g. users/get_current_account) must be sent
  // with an empty body — a literal "null" JSON body is rejected.
  if (arg === null) {
    return fetch(`https://api.dropboxapi.com/2/${endpoint}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
  }
  return fetch(`https://api.dropboxapi.com/2/${endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(arg),
  })
}

// Current rev of the remote DB, or null if it doesn't exist yet.
export async function remoteRev(): Promise<string | null> {
  const res = await apiRpc('files/get_metadata', { path: DB_FILE })
  if (res.ok) {
    const json = (await res.json()) as { rev?: string }
    return json.rev ?? null
  }
  // 409 = path/not_found for a missing file — treat as "no file yet".
  if (res.status === 409) return null
  throw new Error(`Dropbox metadata failed: ${res.status}`)
}

export async function pullDb(): Promise<PullResult> {
  const token = await getAccessToken()
  const res = await fetch('https://content.dropboxapi.com/2/files/download', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Dropbox-API-Arg': JSON.stringify({ path: DB_FILE }) },
  })
  if (res.status === 409) return { bytes: null, rev: null, exists: false }
  if (!res.ok) throw new Error(`Dropbox download failed: ${res.status}`)
  const buf = new Uint8Array(await res.arrayBuffer())
  if (buf.length === 0) return { bytes: null, rev: null, exists: false }
  const meta = res.headers.get('dropbox-api-result')
  const rev = meta ? (JSON.parse(meta) as { rev?: string }).rev ?? null : null
  return { bytes: buf, rev, exists: true }
}

async function uploadFile(path: string, bytes: Uint8Array): Promise<string | null> {
  const token = await getAccessToken()
  const res = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': JSON.stringify({ path, mode: 'overwrite', mute: true }),
    },
    body: bytes.slice().buffer as ArrayBuffer,
  })
  if (!res.ok) throw new Error(`Dropbox upload failed: ${res.status}`)
  const json = (await res.json()) as { rev?: string }
  return json.rev ?? null
}

export async function pushDb(bytes: Uint8Array): Promise<string | null> {
  return uploadFile(DB_FILE, bytes)
}

// Upload a meal photo; returns its Dropbox path.
export async function pushPhoto(bytes: Uint8Array, filename: string): Promise<string> {
  const path = `/photos/${filename}`
  await uploadFile(path, bytes)
  return path
}

// Lightweight check for the Settings screen.
export async function testConnection(): Promise<{ ok: boolean; message: string }> {
  const s = loadSettings()
  if (!isConfigured(s)) return { ok: false, message: 'Connect your Dropbox first.' }
  try {
    const res = await apiRpc('users/get_current_account', null)
    if (!res.ok) throw new Error(`status ${res.status}`)
    const json = (await res.json()) as { name?: { display_name?: string } }
    return { ok: true, message: `Connected as ${json.name?.display_name ?? 'your Dropbox'}.` }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}
