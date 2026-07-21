# UI baseline — pre-redesign functional contract

Captured on branch `redesign/ui`, viewport 390×844 (iPhone 14 Pro), dev server
`localhost:5199`, running the **real synced database** from
`~/Dropbox/Apps/Health Tracker private/health.db` (143 KB, 18 entries, 45 tracks,
9 meals, 10 gut events, 2 infections; data spans 2026-07-08 → 2026-07-20).

Loaded read-only by copying the file to `public/` and writing the bytes into
IndexedDB (`ht-store` / `blobs` / `health.db`), then deleting the copy. The Dropbox
original was never modified. `*.db` is gitignored — real health data must never be
committed.

This is the regression checklist. After the redesign, every control listed here must
still exist and still work. Anything missing is a bug, not a design decision.

## Global chrome
- Header: tab title (left), `SyncBadge` "Sync off" + dot (right), tappable → "Tap to sync now"
- Amber banner: "Add your Anthropic API key in Settings…" → jumps to Settings.
  **Sticky** — it overlaps scrolled content on every tab (visible in all screenshots)
- Bottom tab bar, 5 items: Log · Meals · Insights · Patterns · Settings
- Active tab = brand teal (icon + label); inactive = ink-400
- Safe-area padding top and bottom

## Log
- **RECOVERY CHECK-IN card** (teal heading) — appears only when a recent activity is
  awaiting follow-up. "How did these feel in the days after? (Soreness usually shows up
  a day or two later.)" → per-activity row (`strength · 5m · Jul 20`), free-text field,
  "Save" + "No issues" buttons. **This is the app's core PEM/delayed-soreness feature
  and it only renders with real data.**
- "Dictate or type your day" card
- LOGGING FOR + 7-day `DayStrip`, selected = filled teal pill, dots under days with data
- Native date input + "or swipe the strip above"
- "This covers more than one day" checkbox
- Free-text textarea, "Process with Claude" primary button, explainer
- QUICK ENTRY: per-metric rows (dot, label, saved state, value + unit, slider,
  "Add note", "Save")

## Meals
- "Photograph a meal" primary / "Dictate a meal" ghost / explainer
- RECENT MEALS rows: title, date + photo glyph, kcal, macro line (P/F/C/Fb), Edit, Delete

## Insights
- Range chips 14d / 30d / 90d
- TAP TO LOG grid — **21 items with real data**, not the 17 in the registry.
  Unregistered names arriving from dictation ("Muscle Soreness", "Muscle Stiffness",
  "Shaking") get appended with fallback colours. The grid grows without bound.
- Stat tiles: Gut episodes (10) · Infections (2) · Warming bottle (2)
- ENERGY & MOOD — dual series, legend below
- STRESS LOAD — reversed axis, caption "low is good — high stress sits at the bottom"
- ILLNESS & GUT — reversed, dashed threshold line, scatter dots, infection step-line,
  caption "infection level carries forward until you log it gone"
- MOVEMENT & EXERCISE (MIN) — "tap a day to log it", 4 series, legend
- MEDITATION & BREATH WORK (MIN) — 3 series
- PAIN & DISCOMFORT (0-10) — reversed, caption "low is good — worse pain sits at the bottom"

## Patterns
- Explainer card, range `<select>`, "Analyse now" button
- Stored interpretation: header line (`Jul 18 · last 14 days`, model id), then a long
  markdown report — PATTERNS / correlations / period_covered sections

## Settings
- CLAUDE API: key field, "Stored only on this device.", model select
- DROPBOX SYNC: setup steps incl. **redirect URI `http://localhost:5199/`** — the dev
  port is load-bearing, do not change it
- Dropbox app key field, "Connect Dropbox", "Save settings"

## Bugs the real data exposed (fix separately from the redesign)

1. **Patterns renders raw markup.** `**bold**` shows as literal asterisks, and prompt
   scaffold XML leaks into the UI verbatim: `</correlations>`, `<period_covered">…`.
   Needs a markdown renderer + tag stripping.
2. **"Breath work" is duplicated** in the TAP TO LOG grid — appears twice, same label,
   same colour. Registry entry and a DB track name are not deduping.
3. **Missing days are drawn as zero.** Movement/meditation charts render a flat 0 line
   back to the range start, so "no data" is indistinguishable from "did nothing" —
   and on a sick day those mean opposite things.
4. **Charts waste ~55% of width.** 30d range against 13 days of data leaves Jun 21–Jul 8
   empty. No empty-range handling or auto-fit.
5. **Identical hex collision**: stretching and wrist pain are both `#f97316`. Four reds
   (`#ef4444` / `#e66767` / `#fb7185` / `#d55181`) are mutually indistinguishable.
6. **Meal rows blow up** — real titles wrap to 4 lines ("Homemade Nut & Seed Cereal with
   Rice Milk"), pushing rows past 200 px; only ~3.5 fit per screen.
7. Legend "(min)" orphans onto its own line in the movement chart.
