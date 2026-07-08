import { useEffect, useState } from 'react'
import { subscribeSync, pullIfNewer, type SyncStatus } from '../sync/manager'

const dotColor: Record<SyncStatus['state'], string> = {
  idle: 'bg-brand-400',
  syncing: 'bg-amber-400 animate-pulse',
  error: 'bg-red-500',
  offline: 'bg-ink-400',
  disabled: 'bg-ink-600',
}

export default function SyncBadge() {
  const [s, setS] = useState<SyncStatus | null>(null)
  useEffect(() => subscribeSync(setS), [])
  if (!s) return null
  return (
    <button
      onClick={() => void pullIfNewer()}
      className="flex items-center gap-2 text-xs text-ink-300"
      title="Tap to sync now"
    >
      <span className={`h-2.5 w-2.5 rounded-full ${dotColor[s.state]}`} />
      <span className="max-w-[9rem] truncate">{s.message}</span>
    </button>
  )
}
