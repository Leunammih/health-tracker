# STATUS

Quick-start context for a fresh session. Full roadmap: `docs/PLAN.md`. Change log: `docs/DEVLOG.md`.

_Last updated: 2026-07-29_

## What this is
Private iPhone-first PWA (Vite + React + TS + Tailwind), no backend. Local SQLite (sql.js)
in IndexedDB, Claude API called from the browser, **Dropbox** sync (OAuth PKCE).
Live: https://leunammih.github.io/health-tracker/ — pushing to `main` auto-deploys.

## Done ✅
- **Phase A** — storage-location panel, Log Q&A improvements, meal inline editing, delayed soreness.
- **Dropbox sync** — replaced Nextcloud. Code complete + verified with a mocked API.
- **Phase B** — B1 generic `tracks` table + weight + Insights charts; B2 next-day soreness
  check-ins; B3 tap-to-view/edit a saved entry.
- **Phase C1** — bulk/range track entry by dictation (`recurrence`/`dates[]` on a track item,
  expanded by `expandDateRange`/`weekdayNums`).
- **Phase C2** — Insights meditation/movement/pain multi-line charts with tap-to-detail;
  `tracks` gained a `time` column (schema **v4**).
- **Meals: dictated entries + edit** — "Dictate a meal" alongside photos; `meals` gained
  `source`/`notes` columns (schema **v5**); Edit button on saved meals.
- **Phase D (D1–D4) — Insights/Logs/Meals overhaul**, all verified in-browser:
  - **D1 foundation** — `src/lib/metrics.ts` is the single source of truth for track
    colour/label/axis-polarity/slider-scale; `dateSpine()` for a shared X axis; `release`
    added as a track category; quick-log query primitives (`upsertTrackValue`,
    `trackValueOn`, `lastTrackValueOnOrBefore`, `allTrackNames`, `loggedDates`).
  - **D2 Insights** — rounded-plateau movement/exercise chart (hand-rolled SVG, one
    colour per activity, continuous 0-baseline); tap-any-item `QuickLogSheet` (day
    strip + slider + apply-to-last-N-days); illness chart (infection severity carried
    forward until logged gone, + gut pain + Bristol stool); every "low is good" metric
    (pain, stress, illness, release) on a reversed axis; every chart on one shared
    `dateSpine`.
  - **D3 Logs** — swipeable `DayStrip` for the entry date; "this covers more than one
    day" toggle (`multiDay` → `extractDiary`/prompt splits into per-day records instead
    of defaulting to one date); `QuickEntryPanel` — last 7 days' tracked items grouped
    by category, each a slider defaulting to the last saved value, debounced writes.
  - **D4 Meals** — "this is more than one meal" toggle; new `record_meals` tool +
    `analyseMealsText` splits a dictation on breakfast/lunch/dinner/snack (and day
    words) into several meals, each independently dated/timed; editable review list,
    save-all.
  - No schema migration in the D-phase itself. Recharts note: its line-draw animation
    stalls at frame 1 under React 18 StrictMode — `isAnimationActive={false}` is
    required on every `Line`/`Bar`.
- **Quick entry rework (2026-07-21)** — fixed sliders resetting each other (a panel-wide
  refresh counter reset every row on any save; plus count-based ordering reshuffled rows).
  Draft state now lives in the panel, ordering is deterministic. Auto-save replaced by a
  per-row **Save** button plus **Save N changed**. Each entry can carry a **note**
  (also on the Insights tap-to-log sheet). **Energy and mood** are now quick entries —
  they live on the `wellbeing` table, reached via a `store` discriminator on `TrackDef`.
  Schema **v6** (`wellbeing.energy_notes`, `mood_notes`).

