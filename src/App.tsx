import { useEffect, useState } from 'react'
import { initDb } from './db/sqlite'
import { startSync, pullIfNewer } from './sync/manager'
import { loadSettings } from './lib/storage'
import SyncBadge from './components/SyncBadge'
import { IconLog, IconMeal, IconChart, IconBrain, IconSettings } from './components/icons'
import LogTab from './tabs/LogTab'
import NutritionTab from './tabs/NutritionTab'
import InsightsTab from './tabs/InsightsTab'
import InterpretationTab from './tabs/InterpretationTab'
import SettingsTab from './tabs/SettingsTab'

type Tab = 'log' | 'nutrition' | 'insights' | 'interpret' | 'settings'

const TABS: { id: Tab; label: string; Icon: typeof IconLog }[] = [
  { id: 'log', label: 'Log', Icon: IconLog },
  { id: 'nutrition', label: 'Meals', Icon: IconMeal },
  { id: 'insights', label: 'Insights', Icon: IconChart },
  { id: 'interpret', label: 'Patterns', Icon: IconBrain },
  { id: 'settings', label: 'Settings', Icon: IconSettings },
]

export default function App() {
  const [ready, setReady] = useState(false)
  const [tab, setTab] = useState<Tab>('log')
  const [needsKey, setNeedsKey] = useState(false)

  useEffect(() => {
    void (async () => {
      await initDb()
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
        <h1 className="text-lg font-semibold tracking-tight text-white">
          {TABS.find((t) => t.id === tab)?.label}
        </h1>
        <SyncBadge />
      </header>

      {needsKey && tab !== 'settings' && (
        <button
          onClick={() => setTab('settings')}
          className="mx-4 mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-left text-sm text-amber-200"
        >
          Add your Anthropic API key in Settings to enable AI features →
        </button>
      )}

      <main className="flex-1 overflow-y-auto px-4 py-4">
        {tab === 'log' && <LogTab />}
        {tab === 'nutrition' && <NutritionTab />}
        {tab === 'insights' && <InsightsTab />}
        {tab === 'interpret' && <InterpretationTab />}
        {tab === 'settings' && <SettingsTab onSaved={() => setNeedsKey(!loadSettings().anthropicKey)} />}
      </main>

      <nav className="safe-bottom sticky bottom-0 z-10 grid grid-cols-5 border-t border-ink-700 bg-ink-900/95 backdrop-blur">
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
