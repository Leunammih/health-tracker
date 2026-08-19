# STATUS

Quick-start context for a fresh session. Full roadmap: `docs/PLAN.md`. Change log: `docs/DEVLOG.md`.

_Last updated: 2026-08-12 (metric-scale fix: 0-10 intensities for ad-hoc tracks, supplements out of the sliders)_

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

- **Phase C-2 — calorie/protein goals (2026-07-29)** — daily nutrition goals, stored in
  the DB's existing `meta` table (no schema change, still **v10**) rather than
  localStorage: a health goal belongs to the synced data, not to one device. New
  `getMeta`/`setMeta` in `src/db/queries.ts` and `src/lib/goals.ts`
  (`loadGoals`/`saveGoals`/`totalsFor`; a value that's unparseable or ≤ 0 reads as
  "not set", so a stray write can't render a goal of 0). Both goals are independent —
  set one, both or neither, and every display drops the row it has no goal for.
  - **Settings** — "Daily nutrition goals" card with its own Save button, deliberately
    *below* the existing "Save settings" button since that one only writes localStorage.
  - **Meals** — `src/components/GoalProgress.tsx`: today's totals vs. goal as two
    labelled bars, read from `mealsSince(today)` (not the 10-row `recentMeals` list) on
    the same deps, so saving/editing/deleting a meal moves them immediately. Over-goal
    fills the bar in `--accent-deep` and says "N over" — deliberately *not* an amber
    warning colour, since exceeding a protein goal is good and exceeding calories
    usually isn't, and one colour can't mean both. With no goals set but meals logged,
    a one-line plain-text total points at Settings instead.
  - **Insights** — dashed `ReferenceLine` at the calorie goal on the Daily calories
    chart (`ifOverflow="extendDomain"`, so a goal above the tallest bar still shows),
    plus a caption naming the goal and counting days at or under it. The count runs over
    days that *have* meals logged, not the whole spine — an unlogged day is missing data,
    not a zero-calorie day. Recharts' own text label was dropped: at phone width it
    lands on top of the bars, so the caption carries it. The protein average tile gained
    an "of 120g" line.
  - `meta` was **not** in `schema.ts`'s `TABLES` (contrary to the previous session's note
    here) — added, so goals now appear in the JSON/CSV exports too. The `.db` export and
    Dropbox sync copy the whole file and always carried it; only those two generic
    per-table dumps were missing it. `TABLES` has no other consumer and `TableName` has
    none at all.
  - Verified in-browser in both themes against seeded data: set/clear/reload round-trip
    through `meta`, under-goal, over-goal, zero-meals, and calories-cleared-protein-kept.

- **Phase C-3 — supplements, + two fixes from phone testing (2026-07-29)** — schema **v11**.
  - **Fixes first.** (1) The Macros & food-groups tooltip rendered raw floats
    (`meat_beef : 14.017437961099933`) for all eleven series including the zeros, which
    on a phone covered the whole chart. Replaced with a custom `MealBarsTooltip`:
    one decimal, real labels, zero slices dropped, split under MACROS / FOOD GROUPS
    headings. Every other chart's `<Tooltip>` gained a `roundTip` formatter, since
    segment rollups (a day logged morning *and* evening averages the two) can produce
    the same long floats. (2) **Sleep picker** — `step={300}` for 5-minute increments,
    and an empty field prefilled to 23:00 (bedtime) / 09:00 (wake) **on focus**.
    Didn't survive real-device testing — see the correction below.
  - **Supplements** — new `supplements` table rather than reusing `events`: an
    `events` row is a one-off point-in-time marker with no lifecycle, and a regimen
    needs a start, an optional end, and a recurring check-in. Columns: `name`,
    `composition`, `photo_path`, `start_date`, `end_date` (null = still taking),
    `checkin_days`, `last_checkin`, `notes`. The two coexist — a supplement does *not*
    auto-create an event, so if you want the Insights reference line, add the event
    separately in the card above it.
  - **Check-in queue** reuses the B2 pattern exactly: `pendingSupplementCheckins()` is
    a query, not a stored due-date (`date(COALESCE(last_checkin, start_date), '+N days')
    <= today`), so editing `checkin_days` takes effect immediately;
    `recordSupplementCheckin` appends a dated note the way `recordCheckin` does, and
    "Nothing to add" just stamps `last_checkin` to requeue it a full interval later.
  - **UI** — `SupplementsCard` at the bottom of the Log tab (next to `EventsCard`, the
    same family of "things that started and stopped"), plus a due-check-in prompt at
    the top styled like the existing recovery check-in. The label photo is stored, not
    read: no Claude call — the composition field is typed. Wiring a vision call to read
    a supplement label is the obvious follow-up if typing it proves annoying.
  - `supplements` added to `TABLES` (exports), `counts()` (Settings → Data) and
    devtools' `wipe()`. No `runMigrations` entry needed: it's a new table, so
    `CREATE TABLE IF NOT EXISTS` in `SCHEMA_SQL` covers both fresh and existing DBs —
    only *columns added to an existing table* need an ALTER.

