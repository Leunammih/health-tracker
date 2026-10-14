import { todayISO, fmtDay } from '../lib/dates'
import { useWorkingDay } from '../lib/workingDay'

// Shown on Log and Meals whenever the working day isn't today. The day now stays
// put after saving, which makes the opposite mistake possible — still being on
// Tuesday on Wednesday morning — so it has to be impossible to miss.
export default function WorkingDayBar() {
  const [day, setDay] = useWorkingDay()
  if (day === todayISO()) return null
  return (
    <div className="warn-box flex items-center justify-between gap-3">
      <span>
        Logging for <strong>{fmtDay(day)}</strong> — not today
      </span>
      <button type="button" className="shrink-0 underline" onClick={() => setDay(todayISO())}>
        Back to today
      </button>
    </div>
  )
}