- **UI redesign (2026-07-25)** — MindBodyWorkFlow design system (Claude Design project
  `c7aa4381-…`) ported end to end, 13 commits (`e8d4bf4`..`b18450e`). Ink-teal/ember
  tokens as CSS custom properties in `src/index.css`, self-hosted Cormorant Garamond +
  Jost (`@fontsource`, no CDN). New `src/lib/palette.ts`: deterministic group-hue oklch
  colour rule (movement/practice/wellbeing/symptom/illness arcs), replacing every
  hand-authored hex in `metrics.ts` — also retired two forbidden brand hues and a
  colour collision. Added a real **light/parchment toggle** (`src/lib/theme.ts` +
  Settings, not originally in scope but requested) — every tab verified in both
  themes. `PlateauChart` gained a no-data-vs-zero dashed ring (BASELINE bug #3).
  4-line meal titles now wrap instead of truncating. Fixed the amber banner's
  scroll-overlap bug (BASELINE bug). Along the way, fixed two Tailwind
  colour-opacity/CSS-var bugs (legacy `rgba()` with space-separated vars; `@apply`-only
  opacity classes never generating) that would have silently broken translucent
  ember/ink tints app-wide. Full BASELINE.md checklist re-verified against seeded data
  in both themes before pushing.

- **Phase D gap-closing (2026-07-27)** — user dropped a large Phase D backlog plus a
  "verify these are implemented" list; three parallel Explore agents + direct file reads
  confirmed most of it already existed (multi-day toggle, Release category, plateau
  charts, tap-to-log sheet, good-at-top axes, shared date spine, infection carry-forward).
  Closed the real gaps found, verified each in-browser against seeded data:
  - **Meals** — Duplicate button (`duplicateMeal()` mirrors `startEditMeal()` but leaves
    `editingId` unset so `save()` inserts a new row); `meal_type` field end-to-end
    (schema **v7**: `meals.meal_type`, `MEAL_TOOL`/`MULTI_MEAL_TOOL` infer it, chip-row UI);
    meal time now shown in the recent list and editable on single-meal review; the
    re-estimate button now also fires on direct ingredient edits (`ingredientsDirty` flag),
    not just on extra-items/answer text.
  - **Logs** — new **Quick log** section in `QuickEntryPanel` (one-tap +5min per movement/
    practice item, writes straight to the DB via `upsertTrackValue`), separate from the
    existing "Add" slider-reveal row.
  - **Insights** — `infection` and `stool` (key reuses the existing palette colour) are now
    real `TrackDef`s, tap-loggable like every other metric via the existing `QuickLogSheet`;
    merged into the Illness & gut chart's carry-forward logic and excluded from the Pain
    chart so they don't render twice; the generic per-track fallback `TrackCard` now plots
    against the shared `spine` instead of only its own logged days.
  - Full details/rationale in the session's plan file if resuming this thread.

- **Phase D-2 (2026-07-28/29)** — the rest of the Phase D backlog plus a 10th item found
  by testing on a phone. Shipped as four separately-pushed phases, each verified
  in-browser in both themes against the existing populated DB before pushing.
  - **P1 foundation** — new `src/lib/metricStore.ts`: a single `{read, readLast, write,
    datesWithValue}` dispatch table over tracks/wellbeing/day_context, replacing five
    separate store branches that used to be split across `QuickEntryPanel` and
    `QuickLogSheet`. **Stress** is now a first-class quick-loggable metric
    (`day_context.stress_load` + its own `stress_notes` column, schema **v8**). Every
    Insights chart legend (Energy & mood, Illness & gut, Movement, Practice — Pain
    already worked) is now tap-to-log; "Gut pain" routes to the existing "stomach pain"
    metric. Added 3d/7d range chips. Fixed two real pre-existing bugs found along the
    way: `saveDiaryExtraction`'s `day_context` write was a destructive delete+insert
    that could wipe an earlier entry's stress/tasks/travel on a second diary save for
    the same date, and its `tracks` write was a bare INSERT that could leave duplicate
    rows for one (date, name) instead of replacing.
  - **P2 segments/sleep/events** — new **additive** `segment_values` table
    (date/segment/metric/value/notes, unique-indexed) for morning/afternoon/evening
    sub-day entries: writing a segment recomputes that day's rollup through the
    *existing* upserts, so every chart and read path stays untouched. Rollup rule
    (`rollupFor` in `metrics.ts`): minutes sum, 0-10/percent average, everything else
    (weight, Bristol stool) takes the last reading — averaging Bristol would silently
    read as "normal," which is wrong. `LogTab` gained a Morning/Afternoon/Evening/Whole
    day selector. **Sleep**: `wellbeing.sleep_start/sleep_end/sleep_quality`, duration
    computed (not stored) via `sleepDurationMin()` in `lib/dates.ts` (handles crossing
    midnight), new `SleepCard` + an Insights chart. **Single events**: new `events`
    table for one-off markers ("started magnesium"), `EventsCard` in Log, rendered as
    dashed `ReferenceLine`s on three Insights charts. Schema **v9**.
  - **P3 Home + Insights polish** — new Home tab (landing by default; `App.tsx`'s `Tab`
    union, 6-up nav) with a theme-aware MBWF emblem, the coaching hero image, and a
    yesterday-summary card built entirely from existing queries. Brand assets sourced
    from the MindBodyWorkFlow website repo, downscaled/recompressed via `sips` (512²
    PNG emblems → 256px, 3168×1344 JPEG heroes → 1200px) to ~50-125KB each before
    adding to the PWA's offline precache; `vite.config.ts`'s workbox `globPatterns`
    gained `jpg`. Insights got a faint tinted background image (a same-colour wash
    over the image, not plain opacity, so it reads as texture and never competes with
    the fully-opaque chart cards on top of it) and its "Tap to log" grid — previously
    the whole first screen — is now collapsed by default. Charts grouped under section
    labels (Wellbeing & sleep → Illness & gut → Movement & practice → Pain →
    Nutrition → Other).
  - **P4 Meals macro/food-group bars** — new `src/lib/foodGroups.ts`:
    `classifyMeal()` derives a vegan/dairy&eggs/meat(beef/chicken/fish/other) split
    from an ingredient list by keyword, equal-weighted per ingredient — the fallback
    for meals saved before this existed. New meals get a real per-meal estimate from
    Claude instead (`MEAL_TOOL`/`MULTI_MEAL_TOOL` both gained `food_groups`, schema
    **v10**: `meals.food_groups`, nullable JSON). Two 100%-stacked bars per day in
    Insights, side by side on the shared spine: macros by calorie share (4/4/9 kcal
    per g, independent of the meal's own `calories` field so it's exactly 100% by
    construction) and food-group source weighted by each meal's calories, meat
    sub-coloured by animal. A day with meals but nothing classifiable gets a flat grey
    "unclassified" segment instead of vanishing.
  - `design/BASELINE.md`'s regression checklist re-verified — nothing on it broke; the
    6-tab nav and 5 range chips are this round's intentional additions, not drift.

## Open / needs the user (not code)
- **Connect Dropbox (one-time):** register a Dropbox app — App Console → Create app →
  Scoped access → App folder → enable `files.content.read` + `files.content.write` →
  add Redirect URIs `https://leunammih.github.io/health-tracker/` **and**
  `http://localhost:5199/` → copy the **App key** → paste in the app's Settings → Dropbox
  sync → **Connect**. Until then sync is off (app still works locally; export/import is the manual fallback).
- **Try Phase D + D-2 on a phone** — the whole overhaul (plateau charts, tap-to-log
  sliders, day-strip swipe, multi-day/multi-meal toggles, time-of-day segments, sleep,
  single events, the Home tab, the macro/food-group bars) has only been verified with
  seeded data and DEV-only injection in the Browser pane, never against a live Claude
  call or a real touchscreen. In particular: does Claude reliably return sensible
  `food_groups` and `meal_type` values from a real photo/dictation, and does a real
  multi-day segment-entry session (log morning, then evening, on an actual phone) feel
  right.

## Not started — for new sessions
- **Phase C:** ~~(1) bulk/range entry~~ ✅; (2) calorie/protein goals + progress display —
  chosen as the next step, see "Exact next step" below for the full spec; (3) supplements.
- **Phase E:** eating-pattern quick-adds by time of day (client-side frequency over `meals`).

## Exact next step
Phase D and Phase D-2 (P1–P4) are both code-complete, pushed, and awaiting the user's
phone verification (see "Try Phase D + D-2 on a phone" above — not blocking, just not
yet confirmed). **Next up, chosen by the user (2026-07-29): Phase C item 2 — calorie/
protein daily goals + progress display.** Detailed enough to start straight from, no
re-exploration needed:

**Where goals should live — use the `meta` table, not localStorage.** The app already
has two persistence layers: `src/lib/storage.ts`'s `Settings` (localStorage, per-device,
holds API key/model/theme/Dropbox config — deliberately *not* synced) and the SQLite DB
itself (synced via Dropbox). Health goals belong with the synced data, not stuck on one
device. `src/db/schema.ts` already has a generic `meta(key TEXT PRIMARY KEY, value TEXT)`
table (currently only holds `schema_version`, written once in `src/db/sqlite.ts:103`
`INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)`). No new table needed — add
`getMeta(key)` / `setMeta(key, value)` helpers to `src/db/queries.ts` following the
existing `all`/`exec` helpers at the top of that file, and store e.g. `goal_calories` /
`goal_protein_g` as string-encoded numbers. `meta` is already in `TABLES`
(`schema.ts`) so it round-trips through export/Dropbox sync for free.

