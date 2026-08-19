import { useEffect, useMemo, useRef, useState } from 'react'
import { resolveBarcodeFood } from '../lib/barcodeFood'
import { scanBarcode } from '../lib/barcodeScan'
import { describeFoods } from '../ai/anthropic'
import { allFoods, insertFood } from '../db/queries'
import type { Food } from '../types'

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

type Phase = 'scan' | 'looking-up' | 'result' | 'not-found' | 'describing'

// Bottom sheet for the barcode feature — copies FoodPickerSheet's wrapper so it
// reads as the same UI family. Four ways to get here: a live camera decode
// loop, a still photo through the same <input capture> pattern the rest of the
// app already uses, typing the number by hand, or — since every scanned
// product is just a normal `foods` row with a barcode set — searching by name
// for one you've already scanned, no rescan needed. Returns { food, grams } —
// grams is collected here so every caller gets a fully-specified item, not
// just a Food row.
export default function BarcodeScanSheet({
  onScanned,
  onClose,
}: {
  onScanned: (item: { food: Food; grams: number }) => void
  onClose: () => void
}) {
  const [phase, setPhase] = useState<Phase>('scan')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [manualCode, setManualCode] = useState('')
  const [savedSearch, setSavedSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notFoundCode, setNotFoundCode] = useState<string | null>(null)
  const [describeName, setDescribeName] = useState('')
  const [food, setFood] = useState<Food | null>(null)
  const [grams, setGrams] = useState(100)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Any food with a barcode has been through this flow before (Open Food Facts
  // or the "describe it instead" fallback both set one) — searching here means
  // never re-scanning something you've already added once.
  const savedMatches = useMemo(() => {
    const q = savedSearch.trim().toLowerCase()
    if (!q) return []
    return allFoods()
      .filter((f) => f.barcode && f.name.toLowerCase().includes(q))
      .slice(0, 8)
  }, [savedSearch])

  // Camera lifecycle: request on mount, stop every track on unmount or on a
  // successful decode — an orphaned track keeps the OS camera indicator lit.
  useEffect(() => {
    if (phase !== 'scan') return
    let cancelled = false
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' } } })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        setStream(s)
        if (videoRef.current) videoRef.current.srcObject = s
      })
      .catch((e) => setCameraError(msg(e)))
    return () => {
      cancelled = true
    }
  }, [phase])

  useEffect(() => {
    return () => {
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [stream])

  // Decode loop, throttled to ~5 Hz — decoding every animation frame is pure
  // waste and drains battery for no accuracy gain. `decoding` guards against a
  // slow decode overlapping the next tick.
  useEffect(() => {
    if (!stream || phase !== 'scan') return
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    let raf = 0
    let lastTick = 0
    let decoding = false
    let cancelled = false
    function tick(ts: number) {
      if (cancelled) return
      const video = videoRef.current
      if (video && ctx && !decoding && video.readyState >= 2 && ts - lastTick > 200) {
        lastTick = ts
        decoding = true
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        ctx.drawImage(video, 0, 0)
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        scanBarcode(imageData)
          .then((code) => {
            decoding = false
            if (!cancelled && code) void handleScanned(code)
          })
          .catch(() => {
            decoding = false
          })
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream, phase])

  async function handleScanned(code: string) {
    setPhase('looking-up')
    stream?.getTracks().forEach((t) => t.stop())
    setStream(null)
    setError(null)
    try {
      const result = await resolveBarcodeFood(code)
      if (result.status === 'found') {
        setFood(result.food)
        setGrams(result.food.serving_g ?? 100)
        setPhase('result')
      } else {
        setNotFoundCode(code)
        setPhase('not-found')
      }
    } catch (e) {
      setError(msg(e))
      setPhase('scan')
    }
  }

  async function onPhotoFallback(file: File) {
    setError(null)
    const code = await scanBarcode(file).catch((e) => {
      setError(msg(e))
      return null
    })
    if (code) void handleScanned(code)
    else setError("Couldn't find a barcode in that photo — try again, or type the number below.")
  }

  function submitManual() {
    const trimmed = manualCode.trim()
    if (!/^\d{6,14}$/.test(trimmed)) {
      setError('That doesn’t look like a barcode number.')
      return
    }
    void handleScanned(trimmed)
  }

  // Returning to the live-scan phase after a result or a not-found — without
  // clearing manualCode too, a stale typed number sits in the field and the next
  // attempt appends onto it instead of starting fresh.
  function resetToScan() {
    setManualCode('')
    setSavedSearch('')
    setError(null)
    setPhase('scan')
  }

  // Picking a name-search match skips the lookup entirely — it's the exact
  // same confirm step a fresh scan lands on, just without the network call.
  function pickSaved(f: Food) {
    setFood(f)
    setGrams(f.serving_g ?? 100)
    setPhase('result')
  }

  // Not-found fallback: the same AI-description path NewIngredientField already
  // uses for a genuinely new ingredient (describeFoods -> insertFood). The
  // barcode is still stored, so a re-scan of this product hits the local index
  // next time instead of asking Open Food Facts again.
  async function describeAndInsert() {
    const trimmed = describeName.trim()
    if (!trimmed || !notFoundCode) return
    setPhase('describing')
    setError(null)
    try {
      const [profile] = await describeFoods([trimmed])
      if (!profile) throw new Error("Couldn't look that ingredient up — try rephrasing it.")
      const created = await insertFood({
        name: profile.name || trimmed,
        kcal_100g: profile.kcal_100g,
        protein_100g: profile.protein_100g,
        fat_100g: profile.fat_100g,
        carbs_100g: profile.carbs_100g,
        fiber_100g: profile.fiber_100g,
        serving_g: profile.serving_g,
        serving_label: profile.serving_label,
        food_groups: JSON.stringify(profile.food_groups),
        brand: profile.brand ?? null,
        barcode: notFoundCode,
        source: 'claude',
        seed_count: 0,
        seed_slots: null,
        seed_last_used: null,
        archived: 0,
      })
      setFood(created)
      setGrams(created.serving_g ?? 100)
      setPhase('result')
    } catch (e) {
      setError(msg(e))
      setPhase('not-found')
    }
  }

  function confirm() {
    if (!food || grams <= 0) return
    onScanned({ food, grams })
  }

  const kcalForGrams = food?.kcal_100g != null ? Math.round((food.kcal_100g * grams) / 100) : null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl border-t border-ink-700 bg-ink-900 p-4 pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[17px] text-cream">Scan a barcode</span>
          <button className="text-sm text-ink-400 hover:text-cream" onClick={onClose}>
            Close
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        {phase === 'scan' && (
          <div className="space-y-3">
            <div>
              <input
                className="field"
                placeholder="Search a product you've already scanned…"
                value={savedSearch}
                onChange={(e) => setSavedSearch(e.target.value)}
              />
              {savedMatches.length > 0 && (
                <div className="mt-1.5 space-y-1">
                  {savedMatches.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      className="flex w-full items-center justify-between gap-2 rounded-lg bg-ink-800 px-3 py-2 text-left"
                      onClick={() => pickSaved(f)}
                    >
                      <span className="truncate text-sm text-cream">
                        {f.name}
                        {f.brand ? ` (${f.brand})` : ''}
                      </span>
                      <span className="shrink-0 text-xs text-ink-400">
                        {f.kcal_100g != null ? `${Math.round(f.kcal_100g)} kcal/100g` : ''}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="text-center text-xs text-ink-400">or scan a new one —</p>

            {cameraError ? (
              <p className="rounded-lg bg-ink-800 px-3 py-2 text-xs text-ink-400">
                Camera unavailable ({cameraError}). Use a photo or type the number below instead.
              </p>
            ) : (
              <div className="overflow-hidden rounded-xl bg-black">
                {/* playsInline is required or iOS takes the video fullscreen. */}
                <video ref={videoRef} autoPlay playsInline muted className="aspect-[4/3] w-full object-cover" />
              </div>
            )}
            <p className="text-center text-xs text-ink-400">Point the camera at the barcode.</p>

            <label className="btn-ghost block w-full cursor-pointer text-center !py-2 text-sm">
              Scan from a photo instead
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void onPhotoFallback(file)
                  e.target.value = ''
                }}
              />
            </label>

            <div className="flex gap-2">
              <input
                className="field flex-1"
                inputMode="numeric"
                placeholder="Or type the barcode number…"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitManual()
                }}
              />
              <button className="btn-ghost shrink-0" disabled={!manualCode.trim()} onClick={submitManual}>
                Look up
              </button>
            </div>
          </div>
        )}

        {phase === 'looking-up' && <p className="py-6 text-center text-sm text-ink-400">Looking it up…</p>}

        {phase === 'not-found' && (
          <div className="space-y-3">
            <p className="text-sm text-ink-300">
              No match on Open Food Facts for <span className="text-cream">{notFoundCode}</span>.
            </p>
            <div className="flex gap-2">
              <input
                className="field flex-1"
                placeholder="Describe it instead, e.g. “oat milk, barista”"
                value={describeName}
                onChange={(e) => setDescribeName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void describeAndInsert()
                }}
              />
              <button className="btn-primary shrink-0" disabled={!describeName.trim()} onClick={() => void describeAndInsert()}>
                Add
              </button>
            </div>
            <button className="btn-ghost w-full !py-1.5 text-sm" onClick={resetToScan}>
              Try scanning again
            </button>
          </div>
        )}

        {phase === 'describing' && <p className="py-6 text-center text-sm text-ink-400">Looking that up…</p>}

        {phase === 'result' && food && (
          <div className="space-y-3">
            <div className="rounded-xl bg-ink-800 p-3">
              <div className="text-sm text-cream">{food.name}</div>
              {food.brand && <div className="text-xs text-ink-400">{food.brand}</div>}
              <div className="mt-1 text-xs text-ink-400">
                {food.kcal_100g != null ? `${Math.round(food.kcal_100g)} kcal/100g` : 'no numbers yet'}
              </div>
            </div>
            <div>
              <label className="label">Grams</label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  inputMode="decimal"
                  className="field w-28"
                  value={grams}
                  onChange={(e) => setGrams(Number(e.target.value))}
                />
                {kcalForGrams != null && <span className="text-sm text-ink-400">= {kcalForGrams} kcal</span>}
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn-primary flex-1" disabled={grams <= 0} onClick={confirm}>
                Add
              </button>
              <button className="btn-ghost" onClick={resetToScan}>
                Scan another
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
