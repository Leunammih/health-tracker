import { useState } from 'react'
import TimeWheelSheet from './TimeWheelSheet'

// The trigger for the time wheel: a field-shaped button showing the current
// 'HH:MM'. One tap opens TimeWheelSheet, where hours and minutes are two wheels
// side by side — see that file for why this isn't <input type="time">.
//
// Value in and out is the same 'HH:MM' string the original <input type="time">
// used, so sleepDurationMin() and upsertSleep() never had to change.
export default function TimePicker5({
  value,
  onChange,
  ariaLabel,
}: {
  value: string
  onChange: (next: string) => void
  ariaLabel: string
}) {
  const [open, setOpen] = useState(false)
  const valid = /^\d{2}:\d{2}$/.test(value.trim())

  return (
    <>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="field !w-auto min-w-[5.5rem] text-center font-serif text-xl tabular-nums"
      >
        {valid ? value : '--:--'}
      </button>
      {open && (
        <TimeWheelSheet
          value={valid ? value : '00:00'}
          title={ariaLabel}
          onCommit={(next) => { onChange(next); setOpen(false) }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
