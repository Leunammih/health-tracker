import { useMemo, useState } from 'react'
import DayStrip from './DayStrip'
import { applyMove, planMove, type Choice, type Clash } from '../db/moveDay'
import { loggedDates } from '../db/queries'
import { dateSpine, daysAgoISO, fmtDay, todayISO } from '../lib/dates'

const STRIP_DAYS = 60

// Move a day's logs to another date. Everything on the day is ticked; untick
// whatever really did belong there. If the target day already has something in
// the same slot, nothing moves until he's said what to do about each clash —
// there is no silent default, because either guess loses real data.
export default function MoveDaySheet({
  from,
  onMoved,
  onClose,
}: {
  from: string
  onMoved: (result: { to: string; moved: number; kept: number; snapshot: Uint8Array }) => void
  onClose: () => void
}) {
  const [to, setTo] = useState<string | null>(null)
  const [unticked, setUnticked] = useState<Set<string>>(new Set())
  const [choices, setChoices] = useState<Record<string, Choice>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const strip = useMemo(() => dateSpine(daysAgoISO(STRIP_DAYS)), [])
  const marked = useMemo(() => loggedDates(daysAgoISO(STRIP_DAYS)), [])
  // Planned against the chosen target so clashes are known; against `from`
  // itself (no clashes possible) until one is picked, to list what's there.
  const plan = useMemo(() => planMove(from, to && to !== from ? to : from), [from, to])
  const target = to && to !== from ? to : null

  const allItems = plan.groups.flatMap((g) => g.items)
  const selected = allItems.filter((i) => !unticked.has(i.key))
  const activeClashes: Clash[] = target
    ? [...new Set(selected.map((i) => i.clashKey).filter((k): k is string => !!k))].map((k) => plan.clashes[k])
    : []
  const unanswered = activeClashes.filter((c) => !choices[c.key]).length
  const canMove = !!target && selected.length > 0 && unanswered === 0 && !busy

  function toggle(key: string) {
    setUnticked((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function setAll(choice: Choice) {
    setChoices((prev) => {
      const next = { ...prev }
      for (const c of activeClashes) if (c.options.includes(choice)) next[c.key] = choice
      return next
    })
  }

  async function move() {
    if (!target) return
    setBusy(true)
    setError(null)
    try {
      const res = await applyMove(from, target, new Set(selected.map((i) => i.key)), choices)
      onMoved({ to: target, ...res, kept: selected.length - res.moved })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto rounded-t-2xl border-t border-ink-700 bg-ink-900 p-4 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="text-[17px] text-cream">Move {fmtDay(from)}'s logs</span>
          <button className="text-sm text-ink-400 hover:text-cream" onClick={onClose}>
            Cancel
          </button>
        </div>

        {allItems.length === 0 ? (
          <p className="text-sm text-ink-300">Nothing is logged on {fmtDay(from)} yet — there's nothing to move.</p>
        ) : (
          <>
            <div>
              <label className="label">Move to</label>
              <DayStrip dates={strip} selected={to ?? ''} onSelect={(d) => { setTo(d); setChoices({}) }} marked={marked} />
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="date"
                  className="field !w-auto"
                  value={to ?? ''}
                  max={todayISO()}
                  onChange={(e) => { setTo(e.target.value || null); setChoices({}) }}
                />
                <span className="text-xs text-ink-500">
                  {to === from ? 'That’s the same day — pick another.' : to ? fmtDay(to) : 'Pick a day'}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="label !mb-0">What moves — untick anything that belongs on {fmtDay(from)}</div>
              {plan.groups.map((g) => (
                <div key={g.title}>
                  <div className="mb-1 text-[11px] uppercase tracking-wide text-ink-500">{g.title}</div>
                  <div className="space-y-1">
                    {g.items.map((i) => (
                      <label key={i.key} className="flex items-start gap-2 text-sm text-ink-200">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 shrink-0 rounded accent-brand-500"
                          checked={!unticked.has(i.key)}
                          onChange={() => toggle(i.key)}
                        />
                        <span className="min-w-0 flex-1 break-words">{i.label}</span>
                        {target && i.clashKey && !unticked.has(i.key) && (
                          <span className="warn-chip shrink-0">clash</span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {activeClashes.length > 0 && target && (
              <div className="space-y-3 rounded-xl p-3" style={{ border: '1px solid rgb(var(--warn-rgb) / 0.45)' }}>
                <div>
                  <div className="text-sm text-cream">{fmtDay(target)} already has some of this</div>
                  <p className="mt-1 text-xs text-ink-400">
                    Say what to do with each. <strong className="text-ink-300">Keep existing</strong> leaves
                    yours on {fmtDay(from)} — nothing is deleted unless you pick Replace.
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <span className="self-center text-xs text-ink-500">All:</span>
                  <button type="button" className="chip" onClick={() => setAll('replace')}>Replace</button>
                  <button type="button" className="chip" onClick={() => setAll('keep')}>Keep existing</button>
                  <button type="button" className="chip" onClick={() => setAll('merge')}>Merge where possible</button>
                </div>
                {activeClashes.map((c) => (
                  <ClashRow key={c.key} clash={c} choice={choices[c.key]} from={from} target={target}
                    onChoose={(ch) => setChoices((prev) => ({ ...prev, [c.key]: ch }))} />
                ))}
              </div>
            )}

            {error && <p className="text-sm text-red-300">{error}</p>}

            <button className="btn-primary w-full" disabled={!canMove} onClick={() => void move()}>
              {!target
                ? 'Pick a day to move to'
                : unanswered
                  ? `Answer ${unanswered} clash${unanswered === 1 ? '' : 'es'} first`
                  : `Move ${selected.length} item${selected.length === 1 ? '' : 's'} to ${fmtDay(target)}`}
            </button>
            <p className="text-xs text-ink-400">
              You can undo straight afterwards. Supplement start/stop dates stay as they are — only
              the day's skips move.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

const CHOICE_LABEL: Record<Choice, string> = { replace: 'Replace', keep: 'Keep existing', merge: 'Merge' }

function ClashRow({
  clash,
  choice,
  from,
  target,
  onChoose,
}: {
  clash: Clash
  choice: Choice | undefined
  from: string
  target: string
  onChoose: (c: Choice) => void
}) {
  const explain: Record<Choice, string> = clash.repeatable
    ? {
        merge: `Both sets end up on ${fmtDay(target)}.`,
        replace: `${fmtDay(target)}'s ${clash.label.toLowerCase()} are deleted, yours take their place.`,
        keep: `${fmtDay(target)}'s stay; yours stay on ${fmtDay(from)}.`,
      }
    : {
        merge: clash.mergeHint ? `Merge ${clash.mergeHint}.` : '',
        replace: `${fmtDay(target)}'s value is deleted, yours takes its place.`,
        keep: `${fmtDay(target)}'s stays; yours stays on ${fmtDay(from)}.`,
      }
  return (
    <div className="space-y-1.5 border-t border-ink-700 pt-2">
      <div className="text-sm text-ink-200">{clash.label}</div>
      <div className="break-words text-xs text-ink-400">Already there: {clash.existing}</div>
      <div className="flex flex-wrap gap-1.5">
        {clash.options.map((o) => (
          <button key={o} type="button" className={choice === o ? 'chip-on' : 'chip'} onClick={() => onChoose(o)}>
            {clash.repeatable && o === 'merge' ? 'Keep both' : CHOICE_LABEL[o]}
          </button>
        ))}
      </div>
      {choice && <div className="text-xs text-ink-400">{explain[choice]}</div>}
    </div>
  )
}
