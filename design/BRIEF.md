# Redesign brief — Health Tracker PWA

## What this app is

A private, single-user, iPhone-first PWA for tracking activities, muscle aches, gut
episodes, infections, energy/mood and nutrition. It exists to answer real open health
questions — chiefly delayed-soreness / PEM timing after exertion.

## Who uses it, and in what state

One person. Often **while feeling unwell** — during a gut episode, an infection, or
post-exertional crash. That single fact should drive the aesthetic more than any trend:

- Logging must survive low energy, low patience and shaky hands. Big targets, few taps,
  no dexterity-dependent gestures as the *only* path to an action.
- Nothing celebratory, gamified, or streak-shaming. A missed day is often a sick day.
  The UI must never make illness feel like failure.
- It is used in bed, at night, one-handed. Dark-first is correct; controls belong in
  the lower half of the screen.
- This is not a fitness app. Restraint over energy; calm over motivating.

## Locked constraints — the redesign may not break these

1. **Good is always at the top.** Metrics where low is good (pain, stress, illness,
   release) render on a reversed Y axis. Locked 2026-07-21. See `src/lib/metrics.ts`.
2. **Series identity, never rank.** A given activity keeps the same hue in every chart.
3. **Dev port 5199 is load-bearing** — it is the registered Dropbox OAuth redirect URI.
4. iOS specifics: `font-size: 16px` on inputs (prevents zoom-on-focus), safe-area
   padding, `overscroll-behavior-y: none`.
5. Everything stays client-side. No new network dependency, no webfont CDN — a webfont
   must be self-hosted or it breaks the offline PWA guarantee.
6. Every control in `BASELINE.md` must survive.

## Current state

Dark-only. Teal `brand` + blue-grey `ink` scales in `tailwind.config.js`. A semantic
component layer already exists in `src/index.css`: `.card`, `.btn` / `.btn-primary` /
`.btn-ghost`, `.field`, `.label`, `.chip`.

That layer is the leverage point — roughly 70% of a visual overhaul can happen in those
two files without opening a single `.tsx`.

## Known problems worth fixing

- **17 categorical chart colours.** Well past the ~8 a reader can actually tell apart,
  and several already collide on a dark surface (`#f97316` stretching vs `#f97316`
  wrist pain are *identical*; `#ef4444` / `#e66767` / `#fb7185` / `#d55181` are four
  near-indistinguishable reds). Needs a grouped palette strategy: hue by group
  (movement / practice / symptom / wellbeing), value within group.
- **Colour is coupled to logic.** `TrackDef.color` sits in the same record as `match`
  regexes, units and `lowerIsBetter`. Extract colour into a separate presentation
  module *before* restyling, so palette changes never touch matching logic.
- Dense Insights tab: 17-item tap grid + stat tiles + 4 charts on one scroll.
- No light mode. Decide before the token pass — cheap now, expensive later.
- Nothing distinguishes "no data" from "a value of zero" — meaningful for a sick day.

## Deliverable wanted from Claude Design

A component library covering the primitives below, dark-first, judged on one canvas:

Type scale · colour tokens (surface/ink/brand/semantic) · elevation · `.card` ·
buttons (primary/ghost/destructive, incl. disabled) · text field · select · slider row
(the quick-entry unit: dot + label + value + slider + Add note + Save) · chip /
segmented range selector · day strip · stat tile · list row with Edit/Delete ·
tab bar · banner/callout · empty state · chart frame (axes, gridlines, legend,
tooltip) + the grouped series palette.

## Sequencing

1. `redesign/ui` branch, baseline captured — **done**
2. Extract `TrackDef.color` → presentation module (no visual change, own commit)
3. Component library → Claude Design → iterate on the canvas
4. Apply resulting tokens to `tailwind.config.js` + `src/index.css`, re-screenshot
5. Per-tab passes, **one commit per tab, styling-only diffs**
6. Diff against `BASELINE.md`, then merge to main
