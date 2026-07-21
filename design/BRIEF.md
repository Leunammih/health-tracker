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

Validated against the **real synced database** (13 days of actual logs), not seed data.
The seed data hid most of these.

- **The palette is already broken.** Stretching and wrist pain share an identical hex
  (`#f97316`); `#ef4444` / `#e66767` / `#fb7185` / `#d55181` are four indistinguishable
  reds. Needs a grouped strategy: hue by group (movement / practice / symptom /
  wellbeing), value within group.
- **The metric list is open-ended, not fixed at 17.** Dictation invents names —
  "Muscle Soreness", "Muscle Stiffness", "Shaking" all arrived from real entries and got
  appended with fallback colours, taking the tap grid to 21. The design must survive an
  unbounded, user-generated metric list. A fixed 17-swatch palette will not do; it needs
  a deterministic name→colour function within each group's hue family.
- **Colour is coupled to logic.** `TrackDef.color` sits in the same record as `match`
  regexes, units and `lowerIsBetter`. Extract colour into a separate presentation
  module *before* restyling, so palette changes never touch matching logic.
- **Charts are mostly empty space.** A 30d range against 13 days of data leaves ~55% of
  every chart blank. Needs empty-range handling, or auto-fit to the data span.
- **"No data" is drawn as zero**, so a sick day with nothing logged looks identical to a
  day of deliberate rest. These mean opposite things and must look different.
- **Real content breaks the layouts.** Meal titles wrap to 4 lines and blow rows past
  200 px. The Patterns report is a long-form markdown document — an unstyled wall of
  grey text, unreadable while unwell. Prose/report typography is a first-class surface
  here, not an afterthought.
- The amber API-key banner is sticky and overlaps scrolled content on every tab.
- Dense Insights tab: 21-item tap grid + stat tiles + 6 charts on one scroll.
- No light mode. Decide before the token pass — cheap now, expensive later.

## Deliverable wanted from Claude Design

A component library covering the primitives below, dark-first, judged on one canvas:

Type scale · colour tokens (surface/ink/brand/semantic) · elevation · `.card` ·
buttons (primary/ghost/destructive, incl. disabled) · text field · select · slider row
(the quick-entry unit: dot + label + value + slider + Add note + Save) · chip /
segmented range selector · day strip · stat tile · list row with Edit/Delete
(**must hold a 4-line wrapping title**) · tab bar · banner/callout · empty state ·
**recovery check-in card** (prompt + per-activity row + Save / No issues) ·
**long-form report typography** (headings, bold, bullets, metadata line) ·
chart frame (axes, gridlines, legend, tooltip) + the grouped series palette +
an explicit **no-data vs zero** treatment.

## Sequencing

1. `redesign/ui` branch, baseline captured — **done**
2. Extract `TrackDef.color` → presentation module (no visual change, own commit)
3. Component library → Claude Design → iterate on the canvas
4. Apply resulting tokens to `tailwind.config.js` + `src/index.css`, re-screenshot
5. Per-tab passes, **one commit per tab, styling-only diffs**
6. Diff against `BASELINE.md`, then merge to main
