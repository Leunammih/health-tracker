import { useMemo, useRef, useState } from 'react'
import { loadSettings, saveSettings, getLastLocalSave, type Settings } from '../lib/storage'
import { testConnection } from '../sync/nextcloud'
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
        <div className="label">Nextcloud sync</div>
        <label className="flex items-center gap-2 text-sm text-ink-300">
          <input type="checkbox" checked={s.syncEnabled} onChange={(e) => set('syncEnabled', e.target.checked)} />
          Enable sync
        </label>
        <div>
          <label className="label">Server URL</label>
          <input className="field" placeholder="https://cloud.example.com" value={s.nextcloudUrl} onChange={(e) => set('nextcloudUrl', e.target.value.trim())} />
          <p className="mt-1 text-xs text-ink-400">
            Just the domain (e.g. <code>https://cloud.example.com</code>) — not the full WebDAV link. Even if
            you paste a longer WebDAV URL your provider gave you, only the domain part is used.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Username</label>
            <input className="field" value={s.nextcloudUser} onChange={(e) => set('nextcloudUser', e.target.value.trim())} autoComplete="off" />
          </div>
          <div>
            <label className="label">App password</label>
            <input type="password" className="field" value={s.nextcloudPass} onChange={(e) => set('nextcloudPass', e.target.value)} autoComplete="off" />
          </div>
        </div>
        <div>
          <label className="label">Folder path</label>
          <input className="field" placeholder="/HealthTracker" value={s.nextcloudPath} onChange={(e) => set('nextcloudPath', e.target.value.trim())} />
        </div>
        <button className="btn-ghost w-full" disabled={testing} onClick={() => void runTest()}>
          {testing ? 'Testing…' : 'Test connection'}
        </button>
        {test && <p className="text-xs text-ink-300">{test}</p>}
        <p className="text-xs text-ink-400">
          Some Nextcloud providers block direct browser access entirely (no CORS on WebDAV), in which case
          this will keep failing no matter how correct your details are — often the case on managed/hosted
          plans where you can't change server settings. If so, use <strong>Export / Import .db</strong> below
          instead: export on one device, save the file into your Nextcloud folder, then import it on the other.
        </p>
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
          Back up regularly with <em>Export .db</em> below — if you clear Safari's website data or lose
          the device, anything not exported is gone. (Automatic Nextcloud sync isn't possible on your
          current provider — see Nextcloud sync above.)
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
          Import replaces the data in this app with the picked file — use this after moving a newer
          <code> health.db</code> here from another device (e.g. via your Nextcloud folder).
        </p>
        <button className="btn-ghost w-full" onClick={() => void pullIfNewer()}>
          Sync now
        </button>
      </section>

      <p className="pb-4 text-center text-[11px] text-ink-600">Health Tracker · data stays on your device</p>
    </div>
  )
}
