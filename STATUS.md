# STATUS

Quick-start context for a fresh session. Full roadmap: `docs/PLAN.md`. Change log: `docs/DEVLOG.md`.

_Last updated: 2026-07-30 (Phase C-3 fixes: sleep picker, macro tooltip, Supplements layout)_

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

## Check on your phone (current)
_Replaced each iteration — this is the list for the round that fixed three things you
found in the Phase C-3 build (sleep picker, macro tooltip, "where did it go" on
Supplements). Open https://leunammih.github.io/health-tracker/ and pull down to
refresh first, so the service worker picks up the new build._

**Sleep picker — re-fix.** The first attempt tried to inject the default when you
*tapped* the field (`onFocus`), which turned out not to work: iOS snapshots the wheel's
starting position from the field's value at the moment your tap *begins*, before any
JS can react — so there's no reliable way to influence it from a focus handler. Now the
fields show **23:00** / **09:00** immediately, before you've touched anything, so the
wheel opens on the right value by construction rather than by timing.
1. **Log tab → Sleep card**, a day with nothing saved yet → Bedtime already reads
   **23:00**, Wake already reads **09:00** (not `--:--` anymore). Tap either → wheel
   opens right there, moves in **5-minute** steps. Nothing is written to the day until
   you tap **Save sleep**, same as before.
2. A day that already has sleep saved → shows those saved times instead, as before.

**Macro tooltip — the "100%" garbling.** The chart's left margin was tuned for 3-char
axis labels ("0%"/"50%"/"75%") and clipped/overlapped the one 4-char label ("100%")
under the hover highlight — that's what read as "0.0001%". Margin widened, the tick
now built from a plain formatter instead of Recharts' `unit` prop, and the hover
highlight given an explicit, subtle fill instead of Recharts' default.
3. **Insights → Macros & food groups.** The **100%** label at the top should be crisp
   at rest. Tap/hold a bar → the tooltip box appears clearly clear of the axis labels,
   still one-decimal/real-names from the previous fix.

**Supplements — "where's the info after entering?"** It was rendering *above* the Add
form, so a new entry appeared off-screen above where you were looking. Moved it to
directly *below* the form (same layout "Log an event" already uses), and the Add
button now flashes **"Added ✓"** with the new row briefly highlighted.
4. **Log tab → Supplements → add one** → the row appears immediately under the "Add
   supplement" button (not scrolled away above the form), briefly tinted, button
   flashes "Added ✓" for ~2 seconds.

Nothing else should have changed — day strip, dictation, quick entry, events, every
other Insights chart. A regression there matters more than anything on this list.

Still outstanding from earlier rounds (fold in if you have the patience): the whole
Phase D/D-2 overhaul has never been touched on a real phone — see the next section.

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
- **Phase E:** eating-pattern quick-adds by time of day (client-side frequency over `meals`).

## How these sessions run
One feature per iteration: build it → verify in-browser → typecheck + build → **commit
and push** (the deploy is how it gets tested) → write the phone checklist above and in
chat → **wait** for the report → fix what came back → next feature. Full version in
`CLAUDE.md` under "Session workflow".

## Exact next step
Phases A–D are all code-complete and pushed. **Phase C is now finished** (bulk entry,
goals, supplements). The D/D-2 overhaul is still awaiting phone verification (see
"Try Phase D + D-2 on a phone" — not blocking, just not yet confirmed).

**Next up: Phase E — eating-pattern quick-adds by time of day.** The only remaining
planned phase, and it needs no new storage: it's client-side frequency analysis over
the existing `meals` table.
- Shape: group `meals` by `meal_type` (added in the Phase D gap-closing round) and/or
  by hour bucket from `meals.time`, count the most frequent recent entries per bucket,
  and offer them as one-tap re-adds at the top of the Meals tab — "you usually have
  porridge around now". `mealsSince()` is the reader; `duplicateMeal()`
  (`NutritionTab.tsx`) already does exactly the "save this again as a new row" step,
  so the quick-add can reuse it rather than a new insert path.
- Open question worth deciding first: does it suggest by *time of day now* (needs no
  interaction) or by *meal type you tapped* (more deliberate, less magic)? The former
  is the stated Phase E intent.

**Follow-ups noticed while building, not yet done:**
- A supplement's label photo is stored but never read. If typing the composition is
  annoying in practice, wire a vision call (mirror `analyseMeal` in `ai/anthropic.ts`
  + a tool in `ai/schemas.ts`) to fill the composition field from the photo.
- Adding a supplement does not create an `events` row, so it draws no reference line
  on the Insights charts. If correlating "started magnesium" against energy/sleep is
  the actual goal, that link should be made automatic rather than a second manual step.

## Dev hygiene
After a schema change: `rm -rf node_modules/.vite` and, in the browser test tab,
`indexedDB.deleteDatabase('ht-store')` before re-testing. Always run
`npx tsc -b --noEmit && npm run build` before committing. DEV-only `window.__ht`
(`src/lib/devtools.ts`) can seed/wipe/run raw SQL against the live DB for
verification without spending API calls — confirmed stripped from production builds.
