# STATUS

Quick-start context for a fresh session. Full roadmap: `docs/PLAN.md`. Change log: `docs/DEVLOG.md`.

_Last updated: 2026-07-31 (Phase E: eating-pattern quick-adds — all planned phases done)_

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

## Check on your phone (current)
_Replaced each iteration — this is the list for Phase F-1. Open
https://leunammih.github.io/health-tracker/ and pull down to refresh first, so the
service worker picks up the new build._

**Multi-day meal dictation, on the Meals tab.**
1. Open **Meals → Dictate a meal**. You should see three pill buttons at the top:
   **One meal**, **Several meals**, **Several days** (replacing the old checkbox).
   "One meal" is selected by default and the screen looks exactly as before.
2. Tap **Several days**. The date field's label changes to **"Most recent day
   described"**, and the text box placeholder shows a two-day example. Type or
   dictate something like: *"Yesterday I had oatmeal for breakfast and a chicken
   salad for lunch. The day before, dinner was pasta with meatballs and I skipped
   lunch."* Tap **Split into meals**.
3. **Expected:** the review list shows the meals grouped under date headers (e.g.
   "Aug 4" and "Aug 3"), each header showing which date it is relative to what you
   picked. Each meal's own date/time/meal-type should look sensible for what you
   said (dinner ≈ 19:00, breakfast ≈ 08:00, etc.) — the dates should NOT all be
   bunched onto today or onto the single date you picked.
4. Adjust anything wrong inline (each row has its own date/time/meal-type
   editable), then **Save N meals**, and confirm they land on the right days in
   **Recent meals** / **Home**.
5. Also try **Several meals** (single day, several meals — e.g. "Breakfast was
   toast. Lunch was a salad. Dinner was chicken and rice.") — this should behave
   like the old checkbox: all meals land on the one date you picked, no date
   grouping shown (grouping only appears once more than one date is present).
6. **Photo path (accuracy)**: photograph an actual meal and check the returned
   `meal_type` (shown as a chip in the review screen) makes sense for the actual
   time of day you're logging it — this is the "Claude now knows the date/time"
   fix, worth a sanity check even though the UI hasn't visibly changed there.
7. **Both looks** — Settings → Appearance → Dark and back, on both the chip picker
   and the grouped review list.

Nothing else on the Meals tab should have changed — goal progress, Quick add,
Photograph a meal, Edit/Duplicate/Delete on Recent meals, all exactly as before.

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
  - **F-2 (next, queued): ingredient database + tap-to-build meal builder.** New
    `foods`/`meal_items` tables, macros computed locally from stored per-100g values
    (Claude called once per brand-new ingredient, never per meal), a one-time backfill
    that mines existing `meals.ingredients` JSON so the "most used" grid isn't empty
    on day one, most-used-per-meal-slot suggestions, and a tap-to-build `MealBuilder`
    UI (day → slot → tap ingredients → grams/prep → save). This is the big one — it
    also refactors `saveMeal`/`updateMeal` underneath every existing meal write path,
    so it needs a full regression pass (photo, dictation, edit, duplicate, delete,
    quick-add) before it ships. See the plan file for the complete schema, query, and
    component design.
  - F-3: multi-meal build session (breakfast → lunch → dinner without leaving the
    builder). Deliberately deferred until F-2 is proven on a phone.
  - F-4: barcode scanner + Open Food Facts lookup for packaged food. New camera-stream
    dependency (first `getUserMedia` in the app) + a third-party network call.

## How these sessions run
One feature per iteration: build it → verify in-browser → typecheck + build → **commit
and push** (the deploy is how it gets tested) → write the phone checklist above and in
chat → **wait** for the report → fix what came back → next feature. Full version in
`CLAUDE.md` under "Session workflow".

## Exact next step
**Waiting on Immanuel's phone report for Phase F-1** (multi-day dictation + photo/text
date-time fixes — checklist above). Once that comes back and anything broken is fixed:

1. **Start Phase F-2 — ingredient database + tap-to-build meal builder.** This is the
   queued next feature; full design (schema, back-compat, seeding, ranking, UI
   components, AI tool, risks) is written up in
   `~/.claude/plans/lets-add-some-adaptations-clever-blum.md` under "Iteration 2" —
   read it before starting rather than re-deriving the design. Build in the sequencing
   order the plan lays out (schema/types → pure `mealBuild.ts` → query-layer
   refactor+regression-check → seeding → ranking → AI triple → UI), since the query
   refactor touches every existing meal write path and needs to be verified solid
   before the UI is built on top of it.
2. Older, smaller, optional follow-ups noticed while building Phase C-3 (not blocking,
   not scheduled):
   - A supplement's label photo is stored but never read — wire a vision call
     (mirror `analyseMeal` in `ai/anthropic.ts` + a tool in `ai/schemas.ts`).
   - Adding a supplement doesn't create an `events` row, so it draws no reference
     line on Insights charts.
3. Still-unverified-on-a-real-phone backlog from Phase D/D-2 (plateau charts, tap-to-
   log sliders, day-strip swipe, time-of-day segments, sleep, single events) — lower
   priority than F-2 unless Immanuel specifically asks for it.

## Dev hygiene
After a schema change: `rm -rf node_modules/.vite` and, in the browser test tab,
`indexedDB.deleteDatabase('ht-store')` before re-testing. Always run
`npx tsc -b --noEmit && npm run build` before committing. DEV-only `window.__ht`
(`src/lib/devtools.ts`) can seed/wipe/run raw SQL against the live DB for
verification without spending API calls — confirmed stripped from production builds.