- **Phase C-3 fixes round (2026-07-30)** — three things found on a real phone within
  the C-3 build, all fixed same-day, no schema change (still v11).
  - **Sleep picker didn't work at all on-device**, despite passing in-browser
    verification via a genuine dispatched `focus` event. Root cause: iOS Safari
    snapshots a native time-wheel's opening position from the input's *value at the
    instant the tap gesture begins* — before any JS focus handler gets a chance to
    run, no matter how synchronous. There is no reliable way to inject a default in
    response to the tap itself. **Fix:** default the field's value at load time
    instead (`useEffect` on date change, when no row is saved), not on focus. The
    onFocus/prefill helper was removed entirely. Nothing is written to the DB until
    "Save sleep" is tapped either way, so this carries no more accidental-write risk
    than the rest of the app's explicit-save pattern.
  - **Macro/food-group chart's "100%" Y-axis label read as garbled digits**
    ("0.0001%") once a tooltip was open near it. Likely cause: this was the only
    chart using Recharts' `unit="%"` prop (appends the suffix internally) combined
    with an aggressive `margin.left: -20` tuned for the shorter 3-char labels
    elsewhere ("50%", "75%") — the one 4-char label ("100%") clipped/overlapped
    under the default (opaque) hover-cursor highlight. **Fix:** `margin.left: -8`
    for this chart only, `tickFormatter={(v) => `${v}%`}` instead of the `unit`
    prop, and an explicit low-opacity `cursor` fill on the `Tooltip` instead of
    Recharts' default. (The garbled text could not have come from the custom
    tooltip's own number formatting — `toFixed(1)` mathematically cannot produce a
    4-decimal string like "0.0001%" — which is what pointed at axis/cursor
    rendering rather than the data.)
  - **New supplement "disappeared" after Add.** It was rendering correctly — just
    *above* the Add form, off-screen above where the user's eyes/thumb already were.
    **Fix:** moved the active list to render directly *below* the form (matching
    `EventsCard`'s own layout, which already gets this right), added a 2-second
    "Added ✓" flash on the button, and a matching brief tint on the new row.

- **Phase E — eating-pattern quick-adds (2026-07-31)** — the last planned phase. No
  schema change (still v11); pure client-side frequency analysis over the existing
  `meals` table, as scoped.
  - **`src/lib/mealPatterns.ts`** — `mealTypeForHour(hour)` maps a clock hour to one
    of the four existing `meal_type` values (breakfast/lunch/dinner/snack); there's no
    fifth "late night" bucket so 22:00–03:59 folds into `snack` along with the
    mid-afternoon gap. `suggestQuickAdds(meals, now?)` groups meals from a 60-day
    lookback by (current time bucket, lowercased name), keeps the most recent
    occurrence as the re-add template, and surfaces up to 3 with ≥2 occurrences —
    sorted by frequency then recency. A meal's bucket is its own `meal_type` when set,
    else derived from `time`; one with neither is excluded from suggestions entirely
    (it still shows fine in Recent meals, just can't be time-bucketed). A dish already
    logged **today** in the same bucket is excluded too — re-suggesting something you
    logged five minutes ago is noise, and "Recent meals → Duplicate" already covers a
    genuine second helping.
  - **`src/components/QuickAddMeals.tsx`** — "Quick add" card, renders nothing when
    there are no suggestions (same pattern as "Recent meals" only appearing once
    there's something to show). Tapping a suggestion calls `saveMeal` directly with
    today's date and the current time — no review screen — then flashes "Added ✓"
    for 1.5s before recomputing (recomputing immediately would swap the row out from
    under the confirmation before it's ever seen, since the just-added dish now fails
    the "not already logged today" filter).
  - **`src/lib/meals.ts`** (new) — `mealToAnalysis()`/`parseIngredients()`/
    `parseFoodGroups()` pulled out of `NutritionTab.tsx`, which had three
    near-identical copies of this Meal→MealAnalysis mapping (edit, duplicate, and now
    quick-add) by the time this landed. `startEditMeal`/`duplicateMeal` now call the
    shared helper; behaviour unchanged, verified via the Duplicate button after the
    refactor.
  - Placed between the goal-progress card and the photo/dictation capture card on the
    Meals tab, so it's the first thing you can act on without typing anything.
  - Verified in-browser in both themes: seeded a 3× "Greek yogurt with almonds" snack
    pattern, confirmed the suggestion appears, tapping it saves instantly with today's
    date/current time/carried-over macros and meal_type, the card then disappears
    (already-logged-today), and today's totals update immediately.

## Done ✅ (cont.)

- **Phase F-1 — multi-day meal dictation + photo/text date-time accuracy fixes**
  (2026-08-05, part of the larger "easier meal & ingredient entry" plan — full plan at
  `~/.claude/plans/lets-add-some-adaptations-clever-blum.md`, iterations 2–4 still to
  come):
  - The Meals-tab dictation card's "this is more than one meal" checkbox is now three
    chips: **One meal / Several meals / Several days**. The first two behave exactly
    as before; "Several days" passes a new `multiDay` flag into `analyseMealsText` →
    `multiMealSystemPrompt`, which gained an `IMPORTANT — MULTI-DAY` block (modelled on
    the one `diarySystemPrompt` already had) telling Claude not to collapse everything
    onto the reference date — give every meal its own date, resolve "yesterday"/"on
    Saturday" against the reference date, and treat a run of meals with no day word as
    staying on the same day as the meal before it. `max_tokens` bumps to 4096 for
    multi-day (same reasoning as the existing diary multi-day bump).
  - The multi-meal review list (`multiReview` phase) now groups rows under a date
    header when more than one date is present, and flags any date that doesn't match
    the one you picked ("not Aug 5"). Editing a row's own date still moves it between
    groups on the next render — grouping is computed from the flat array, not a
    separate data structure, so nothing about save/remove changed.
  - Real bug fix: `mealSystemPrompt()` told Claude to infer `meal_type` from "the
    current time of day" without ever telling it what day or time it was — the model
    had no clock. It now takes `(entryDate, nowTime)` and states both explicitly. The
    photo capture path (`onPick`) also silently dropped the chosen date before —  it's
    now passed through, along with the current time whenever you're logging for today
    (not passed at all when backfilling a past day, since "right now" isn't a
    meaningful clock signal for a meal from another day).
  - The review-form date field was the one of three Meals date inputs missing
    `max={today}` — added, matching the other two.
  - Verified in-browser in both themes and at mobile width: all three dictation-mode
    chips switch correctly with the right label/placeholder/helper text for each
    ("Most recent day described" for multi-day, "all on {date}" helper for
    multi-meal); `npx tsc -b --noEmit && npm run build` clean. Not exercised against a
    live Claude call in this session (no API key in the dev sandbox) — the actual
    multi-day split quality needs checking against a real dictation on your phone.
  - **Phone-verified 2026-08-05:** all three chips, both looks, multi-day grouping,
    and the photo path all confirmed working. One real issue was flagged and put on
    the backlog rather than fixed blind — see "Not started" below: a noticeable
    accuracy discrepancy between the dictation path and the photo path (Immanuel's
    words: "a big discrepancy between dictation and photo analysis"). Not yet
    characterised — no side-by-side example captured yet, needs one before it can be
    diagnosed (same meal, once dictated and once photographed, compared).

- **Phase F-2 — ingredient database + tap-to-build meal builder** (2026-08-05, the
  big one in the "easier meal & ingredient entry" plan). Full design at
  `~/.claude/plans/lets-add-some-adaptations-clever-blum.md` under "Iteration 2";
  summary of what actually landed:
  - **Schema (v11 → v12):** two new tables, `foods` (canonical ingredient —
    per-100g macros, default serving, `food_groups`, `brand`/`barcode` columns
    already there for the later barcode phase, provenance `source`, and frozen
    `seed_count`/`seed_slots`/`seed_last_used` from the backfill) and `meal_items`
    (one row per ingredient in a built meal, snapshotting name/unit/prep/macros so
    editing a food's numbers later never rewrites what a past day says was eaten).
    `foods.name_key` deliberately has **no unique index** — `SCHEMA_SQL` replays
    against bytes pulled from Dropbox in `replaceDb()`, and a unique constraint
    that throws there would make one duplicate row permanently block sync in one
    direction. Uniqueness is enforced in code instead, at `findFoodByKey()`.
  - **`src/lib/mealBuild.ts`** (new, pure) — `BuildItem`, `gramsOf`/`itemMacros`/
    `buildTotals` (kcal rounds to an integer, macros to 1dp, summed from the
    already-rounded per-item values so the total always matches the rows under
    it), `buildFoodGroups` (mass-weighted — strictly better than the existing
    `classifyMeal()`'s equal-weight-by-ingredient-count fallback, and lands in the
    same `meals.food_groups` column so Insights needed no changes), `buildToAnalysis`
    (the bridge to the existing `MealAnalysis` shape — ingredient `name` stays bare
    so `classifyIngredient`'s regexes keep matching; amount+prep go in `quantity`).
  - **`src/db/queries.ts`** — `saveMeal`/`updateMeal` split into non-persisting
    `insertMealRow`/`updateMealRow` + a `persist()` call, so `saveBuiltMeal`/
    `updateBuiltMeal` can write `meals` + `meal_items` under ONE `persist()` (which
    exports the whole DB — a per-tap write would be far too expensive on a phone).
    `deleteMeal` and `updateMeal` now cascade to `meal_items` (sql.js runs with
    foreign keys off). New: `findFoodByKey`/`upsertFood`/`allFoods`/`foodsByIds`/
    `mergeFoods`/`foodUsageForSlot` (a LEFT JOIN with the slot filter in the ON
    clause, not WHERE — filtering in WHERE would silently become an INNER JOIN and
    drop every backfilled, zero-live-use food from the ranking).
    **Regression-verified live** (real API key, not just seeded data): dictation
    save, multi-meal save, edit, duplicate, and the delete cascade (via direct SQL)
    all still work correctly after the extraction.
  - **`src/lib/foodSeed.ts`** — one-time backfill mining `meals.ingredients` JSON
    into macro-less `foods` rows with real usage history, gated by a `meta` flag.
    Found and fixed a real bug during testing: React 18 StrictMode double-invokes
    effects in dev, and the flag-check-then-write wasn't atomic, so two concurrent
    calls both tallied and both wrote — doubling every count. Fixed with an
    in-flight promise guard; verified fixed (11/10 counts, not 22/20) and
    idempotent (re-mounting after the flag is set does nothing).
  - **`src/lib/foodPatterns.ts`** — `rankFoodsForSlot`, scored multiplicatively
    (`uses × (1 + recency) + seed × 0.5`) so ten uses six weeks ago rank below six
    uses yesterday. Ranked once per slot selection, not on every item-list change
    — the grid must not reshuffle mid-build.
  - **AI triple for new ingredients** — `FOOD_TOOL` (`record_food_profiles`,
    array-shaped so "one new ingredient" and "fill in the N the backfill left
    macro-less" cost one request either way) in `ai/schemas.ts`,
    `foodProfileSystemPrompt` in `ai/prompts.ts`, `describeFoods()` in
    `ai/anthropic.ts` with clamps (kcal 0–900, per-100g macros 0–100, serving
    1–2000; anything clamped drops to `confidence: 'low'`) since these numbers are
    written once and trusted for months. **Verified live**: avocado, rolled oats
    (correctly 379 kcal/100g **dry**, not the ~130 a cooked-weight mixup would give
    — the exact threefold error the prompt warns against), chicken breast, and an
    ad-hoc "quinoa" typed mid-build all returned accurate, sensibly-stated values.
  - **UI** — `MealBuilder.tsx` (day → slot → ranked ingredient grid → item rows
    with a stepper/exact-grams toggle/collapsible prep chips → sticky running
    total → optional "Refine all with Claude" comparison → save), plus
    `IngredientGrid`, `BuildItemRow`, `NewIngredientField` (checks `findFoodByKey`
    before ever calling the API), and `FoodPickerSheet` (search/edit/archive/merge
    over the full ingredient library — copies `QuickLogSheet`'s bottom-sheet
    wrapper). Wired into `NutritionTab` as a third, now-primary chooser button
    ("Build from ingredients"); `Edit`/`Duplicate` on a built meal route into the
    builder instead of the plain review form when `mealItems(id).length > 0`.
  - **Verified live end-to-end** (real API key, both themes, mobile width): built
    a 3-ingredient dinner from the ranked grid (tap-to-add, tap-again-increments,
    "Fill in the missing" batch lookup, prep tag, save) — totals matched the sum
    of the rows every time; edited it back open with items correctly pre-filled;
    changed a serving and prep tag and saved — confirmed same meal ID (an update,
    not a duplicate) with fresh `meal_items` rows; typed a brand-new ingredient
    mid-build; opened the picker sheet and edited a food's macros in place;
    Settings → Data panel's `foods`/`meal_items` counts matched; Insights charts
    (which now read the mass-weighted `food_groups` from a couple of these test
    meals) rendered with no console errors, both themes, mobile width.
  - **Not yet exercised**: `FoodPickerSheet`'s merge-on-rename-collision path
    (code follows the same confirm-then-merge pattern as the rest of the app, but
    wasn't hit in this session's testing) and the barcode/brand columns (unused
    until F-4).

- **Metric scales & supplement suppression** (2026-08-12) — ad-hoc track names no
  longer default to a 0-180 **minutes** slider. `scaleForTrack()` now infers: a
  duration has to be positively identified (category `activity`/`practice`, or a
  duration-shaped name), everything else is a **0-10 intensity**. Registered
  muscle soreness / muscle stiffness / headache / nausea / fatigue / brain fog
  (symptoms) and brain clarity / focus (wellbeing, high-is-good); `TrackDef` gained
  an explicit `category` so wellbeing-group tracks stop being stored as `release`.
  Values are clamped into range on read (`clampToScale`), so a pre-fix "45 min" of
  soreness shows as an out-of-range 10 waiting to be re-saved rather than silently
  pinning the slider. Supplements are excluded from Quick entry, the Insights
  tap-to-log chips and the Insights "Other" charts (`src/lib/hiddenMetrics.ts`),
  and the extraction prompt now forbids filing a supplement/medication/food as a
  track at all. Plus a per-row **✕ hide** with a Hidden/restore section, persisted
  in the DB `meta` table so it syncs across devices.

- **Meal-logging discrepancy vs. Cronometer, root-caused** (2026-08-15) — compared
  a real Cronometer-logged lunch (4 eggs, FLIK carrots, broccoli raab, feta — 816.5
  kcal / 61.1g protein, from four brand/NCCDB-verified products) against the same
  meal entered all three ways in-app:
  - **Photo** (790 kcal / P45): close on calories, protein 26% low — a single-image
    vision estimate can't verify exact quantities or brand-specific density (generic
    "broccoli" vs. the specific low-cal "broccoli raab"); inherent to photo estimation,
    not a bug.
  - **Dictation** (920 kcal / P50 / F68): overshoots mainly because the user
    mentioned "olive oil and balsamic dressing" with no quantity, and the model
    estimated 1.5 tbsp/1 tbsp for them (~137 kcal, ~20g fat) instead of asking —
    `mealSystemPrompt` already says to raise a clarifying question when a hidden/
    unquantified ingredient materially affects the estimate; it didn't here. Left
    as-is for now (see decision below).
  - **Tap-builder "usual ingredients"** (909 kcal, later corrected) — this one
    *was* a bug, not an estimation gap: the ingredient grid had two separate `foods`
    rows both named "carrot" (`Carrot` and `carrot`), so tapping both chips double-
    counted the same real ingredient with no warning. Root cause: `name_key`
    deliberately has no unique DB index (a Dropbox multi-device merge can produce
    exactly this), and nothing ever re-swept existing duplicates — the app only
    prevented *new* ones via `findFoodByKey`.
  - **Fixed**: [`src/lib/foodDedupe.ts`](src/lib/foodDedupe.ts) — `dedupeFoods()`
    groups all foods by `name_key`, keeps the best row (has real macros > higher
    `seed_count` > older), and merges the rest into it via the existing
    `mergeFoods()` (remaps any `meal_items.food_id`, sums usage). Runs on every
    Nutrition-tab mount (not gated one-time, since sync can reintroduce a dup),
    right after `ensureFoodSeed()`. Verified in the dev DB: seeded a duplicate pair
    with a `meal_items` row pointing at the loser, reloaded, confirmed one row
    survives with summed `seed_count` and the meal_item's `food_id` remapped.
  - **Not fixed, and not a code bug**: the generic-nutrition-lookup vs. Cronometer's
    verified branded database will never match exactly on any of the three entry
    paths — `foodProfileSystemPrompt` deliberately gives generic USDA-style values,
    Cronometer's 816.5 kcal came from four specific verified products. This is a
    ceiling on accuracy, not something to chase further without a real food
    database behind the app.

- **Phase G-1 — dictation stopped destroying manual entries; Log screen halved in
  height** (2026-08-19). Six changes, one root cause between them: nothing between
  Claude's output and the database.
  - **The sleep data-loss bug, root-caused and fixed.** `saveDiaryExtraction()`
    handled a wellbeing record with `DELETE FROM wellbeing WHERE date = ?` followed
    by an INSERT listing only 8 of the table's 11 columns. It carefully carried
    `energy` / `mood` / `notes` forward — but `sleep_start`, `sleep_end` and
    `sleep_quality` (added later, schema v9) were never added to that INSERT, so
    **every dictated entry mentioning energy or mood silently wiped that day's
    saved bedtime, wake time and felt quality**. Same trap in `deleteEntryRows()`:
    deleting (or re-analyzing) an entry took the day's sleep and the quick-entry
    `*_notes` with it, even though the extraction can never set them. Both fixed,
    both regression-tested against the live path.
  - **Editable, conflict-flagged review step** (`src/lib/diaryReview.ts` +
    `ExtractionReview` in `LogTab`). The preview used to be read-only text that went
    straight to the DB. Now every number Claude produced has a −/+ stepper, every
    record has an include toggle, and anything that would land on a value already
    stored for that day shows `was 7 · Keep` plus a banner counting them. **The
    default on a conflict is his value, not Claude's** — the extraction has to be
    accepted to win.
  - **Prompt tightened** so Claude stops inventing `energy` / `mood` / `stress_load`
    from the tone of an entry; it must now ask in `follow_up_questions` instead.
  - **5-minute sleep picker** (`src/components/TimePicker5.tsx`). `step={300}` on
    `<input type="time">` shipped in `bd97089` and never worked: WebKit applies
    `step` to validation only, and iOS's wheel still offers all sixty minutes. Two
    native `<select>`s instead — each renders as its own iOS wheel, and the options
    *are* the allowed values. Same `'HH:MM'` in and out, so `sleepDurationMin()` and
    `upsertSleep()` are untouched. An off-grid legacy value (23:07) is offered as its
    own option rather than silently snapped.
  - **Half-step stool consistency** — `stool` step 1 → 0.5. `rollup: 'last'` already
    prevented a 2-and-6 day averaging to a misleading 4; `tracks.value` is REAL and
    SQLite's INTEGER affinity stores 4.5 unchanged, so no migration.
  - **Log screen: three lines per metric → two.** Slider, note pen and Save now share
    one row; the ✕ hide button moved into the note panel, where it costs nothing on
    every other row. Group headings (Movement / Practice / Health & pain / Wellbeing /
    Other) fold away, with the open/closed set persisted in `meta.collapsed_groups`
    (`src/lib/uiPrefs.ts`) so it syncs to the phone like `hidden_metrics` does. All
    five headings now always render — G-2's per-group "+" needs to be reachable in an
    empty group.
  - **Icons** (`src/components/metricIcons.tsx`) — 33 hand-drawn inline SVGs in the
    existing `icons.tsx` style, no new dependency, plus a per-group fallback so a
    dictation-invented name still gets a glyph. Tinted with each metric's own colour
    and used in the Log rows, the quick-log/add/hidden chips, the Insights tap-to-log
    grid, the chart legends and the section headers.
  - **A theme bug fixed on the way:** the amber warning tones were literal Tailwind
    `text-amber-200/300`, near-invisible on parchment. They now go through
    `--warn-rgb` / `--warn-text` and the `.warn-box` / `.warn-chip` / `.warn-dot`
    classes, which flip with the theme like every other colour in the app. This also
    makes the pre-existing "Backfilling…" and "Editing an existing entry" banners
    readable in light mode.
  - Verified in the Browser pane against seeded data in both themes, no console
    errors. The regression test that matters: sleep 23:00→07:00 quality 8 + energy 7
    saved by hand, then a dictated entry setting energy 9 / mood 8 / stress 6 /
    meditation 25 / Bristol 4.5 — after tapping **Keep** on energy and unticking the
    knee-pain record, the DB held energy **7**, mood 8, stress 6, meditation 25,
    stool **4.5**, no knee pain row, and sleep **23:00 / 07:00 / 8 fully intact**.

- **Phase G-1.5 — the sleep picker back to a wheel, a working "get the new build"
  control, and saving a dictation without Claude** (2026-08-19). Three items straight
  off his G-1 phone report; two of them were blocking his ability to test anything.
  - **Sleep picker is a two-column wheel again** (`src/components/TimeWheelSheet.tsx`).
    G-1's two `<select>`s enforced the 5-minute step correctly but cost a separate
    tap-and-dismiss for the hour and again for the minutes. `TimePicker5` is now just
    the trigger — a field-shaped button showing `23:45` — and tapping it opens a sheet
    with hours and minutes as two scroll wheels side by side. Scroll-snap rows,
    two-row spacer padding so the first and last value can reach the centre, a
    highlight band behind the middle row, and the selection read back off `scrollTop`
    on a ~120 ms debounce (iOS has no `scrollend` before 17, so the debounce is the
    mechanism, not a fallback). Verified that a flick landing mid-row (367 px) snaps to
    360 and reads back as `45`. Same `'HH:MM'` API, so `SleepCard` never changed.
  - **App updates, root-caused.** `vite.config.ts` had `registerType: 'autoUpdate'`
    and **nothing in the app ever called `registerSW`** — registration was the script
    vite-plugin-pwa injects into `index.html`. A new worker is therefore only fetched
    on a real navigation, and an installed iOS PWA resumed from the background
    essentially never performs one; that is why pull-to-refresh kept serving the old
    build. Now: `src/lib/appUpdate.ts` registers explicitly and holds the
    registration, checks on every return to the foreground (throttled to once a
    minute — the one moment a standalone PWA reliably gets), and `registerType` is
    **`'prompt'`** so a new build never reloads the page underneath a half-written
    dictation or an unsaved slider. A banner in `App.tsx` and an **App version**
    section in Settings (build stamp + short git SHA via a `__BUILD_ID__` define) put
    it under his thumb. Confirmed in the built `dist/sw.js` that `self.skipWaiting()`
    is now gated behind the `SKIP_WAITING` message handler and `clientsClaim` is gone
    — i.e. prompt mode really took effect.
    **Note for the first deploy after this:** the worker already installed on his
    phone is the old `autoUpdate` one, so it will swap itself for the new one without
    asking. The prompting behaviour starts from the version *after* this one.
  - **"Save without Claude"** — `entries.processed` has existed since the first schema
    and had always been hardcoded to `1`, because the only save path ran through
    Claude. `saveRawEntry()` writes `processed = 0` with no derived rows, so a note
    needs no API key, no network, and — the point — puts nothing into
    `tracks`/`wellbeing`/`day_context`. Verified: a note reading "Energy 2, mood 3"
    left the day's energy at 7 and mood at 8. Unprocessed entries carry a **note
    only** chip and offer **Process with Claude now**, which reuses the existing
    `startEdit` → `confirmSave` path, so capture-now-process-later cost no new code.
    `loggedDates()` already unioned `entries.entry_date`, so a note still marks its
    day on the strip.
  - Verified in the Browser pane in both themes, no console errors, and the G-1
    regression re-run clean after the `queries.ts` change (sleep survives a dictated
    entry and survives deleting it).

## Check on your phone (current)
_Replaced each iteration — this is the list for **G-1.5**._

**Item 1 first: it is how you get everything else.**

1. **Getting the new build.** Open the app → **Settings** → scroll to the bottom →
   **App version**. The *Build* line should show today's date/time and a short code.
   If it looks old, tap **Check for updates** — it must say something honest
   (*"You're on the latest version"*, or a **New version ready — update now**
   button), never nothing at all.
   *One-off caveat:* the service worker currently on your phone is the old
   self-updating one, so **this** deploy may just apply itself silently. From the
   **next** one onwards you'll get a small banner at the top — *"A new version is
   ready · Update"* — and nothing reloads until you press it. That's deliberate: a
   reload mid-dictation would throw away unsaved sliders.
2. **The sleep wheel — the thing I genuinely could not test.** Log → Sleep → tap the
   bedtime button (it now shows `23:00` rather than two dropdowns). A sheet slides up
   with **hours and minutes side by side**.
   - Flick the minute wheel: only **00, 05 … 55**, and a flick should *land on* a
     number, never stop halfway between two.
   - Tap a number directly — it should glide to the centre.
   - Set 23:45, tap **Done** → the button reads `23:45` and the "asleep" figure on
     the right updates. Do the same for Wake, then **Save sleep**.
   *Tell me if it feels sticky, overshoots, or settles on the wrong number* — that is
   exactly what a browser on a laptop can't show me.
3. **Save without Claude.** Log → type or dictate something that mentions a number
   ("energy 2, mood 3") → tap **Save without Claude**, the outlined button under
   *Process with Claude*. It should save instantly with no "Thinking…" step, and the
   toast should read *"Saved as a note — nothing was added to your tracking."*
   Then check your **Energy** and **Mood** sliders and the Insights charts: those
   numbers must **not** have moved. That's the whole point of it.
4. **Process it later.** In **Recent entries** that note carries a **note only** chip.
   Expand it → **Process with Claude now** → the text loads back into the box; tap
   *Process with Claude* and finish as usual. You should end up with **one** entry,
   not two.
5. **Airplane mode.** Turn it on, open the app, dictate, **Save without Claude** —
   should work completely. *Process with Claude* should fail with a readable error
   rather than hanging.
6. **Both themes** for the wheel sheet: Settings → Appearance → Dark and Light. The
   selected row's highlight band must be visible in both.

Unchanged and worth confirming nothing regressed: the G-1 fixes (sleep survives a
dictated entry, the amber conflict pills, folded groups staying folded), the meal
builder and barcode scanner, and the Insights charts.

## Open markers
Codes still awaiting Immanuel. Remove each as it is answered.
- 🟦 **dupes1** — delete the duplicate 2026-08-05 chicken soup and one 2026-07-19
  quinoa bowl (Meals tab), and the "No supplements in the last four days" event
  (Log tab). Double-counted calories + a stray reference line on three charts.
- 🟦 **phone3** — phone report on **G-1.5** (checklist above). The one thing only his
  phone can settle: how the sleep wheel's momentum-snapping feels under a thumb.
- ✅ **phone2** (G-1) — answered 2026-08-19. Sleep fix and 5-minute steps confirmed
  working; the two-dropdown picker and the stale-build problem came back as G-1.5.
- 🟦 **phone1** — phone report on the metric-scale fix. Never answered, and two
  iterations have shipped over that code since; superseded by **phone2** unless he
  says otherwise.

Answered: 🔶 **hide2** → **a**, 2026-08-12. Hiding a metric suppresses ENTRY only
(sliders + tap-to-log chips); a hidden metric keeps its Insights chart. Recorded at
the top of `src/lib/hiddenMetrics.ts` — don't re-litigate it in a later session.

## Verified against the real database (2026-08-12)
Loaded the live Dropbox file (`~/Dropbox/Apps/Health Tracker private/health.db`,
461 tracks / 64 meals / 32 wellbeing days) into the dev app and walked every tab.
Read-only: worked on a copy, the original was never written to. Result: **no console
errors or warnings on any tab**, and the segment→rollup machinery is provably correct
on the one day segments were used (2026-07-30: minutes sum, ratings average, energy /
mood / stress correctly routed to their own tables). No track value violates its scale.

Fixed as a result: chart event labels truncated to 26 chars (his real labels are full
sentences and ran the height of three charts); `allTrackNames()` now returns one row
per name (mixed categories across a name's history returned it twice, and the
tap-to-log picker could pick the category-less row and mis-scale the slider).

Data issues found, **left for Immanuel to decide** (the app is not wrong, the rows are):
- **6 legacy duplicate (name, date) track rows**, all before 2026-07-29 — from before
  the diary path started replacing instead of stacking. 2026-07-14 knee pain 5 *and* 3;
  07-15 dancing 10 *and* 20; 07-17 meditation 20 twice; 07-22 kite surfing 60 *and* a
  value-less row; 07-23 walking 40 *and* a value-less row; 07-28 infection 6 twice.
  Re-saving that day's slider collapses them (the write deletes by name+date first).
- **2 duplicate meals**: 2026-08-05 "Organic chicken soup with pumpkin" saved twice,
  identical time/macros (double-counts 520 kcal); 2026-07-19 "Quinoa Bowl" logged
  twice 94 min apart at 650 and 560 kcal. Both inflate those days' calorie totals.
- **6 value-less track rows carrying real notes** (e.g. 07-18 knee pain, 07-26
  meditation) — the note is readable in the Log tab but the day is invisible in every
  chart, which filters on `value != null`.
- **An event that isn't an event**: "No supplements in the last four days. First of
  August until fourth of August." is stored as a supplement event and draws a
  reference line across three charts.
- `meal_type` is null on 28 of 64 meals and `food_groups` on 30 of 64 — all pre-D4
  meals, so the food-group chart only really covers the newer half.
- Time-of-day segments have been used on exactly one day (2026-07-30) and never since.

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
- **Phase C:** ~~(1) bulk/range entry~~ ✅; ~~(2) calorie/protein goals~~ ✅;
  ~~(3) supplements~~ ✅ — Phase C is complete.
- **Phase E:** ~~eating-pattern quick-adds by time of day~~ ✅ — all planned phases (A–E) are done.
- **Phase F — easier meal & ingredient entry** (plan approved 2026-08-05, full detail at
  `~/.claude/plans/lets-add-some-adaptations-clever-blum.md`):
  - ~~F-1: multi-day dictation + photo/text date-time accuracy fixes~~ ✅ (above).
  - ~~F-2: ingredient database + tap-to-build meal builder~~ ✅ (above) — built,
    verified live, and since exercised in real use (the duplicate-`foods`-row bug
    and the dictation-vs-photo backlog item above were both found through it).
  - ~~F-3: multi-meal build session~~ ✅ (2026-08-15, **phone-verified 2026-08-17**)
    — "+ Add another meal" in `MealBuilder` stages the in-progress meal and
    advances breakfast → lunch → dinner → snack without leaving the builder;
    staged cards are tap-to-edit or removable; one "Save all" batch-writes
    everything via the existing `saveBuiltMeal`. Create-mode only — editing an
    existing meal is unchanged. Phone report also caught a small polish bug in
    the same screen (fixed same session, see "Check on your phone" above): the
    "More…" ingredient picker gave no tap feedback.
  - ~~F-4: barcode scanner + Open Food Facts lookup~~ ✅ (2026-08-17) — the last
    iteration in Phase F, which is now complete. Scan a packaged product's
    barcode (live camera, a still photo, or typed by hand, via `zxing-wasm`) →
    Open Food Facts lookup → exact label numbers instead of an AI estimate,
    from three places: **Build from ingredients** (new "⌗ Add via barcode"
    under the ingredient field, lands in grams mode), and the **photo/dictation
    review card** — a per-row ⌗ to replace an ingredient with a scan, or an
    "⌗ Add via barcode" to append one. Since AI-path ingredients are macro-less
    text, a replace/add writes an authoritative line and lights up the existing
    Re-estimate button, whose hint now marks scanned lines as measured so
    Claude only estimates what's left. New: `src/lib/barcodeScan.ts` (zxing-wasm
    wrapper, wasm bundled via Vite `?url` so it's Workbox-precached rather than
    CDN-fetched — verified in the build: precache grew from 27→28 entries,
    2255→3370 KiB), `src/lib/openFoodFacts.ts`, `src/lib/barcodeFood.ts`,
    `src/components/BarcodeScanSheet.tsx`. Also fixed a real bug hit during
    testing: `mergeFoods()` (called by `dedupeFoods()` on every Meals-tab
    mount) was dropping a losing row's `barcode`/`brand` on merge — would have
    silently lost the barcode and re-fetched OFF on the next scan of the same
    product. No schema change — `foods.barcode`/`brand`/`source='off'` were
    ready since F-2. Verified live against the real Open Food Facts API
    (barcode `3017620422003` / Nutella: 539 kcal/100g, correctly landed at
    162 kcal for 30g in the builder and matched macros P1.9/F9.3/C17.3),
    local-barcode-index reuse on a re-scan (confirmed zero network calls),
    the not-found fallback, and both review-card entry points. **Phone-verified
    2026-08-19**, including the live-scan camera decode loop the Browser pane
    can't grant permission for.
    - **Follow-up (2026-08-19, same day):** Immanuel asked how to reuse an
      already-scanned product without rescanning. Added a "search a product
      you've already scanned" field at the top of `BarcodeScanSheet`'s scan
      phase — matches by name against any `foods` row with a `barcode` set,
      picking one skips straight to the existing grams/confirm step with no
      network call. One shared component serves both the builder and the
      review card, so this fixed it in both places at once. Verified live in
      the Browser pane; not yet re-confirmed on the phone specifically for
      this bit.
- ~~Backlog: dictation-vs-photo accuracy discrepancy~~ ✅ resolved 2026-08-15 —
  see "Meal-logging discrepancy vs. Cronometer, root-caused" above. Not a shared
  bug: the tap-builder had a real duplicate-`foods` bug (now auto-merged); the
  remaining photo/dictation gap vs. a branded-product reference is an inherent
  generic-estimate ceiling, not something to fix in the prompt. F-4's barcode
  scanner (this iteration) is the actual way past that ceiling for packaged food.

## How these sessions run
One feature per iteration: build it → verify in-browser → typecheck + build → **commit
and push** (the deploy is how it gets tested) → write the phone checklist above and in
chat → **wait** for the report → fix what came back → next feature. Full version in
`CLAUDE.md` under "Session workflow".

## Exact next step
**Waiting on Immanuel's phone report for G-1.5** (checklist above). Built,
typechecked, and verified in the Browser pane in both themes with no console errors:
the wheel snaps a mid-row flick to the right value, `__BUILD_ID__` renders, the
built `sw.js` confirms prompt mode took effect, and a "Save without Claude" note
containing "energy 2, mood 3" left the day's energy and mood untouched. The one gap
only his phone can close is how the wheel's momentum-scrolling feels.

When it comes back and anything broken is fixed, build **G-2** — the second half of
the original Phase G ask, already scoped and approved:

1. **A boolean ("checkmark") metric kind** — nothing in the registry can express
   yes/no today, and both of the next two items need it, so build it once:
   `kind?: 'scale' | 'bool'` on `TrackDef`, rendered as a toggle instead of a
   slider in `QuickRow` and `QuickLogSheet`.
2. **Warming bottle** as a registered boolean metric, and make the Insights
   "Warming bottle" stat tile count the union of the dictation-extracted
   `gut_events.warming_bottle_needed` days and the new track's days, so the two
   entry paths can't report two different numbers.
3. **Intensity on duration metrics** — schema v13 (`tracks.intensity` and
   `segment_values.intensity`, INTEGER 1/2/3, via `runMigrations()`), threaded
   through `upsertTrackValue` → `writeMetric` with the same tri-state
   carry-forward `notes` already has (`writeTrackRollup` is a DELETE+INSERT).
   UI: **three small Low/Med/High pills on the slider row**, shown only when
   `scale.unit === 'min'` — his choice, and the one that costs no extra height.
4. **Computer time** — a registered `min` metric, 0-720 (12 h, since the movement
   default of 180 clips a working day), plus an optional `quickStep?: number` on
   `TrackDef` so its one-tap chip adds 30 min instead of 5. Its glyph already
   exists in `metricIcons.tsx` under the key `computer time`.
5. **User-defined categories** — `src/lib/customMetrics.ts`, a JSON array in the
   `meta` table modelled exactly on `hiddenMetrics.ts`, merged into the registry by
   a new `allTrackDefs()` in `metrics.ts`. Everything downstream (`scaleForTrack`,
   `colorForTrack`, `rollupFor`, `canonicalTrackName`…) already routes through
   `defForName`, so it works for free. A **+** on each of the five group headings
   opens a sheet: name, type (Duration / Rating 0-10 / Checkmark / Number), and an
   icon from `metricIcons.tsx` (`GLYPH_NAMES` is already exported for this, and
   `TrackDef.icon` already exists). The headings already always render, including
   empty ones, precisely so this button has somewhere to live.
6. **Supplement editing** — `updateSupplement(id, patch)` in `queries.ts` plus an
   inline edit mode in `SupplementsCard`, covering name, composition, label photo,
   check-in interval, **start date** and (for a stopped one) end date. Today the
   card only offers Stop and Delete.
7. **"Log an event" kept, renamed, moved** — it is a genuinely different thing (a
   dated reference line across the charts, not a number trended over time), so it
   stays. Rename the heading to **"Mark a change"**, move it below
   `SupplementsCard` in `LogTab`, and sharpen its one-line description so it stops
   competing with the Add chips and the new + buttons.

Full plan: `~/.claude/plans/implement-general-modifications-and-foamy-reef.md`.

Older, unscheduled follow-ups (unchanged, not blocking):
- A supplement's label photo is stored but never read — wire a vision call
  (mirror `analyseMeal` in `ai/anthropic.ts` + a tool in `ai/schemas.ts`).
- Adding a supplement doesn't create an `events` row, so it draws no reference
  line on Insights charts.
- Phase D/D-2 (plateau charts, tap-to-log sliders, day-strip swipe, time-of-day
  segments) still unverified on a real phone.

## Dev hygiene
After a schema change: `rm -rf node_modules/.vite` and, in the browser test tab,
`indexedDB.deleteDatabase('ht-store')` before re-testing. Always run
`npx tsc -b --noEmit && npm run build` before committing. DEV-only `window.__ht`
(`src/lib/devtools.ts`) can seed/wipe/run raw SQL against the live DB for
verification without spending API calls — confirmed stripped from production builds.
