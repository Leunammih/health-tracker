import { useMemo, useState } from 'react'
import DayStrip from './DayStrip'
import SleepCard from './SleepCard'
import { wellbeingSince } from '../db/queries'

// The Insights way into sleep: tap a day on the Sleep chart → this sheet, on that
// day, with the same bedtime / wake / felt-quality card the Log tab uses — one
// editor, two doors, so the two can't drift apart. Duration isn't edited directly
// anywhere: it's computed from the two times (see sleepDurationMin), so changing a
// time IS changing the duration.
export default function SleepSheet({
  dates,
  initialDate,
  onClose,
  onChanged,
}: {
  dates: string[] // oldest → newest
  initialDate?: string
  onClose: () => void
  onChanged: () => void
}) {
  const [date, setDate] = useState(initialDate ?? dates[dates.length - 1])
  const [version, setVersion] = useState(0)

  const logged = useMemo(
    () => new Set(
      wellbeingSince(dates[0])
        .filter((w) => w.sleep_start || w.sleep_end || w.sleep_quality != null)
        .map((w) => w.date),
    ),
    [dates, version],
  )

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl border-t border-ink-700 bg-ink-900 p-4 pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[17px] text-cream">Sleep</span>
          <button className="text-sm text-ink-400 hover:text-cream" onClick={onClose}>
            Done
          </button>
        </div>
        <div className="label mb-1">Day</div>
        <DayStrip dates={dates} selected={date} onSelect={setDate} marked={logged} />
        <div className="mt-3">
          <SleepCard
            key={date}
            date={date}
            onChanged={() => {
              setVersion((v) => v + 1)
              onChanged()
            }}
          />
        </div>
      </div>
    </div>
  )
}
