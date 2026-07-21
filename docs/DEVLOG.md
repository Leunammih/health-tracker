# Dev Log

Reverse-chronological log of what changed and why. Keep entries short. See PLAN.md
for the roadmap and status checkboxes.

## 2026-07-21 — Phase D3 + D4
- **D3 Logs.** `LogTab` gained a swipeable `DayStrip` (28 days) for the entry date,
  a "this covers more than one day" checkbox that passes `multiDay` through to
  `extractDiary`/`diarySystemPrompt` — the prompt then tells Claude to give every
  item its own explicit date instead of defaulting to the entry date, and to prefer
  a track `recurrence` over repeating an item per day. New `QuickEntryPanel`: every
  track name logged in the last 7 days, grouped by category (movement/practice/
  health & pain/wellbeing), each with a slider that starts at that day's saved value
  or falls back to `lastTrackValueOnOrBefore` (the "default to yesterday" behaviour);
  writes are debounced 500ms so dragging doesn't re-serialize the SQLite blob per
  tick. An "Add" row of chips covers standard items not yet tracked.
- **D4 Meals.** New `record_meals` tool + `multiMealSystemPrompt` + `analyseMealsText`
  split a dictation covering several meals (using breakfast/lunch/dinner/snack and
  day words as boundaries) into an array, each with its own resolved date and
  estimated time-of-day. `NutritionTab` gained a "this is more than one meal"
  checkbox and a `multiReview` phase: an editable list (name, date, time, macros,
  ingredients) with per-row remove, then "Save N meals" writes each independently
  via the existing `saveMeal`.
- Verified both end-to-end in-browser: D3 via the seeded 30-day dataset (day-strip
  navigation, slider debounce-then-write, per-day value re-derivation on date
  change); D4 via a temporary DEV-only injection hook (added, exercised, then
  removed) simulating a 3-meal Claude response, confirming per-meal edit/remove/
  save-with-correct-dates. No schema change in either chunk.

## 2026-07-21 — Phase D1 + D2
- **D1 foundation.** New `src/lib/metrics.ts` is the single source of truth for canonical
  track names, colours, axis polarity and slider scales — Insights, the tap-to-log sheet
  and (next) the Log quick-add all read from it. Added `dateSpine()`, the `release`
  track category, and query primitives `upsertTrackValue` / `trackValueOn` /
  `lastTrackValueOnOrBefore` / `allTrackNames` / `loggedDates`.
- **D2 Insights.** New `PlateauChart` (hand-rolled SVG — no Recharts curve produces a
  rounded step over a 0 baseline) draws one continuous line per activity, flat at 0 on
  days not done, rising to a rounded plateau at that day's minutes. New `QuickLogSheet`
  + `DayStrip`: tap any item → pick a day → slider → confirm, sheet stays open for the
  next day; plus apply-to-last-3/7-days, same-for-yesterday, clear. Illness chart merges
  infection severity (carried forward until logged gone), gut pain and Bristol stool.
  All "low is good" metrics (pain, stress, illness, release) now use a reversed Y axis;
  every chart shares one `dateSpine` X axis so days line up vertically.
- **Gotcha:** Recharts' line-draw animation gets stuck at frame 1 under React 18
  StrictMode (leaves `stroke-dasharray: "20px 1010px"` on a 1030px path → line looks
  like a stub). Fixed by `isAnimationActive={false}` on every Line/Bar, matching what
  C2 already did for `MultiTrackChart`.
- Added `src/lib/devtools.ts` — DEV-only `window.__ht` (`seed()` / `run()` / `wipe()`)
  so charts can be driven without a live API key. Verified absent from the production
  bundle. Verified D1+D2 in-browser against 30 days of seeded data.

## 2026-07-18 (2)
- **Meals: dictated entries + edit.** `meals` gains `source` ('photo'|'text'|'mixed')
  and `notes` (the raw dictated text) columns (schema v4→v5, migration-guarded).
  NutritionTab now offers "Dictate a meal" alongside "Photograph a meal" — pick a
  date (backdatable), type/dictate a description, and Claude estimates macros via
  new `analyseMealText` (`src/ai/anthropic.ts`, shares the `record_meal_nutrition`
  tool and a generalized `mealSystemPrompt` with the photo path). The review screen
  works the same for both: editable macros/ingredients, re-estimate from
  corrections, and now an "Attach a photo" control so a photo can be added at
  save time or skipped entirely ("add it later").
  Recent meals rows gained an **Edit** button next to Delete — opens the same
  review form pre-filled from the saved row (via new `updateMeal` in
  `src/db/queries.ts`) so name/macros/ingredients/date can be corrected in place,
  and a photo can be attached to a previously photo-less (dictated) entry, or
  replaced. `source` is recomputed from what's actually present (photo/notes) each
  save, so attaching a photo to a dictated meal marks it `mixed`.
  Verified in-browser: typechecks + builds clean; full dictate→review→save→edit→
  save round-trip exercised with a temporary in-file mock of `analyseMealText`
  (no live API key in this session), confirmed the saved row updates in place
  (not duplicated) and the 🎙/📷 source markers render correctly; mock reverted
  before committing.

