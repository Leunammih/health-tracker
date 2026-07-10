import { useMemo, useRef, useState } from 'react'
import { loadSettings, saveSettings, getLastLocalSave, type Settings } from '../lib/storage'
import { testConnection, beginAuth, disconnect, isConfigured } from '../sync/dropbox'
import { pullIfNewer } from '../sync/manager'
import { counts } from '../db/queries'
import { dbSizeBytes } from '../db/sqlite'
import { downloadDbFile, downloadJson, downloadCsvBundle, copyAllJson, importDbFile } from '../lib/export'

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
function fmtWhen(iso: string | null): string {
  if (!iso) return 'never'
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export default function SettingsTab({ onSaved }: { onSaved: () => void }) {
  const [s, setS] = useState<Settings>(loadSettings())
  const [saved, setSaved] = useState(false)
  const [test, setTest] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const importRef = useRef<HTMLInputElement>(null)
  const c = useMemo(() => counts(), [refreshKey])
  const storage = useMemo(
    () => ({ size: dbSizeBytes(), lastSave: getLastLocalSave() }),
    [refreshKey],
  )

  async function handleImport(file: File) {
    setImporting(true)
    setImportMsg(null)
    try {
      await importDbFile(file)
      setRefreshKey((k) => k + 1)
      setImportMsg('Imported ✓')
    } catch (e) {
      setImportMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setImporting(false)
    }
  }

  function set<K extends keyof Settings>(k: K, v: Settings[K]) {
    setS((prev) => ({ ...prev, [k]: v }))
    setSaved(false)
  }

  function persist() {
    saveSettings(s)
    setSaved(true)
    onSaved()
    setTimeout(() => setSaved(false), 2000)
  }

  async function runTest() {
    saveSettings(s) // test uses stored settings
    setTesting(true)
    setTest(null)
    const r = await testConnection()
    setTest(r.message)
    setTesting(false)
  }

  async function connectDropbox() {
    if (!s.dropboxAppKey.trim()) {
      setTest('Enter your Dropbox app key first.')
      return
    }
    saveSettings(s) // persist app key so it survives the OAuth redirect
    await beginAuth(s.dropboxAppKey.trim()) // redirects away
  }

  function disconnectDropbox() {
    disconnect()
    const next = { ...s, dropboxRefreshToken: '', syncEnabled: false }
    setS(next)
    setTest(null)
  }

  const dropboxConnected = isConfigured(s)

  return (
    <div className="space-y-4">
      <section className="card space-y-3">
        <div className="label">Claude API</div>
        <div>
          <label className="label">Anthropic API key</label>
          <input
            type="password"
            className="field"
            placeholder="sk-ant-…"
            value={s.anthropicKey}
            onChange={(e) => set('anthropicKey', e.target.value.trim())}
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-ink-400">Stored only on this device.</p>
        </div>
        <div>
          <label className="label">Model</label>
          <select className="field" value={s.model} onChange={(e) => set('model', e.target.value)}>
            <option value="claude-sonnet-5">Claude Sonnet 5 (fast, cheaper — recommended)</option>
            <option value="claude-opus-4-8">Claude Opus 4.8 (most capable)</option>
            <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 (cheapest)</option>
          </select>
        </div>
      </section>

      <section className="card space-y-3">
        <div className="label">Dropbox sync</div>
        {dropboxConnected ? (
          <>
            <div className="flex items-center gap-2 text-sm text-brand-300">
              <span className="h-2.5 w-2.5 rounded-full bg-brand-400" /> Dropbox connected
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-ghost" disabled={testing} onClick={() => void runTest()}>
                {testing ? 'Testing…' : 'Test connection'}
              </button>
              <button className="btn-ghost" onClick={() => void pullIfNewer()}>
                Sync now
              </button>
            </div>
            {test && <p className="text-xs text-ink-300">{test}</p>}
            <button className="btn-ghost w-full !text-red-400" onClick={disconnectDropbox}>
              Disconnect Dropbox
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-ink-300">
              Sync your data across devices via Dropbox. One-time setup:
            </p>
            <ol className="list-decimal space-y-1 pl-5 text-xs text-ink-400">
              <li>
                Go to the Dropbox <strong>App Console</strong> → Create app → “Scoped access” → “App
                folder” → name it (e.g. HealthTracker).
              </li>
              <li>
                Under <strong>Permissions</strong>, enable <code>files.content.write</code> and{' '}
                <code>files.content.read</code>; save.
              </li>
              <li>
                Under <strong>Settings</strong>, add this exact <strong>Redirect URI</strong>:{' '}
                <code className="break-all">{window.location.origin + window.location.pathname}</code>
              </li>
              <li>Copy the <strong>App key</strong> and paste it below, then Connect.</li>
            </ol>
            <div>
              <label className="label">Dropbox app key</label>
              <input
                className="field"
                placeholder="e.g. a1b2c3d4e5f6g7h"
                value={s.dropboxAppKey}
                onChange={(e) => set('dropboxAppKey', e.target.value.trim())}
                autoComplete="off"
              />
            </div>
            <button className="btn-primary w-full" onClick={() => void connectDropbox()}>
              Connect Dropbox
            </button>
            {test && <p className="text-xs text-ink-300">{test}</p>}
          </>
        )}
      </section>

      <button className="btn-primary w-full" onClick={persist}>
        {saved ? 'Saved ✓' : 'Save settings'}
      </button>

      <section className="card space-y-2">
        <div className="label">Where your data lives</div>
        <p className="text-sm text-ink-300">
          Your health database is stored <strong>on this device</strong>, inside this app's private
          browser storage. It is <strong>not</strong> a file you can open in the iOS Files app — that's
          why <em>Export</em> exists (to make a copy you can keep or move).
        </p>
        <div className="flex flex-wrap gap-2 text-xs text-ink-300">
          <span className="chip">Size: {fmtBytes(storage.size)}</span>
          <span className="chip">Last saved: {fmtWhen(storage.lastSave)}</span>
        </div>
        <p className="text-xs text-amber-300/90">
          Connect <strong>Dropbox sync</strong> above to keep an automatic off-device backup that also
          syncs across your devices. Even so, an occasional <em>Export .db</em> is a good safety net.
        </p>
      </section>

      <section className="card space-y-3">
        <div className="label">Data</div>
        <div className="flex flex-wrap gap-2 text-xs text-ink-300">
          {Object.entries(c).map(([k, v]) => (
            <span key={k} className="chip">
              {k.replace('_', ' ')}: {v}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-ghost" onClick={downloadDbFile}>Export .db</button>
          <button className="btn-ghost" onClick={downloadJson}>Export JSON</button>
          <button className="btn-ghost" onClick={downloadCsvBundle}>Export CSV</button>
          <button
            className="btn-ghost"
            onClick={() => {
              void copyAllJson().then(() => {
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              })
            }}
          >
            {copied ? 'Copied ✓' : 'Copy JSON'}
          </button>
        </div>
        <input
          ref={importRef}
          type="file"
          accept=".db,application/octet-stream"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleImport(f)
            e.target.value = ''
          }}
        />
        <button className="btn-ghost w-full" disabled={importing} onClick={() => importRef.current?.click()}>
          {importing ? 'Importing…' : 'Import .db'}
        </button>
        {importMsg && <p className="text-xs text-ink-300">{importMsg}</p>}
        <p className="text-xs text-ink-400">
          Import replaces the data in this app with the picked file — a manual alternative to Dropbox
          sync for moving a <code>health.db</code> between devices.
        </p>
      </section>

      <p className="pb-4 text-center text-[11px] text-ink-600">Health Tracker · data stays on your device</p>
    </div>
  )
}
