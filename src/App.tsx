import { useEffect, useState } from 'react'
import { initDb } from './db/sqlite'
import { startSync, pullIfNewer } from './sync/manager'
import { completeAuthFromRedirect } from './sync/dropbox'
import { loadSettings } from './lib/storage'
import { installDevtools } from './lib/devtools'
import { loadCustomMetrics } from './lib/customMetrics'
import { subscribeUpdate, applyUpdate } from './lib/appUpdate'
import SyncBadge from './components/SyncBadge'
import { IconHome, IconLog, IconMeal, IconChart, IconBrain, IconSettings } from './components/icons'
import HomeTab from './tabs/HomeTab'
import LogTab from './tabs/LogTab'
import NutritionTab from './tabs/NutritionTab'
import InsightsTab from './tabs/InsightsTab'
import InterpretationTab from './tabs/InterpretationTab'
import SettingsTab from './tabs/SettingsTab'

export type Tab = 'home' | 'log' | 'nutrition' | 'insights' | 'interpret' | 'settings'

const TABS: { id: Tab; label: string; Icon: typeof IconLog }[] = [
  { id: 'home', label: 'Home', Icon: IconHome },
  { id: 'log', label: 'Log', Icon: IconLog },
  { id: 'nutrition', label: 'Meals', Icon: IconMeal },
  { id: 'insights', label: 'Insights', Icon: IconChart },
  { id: 'interpret', label: 'Patterns', Icon: IconBrain },
  { id: 'settings', label: 'Settings', Icon: IconSettings },
]

export default function App() {
  const [ready, setReady] = useState(false)
  const [tab, setTab] = useState<Tab>('home')
  const [needsKey, setNeedsKey] = useState(false)
  // A new build is downloaded and waiting. Never applied automatically — see
  // lib/appUpdate.ts for why.
  const [updateReady, setUpdateReady] = useState(false)
  const [updating, setUpdating] = useState(false)

  useEffect(() => subscribeUpdate((s) => setUpdateReady(s === 'ready')), [])

  useEffect(() => {
    void (async () => {
      await initDb()
      loadCustomMetrics() // merge his own categories into the metric registry
      installDevtools() // no-op in production builds
      // Complete a Dropbox OAuth redirect if we're returning from one, then strip
      // the ?code=…/state from the URL so a refresh doesn't retry the exchange.
      try {
        if (await completeAuthFromRedirect()) {
          window.history.replaceState({}, '', window.location.origin + window.location.pathname)
          setTab('settings')
        }
      } catch (e) {
        console.error('Dropbox connect failed:', e)
      }
      startSync()
      setNeedsKey(!loadSettings().anthropicKey)
      setReady(true)
      void pullIfNewer()
    })()
  }, [])

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center text-ink-400">
        <div className="animate-pulse">Loading…</div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col">
      <header className="safe-top sticky top-0 z-10 flex items-center justify-between border-b border-ink-700 bg-ink-900/90 px-4 py-3 backdrop-blur">
        <h1 className="font-serif text-xl font-normal tracking-tight text-cream">
          {tab === 'home' ? 'Health Tracker' : TABS.find((t) => t.id === tab)?.label}
        </h1>
        <SyncBadge />
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-4">
        {/* Was previously rendered between the sticky header and this scroll
            region, in the outer flex column — so it never scrolled and sat
            fixed over content on every tab. Living inside <main> now, it
            scrolls away like everything else. */}
        {updateReady && (
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-brand-600/30 bg-brand-500/10 px-4 py-3 text-sm text-cream">
            <span className="shrink-0 text-brand-500">✦</span>
            <span className="flex-1">A new version is ready.</span>
            <button
              className="btn-primary shrink-0 !px-3 !py-1.5 text-xs"
              disabled={updating}
              onClick={() => { setUpdating(true); void applyUpdate() }}
            >
              {updating ? 'Updating…' : 'Update'}
            </button>
          </div>
        )}

        {needsKey && tab !== 'settings' && (
          <button
            onClick={() => setTab('settings')}
            className="mb-4 flex w-full items-start gap-3 rounded-2xl border border-brand-600/30 bg-brand-500/10 px-4 py-3 text-left text-sm text-cream"
          >
            <span className="shrink-0 text-brand-500">✦</span>
            <span>
              Add your Anthropic API key in Settings to enable AI features.{' '}
              <span className="text-brand-500">Open Settings →</span>
            </span>
          </button>
        )}

        {tab === 'home' && <HomeTab onNavigate={setTab} />}
        {tab === 'log' && <LogTab />}
        {tab === 'nutrition' && <NutritionTab />}
        {tab === 'insights' && <InsightsTab />}
        {tab === 'interpret' && <InterpretationTab />}
        {tab === 'settings' && <SettingsTab onSaved={() => setNeedsKey(!loadSettings().anthropicKey)} />}
      </main>

      <nav className="safe-bottom sticky bottom-0 z-10 grid grid-cols-6 border-t border-ink-700 bg-ink-900/95 backdrop-blur">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex flex-col items-center gap-1 py-2.5 text-[11px] transition ${
              tab === id ? 'text-brand-400' : 'text-ink-400'
            }`}
          >
            <Icon width={22} height={22} />
            {label}
          </button>
        ))}
      </nav>
    </div>
  )
}