## 2026-07-18
- **Insights: meditation/breath work, movement, and pain charts.** Schema v3→v4:
  `tracks` gained a `time` column ('HH:MM', migration-guarded). The diary prompt/tool
  now captures time-of-day for practices and asks the method/teacher (e.g. "Joe
  Dispenza", "9D breathwork") into `notes`; a one-off stomach ache now logs as a
  `tracks` "stomach pain" symptom (not just inside a full `gut_events` episode) so it
  trends alongside knee/shoulder/wrist/joint pain. Follow-up questions now also probe
  for unmentioned stomach pain/discomfort or ongoing joint/body pain, same as
  energy/mood/stress.
  InsightsTab (`src/tabs/InsightsTab.tsx`) adds three combined multi-line charts, each
  merging same-named tracks by date with a fixed-order categorical palette: "Meditation
  & breath work" (name matches `/medit|breath/`), "Movement" (dancing/stretching/
  biking/walking, `/danc|stretch|bik|cycl|walk/`), and "Pain & discomfort" (any
  `category === 'symptom'` track, y-domain fixed 0–10). Tapping a point sets a
  persistent detail panel below the chart (value, unit, time, notes) via a custom
  per-series `dot` click handler — not just the default hover tooltip. Generic
  per-name track cards now skip tracks already covered by these three. Verified
  in-browser by seeding tracks directly through `saveDiaryExtraction` (no API key in
  this session) — all three charts render, colors/legends correct, click-to-detail
  works, then cleaned up the seed entry.

## 2026-07-11
- **Phase C1 — bulk/range track entry.** A `tracks` item can now carry a `recurrence`
  (`start_date`/`end_date` + optional `weekdays`) or an explicit `dates[]` instead of a
  single `date`. The diary prompt tells Claude to emit ONE recurring entry for habits
  repeated over a span ("meditated every morning for 3 weeks") rather than many rows.
  `saveDiaryExtraction` expands these into one `tracks` row per matching date using new
  `expandDateRange`/`weekdayNums` helpers in `src/lib/dates.ts` (capped at 366 days,
  reversed-range safe, TZ-safe via local Y-M-D formatting). Value/name/notes apply to
  every occurrence. No schema migration (still v3). Verified the date-expansion logic
  directly; full dictation path needs the user's live API key in-browser.
- Added planning files `docs/PLAN.md` + `docs/DEVLOG.md` + `STATUS.md`.
- **Dropbox replaces Nextcloud** (commit: dropbox migration). New `src/sync/dropbox.ts`
  (OAuth PKCE, refresh→access token cache, pull/push `health.db`, photo upload, `rev`
  versioning). Rewired `manager.ts` + `App.tsx` (OAuth redirect). Settings has a
  Connect/Disconnect Dropbox flow with in-app setup steps. `nextcloud.ts` deleted.
  Verified core sync mechanics with a mocked Dropbox API. Real connect needs the
  user's Dropbox app key (one-time App Console setup).
- **Phase B done** (commit: phase B). Schema v2→v3:
  - B1: new `tracks` table (meditation/joints/weight/custom activities) routed by Claude
    extraction; generic Insights line charts with a fitted Y-axis; weight is a track.
  - B2: `activities.recovery_checked` flag; Log tab shows next-day "Recovery check-in"
    cards for workouts from the last 1–4 days; Save appends a recovery note, "No issues"
    dismisses.
  - B3: Recent entries expand to show saved structured detail; "Edit & re-analyze" loads
    the entry back into the input (replaces it on save); fixes dictation errors.
  - Verified in-browser: tracks insert + charts, v2→v3 migration, check-ins, entry edit.

## 2026-07-10 — Phase A (commit ca08389, deployed)
- Settings "Where your data lives" panel; Log Q&A improvements (persistent answers,
  correction box, back-to-questions); meal inline ingredient editing + off-photo items;
  stopped asking about same-day workout soreness.
- Confirmed Nextcloud provider blocks browser CORS on both account and public-share
  WebDAV (curl OPTIONS probe) → auto-sync impossible there.

## 2026-07-08 — Phase 1 build + GitHub Pages
- Initial PWA: Log + Meals tabs, SQLite/IndexedDB, export/import, minimal Insights.
- Fixed blank-page crash (unvalidated DB replace) + added ErrorBoundary.
- Fixed Nextcloud URL handling; later found provider CORS wall is unfixable.
- Repo made public; live at https://leunammih.github.io/health-tracker/.
- Added backfill dates + delete buttons (entries cascade-delete their rows).