**Data already available.** `meals` (schema.ts) has `calories`, `protein_g` per row.
`mealsSince(dateISO)` (`src/db/queries.ts`) is the existing bulk reader; for "today"
specifically, filter its result to `date === todayISO()` (see the pattern already used
in `src/tabs/HomeTab.tsx`'s yesterday-summary `useMemo` — same filter-after-fetch idiom).

**UI — two places, both additive, no redesign needed:**
- **Settings** (`src/tabs/SettingsTab.tsx`): a small "Goals" card, two number inputs
  (daily calories, daily protein grams), save via `setMeta`. Mirror the existing
  Anthropic API key input's field styling in that file.
- **Progress display**: likely `src/tabs/NutritionTab.tsx` (top of the Meals tab, above
  "Recent meals" — a small stat/progress-bar card showing today's calories/protein sum
  vs. goal) and optionally `src/tabs/InsightsTab.tsx`'s "Daily calories" `ChartCard`
  (`InsightsTab.tsx`, search `Daily calories` — could add a `ReferenceLine` at the goal
  value, same `Recharts` import already in that file, same pattern as the existing
  `ReferenceLine y={4}` on the Illness & gut chart).

**Verify in-browser**: set goals in Settings, log a meal (or use `window.__ht.seed()` /
raw SQL via `window.__ht.run`/`all` for synthetic meals — see this session's Phase D-2
verification transcript for the exact devtools pattern), confirm progress updates and
survives a reload (i.e. actually persisted to `meta`, not just component state). Check
both themes. `npx tsc -b --noEmit && npm run build` before committing, per Dev hygiene
below.

**Still open after that, not yet started:** Phase C item 3 — supplements (start date,
composition via photo or name, periodic re-check reusing the B2 check-in queue pattern
in `src/db/queries.ts`'s `pendingCheckins`/`recordCheckin`). The Phase D-2 `events`
table (`date, kind, label, notes` — `src/db/queries.ts`'s `saveEvent`/`eventsSince`)
may already be a reasonable home for "started supplement X" markers — check before
building a parallel structure.

## Dev hygiene
After a schema change: `rm -rf node_modules/.vite` and, in the browser test tab,
`indexedDB.deleteDatabase('ht-store')` before re-testing. Always run
`npx tsc -b --noEmit && npm run build` before committing. DEV-only `window.__ht`
(`src/lib/devtools.ts`) can seed/wipe/run raw SQL against the live DB for
verification without spending API calls — confirmed stripped from production builds.
