import { useLayoutEffect, useRef } from 'react'

// Horizontal, thumb-swipeable strip of day chips. Used both for picking the date
// on the Log tab and for choosing which day a quick-log entry lands on.
// Dates are expected oldest → newest; the strip scrolls the selected day into view.
export default function DayStrip({
  dates,
  selected,
  onSelect,
  marked,
}: {
  dates: string[]
  selected: string
  onSelect: (date: string) => void
  marked?: Set<string> // days that already have something logged
}) {
  const ref = useRef<HTMLDivElement>(null)
  const selRef = useRef<HTMLButtonElement>(null)

  // Centre the selected chip. Set scrollLeft directly rather than using
  // scrollIntoView: inside a freshly mounted sheet that either no-ops or scrolls
  // the whole page instead of this container.
  useLayoutEffect(() => {
    const box = ref.current
    const chip = selRef.current
    if (!box || !chip) return
    box.scrollLeft = chip.offsetLeft - box.clientWidth / 2 + chip.clientWidth / 2
  }, [selected, dates.length])

  return (
    <div
      ref={ref}
      className="-mx-1 flex snap-x snap-mandatory gap-1.5 overflow-x-auto px-1 pb-1"
      style={{ scrollbarWidth: 'none' }}
    >
      {dates.map((d) => {
        const day = new Date(d + 'T00:00:00')
        const isSel = d === selected
        const has = marked?.has(d)
        return (
          <button
            key={d}
            ref={isSel ? selRef : undefined}
            onClick={() => onSelect(d)}
            className={`relative shrink-0 snap-center rounded-xl px-3 py-2 text-center transition ${
              isSel ? 'bg-brand-500 text-white' : 'bg-ink-800 text-ink-300 hover:bg-ink-700'
            }`}
          >
            <div className="text-[10px] uppercase opacity-70">
              {day.toLocaleDateString(undefined, { weekday: 'short' })}
            </div>
            <div className="text-sm font-semibold leading-tight">{day.getDate()}</div>
            {has && (
              <span
                className={`absolute inset-x-0 bottom-1 mx-auto h-1 w-1 rounded-full ${
                  isSel ? 'bg-white/80' : 'bg-brand-400'
                }`}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
