# STATUS

Quick-start context for a fresh session. Full roadmap: `docs/PLAN.md`. Change log: `docs/DEVLOG.md`.

_Last updated: 2026-07-18_

## What this is
Private iPhone-first PWA (Vite + React + TS + Tailwind), no backend. Local SQLite (sql.js)
in IndexedDB, Claude API called from the browser, **Dropbox** sync (OAuth PKCE).
Live: https://leunammih.github.io/health-tracker/ — pushing to `main` auto-deploys.

## Done ✅
- **Phase A** — storage-location panel, Log Q&A improvements, meal inline editing, delayed soreness.
- **Dropbox sync** — replaced Nextcloud. Code complete + verified with a mocked API.
- **Phase B** — B1 generic `tracks` table + weight + Insights charts; B2 next-day soreness
  check-ins; B3 tap-to-view/edit a saved entry.
- **Phase C1** — bulk/range track entry by dictation. A track item can carry a
  `recurrence` (start/end + optional weekdays) or explicit `dates[]`; `saveDiaryExtraction`
  expands it into one `tracks` row per date (`expandDateRange`/`weekdayNums` in
  `src/lib/dates.ts`).
- **Phase C2** — Insights: combined "Meditation & breath work", "Movement" (dancing/
  stretching/biking/walking), and "Pain & discomfort" (any symptom-category track,
  e.g. stomach/knee/shoulder/wrist) multi-line charts, each a fixed-order categorical
  palette merged by date. Tapping a point shows a persistent detail panel (value, time
  of day, notes) via a custom clickable dot — see `MultiTrackChart` in
  `src/tabs/InsightsTab.tsx`. `tracks` gained a `time` column (schema **v4**); the diary
  prompt now captures time-of-day + method/teacher notes for practices, logs a one-off
  stomach ache as a standalone `tracks` "stomach pain" symptom, and asks about
  unmentioned stomach/joint pain as a follow-up question. Verified in-browser by
  seeding `tracks` rows directly (no live API key in this session).
- **Meals: dictated entries + edit** — NutritionTab now has "Dictate a meal" (pick a
  date, type/dictate a description, Claude estimates macros via `analyseMealText`)
  alongside the existing photo flow. Recent meals rows have an **Edit** button next to
  Delete, opening the same review form pre-filled for in-place correction, including
  attaching/replacing a photo after the fact. `meals` gained `source`/`notes` columns
  (schema **v5**). Verified in-browser end-to-end with a temporary mock (no live key).

## Open / needs the user (not code)
- **Connect Dropbox (one-time):** register a Dropbox app — App Console → Create app →
  Scoped access → App folder → enable `files.content.read` + `files.content.write` →
  add Redirect URIs `https://leunammih.github.io/health-tracker/` **and**
  `http://localhost:5199/` → copy the **App key** → paste in the app's Settings → Dropbox
  sync → **Connect**. Until then sync is off (app still works locally; export/import is the manual fallback).

## Not started — for new sessions
- **Phase C:** ~~(1) bulk/range entry~~ ✅; (2) calorie/protein goals + progress display;
  (3) supplements (start date, composition via photo or name, periodic re-check reusing the
  B2 check-in queue pattern).
- **Phase D:** eating-pattern quick-adds by time of day (client-side frequency over `meals`).

## Exact next step
Start **Phase C item 2 — calorie/protein goals + progress display**. Meals already store
macros (`src/db/queries.ts`, `meals` table). Plan:
1. Store daily goals (calories, protein) — a small settings/prefs store (localStorage or a
   1-row `settings` table); add a Settings input for them.
2. Sum today's `meals` macros and show progress (bar/ring) against the goals — likely on
   NutritionTab and/or InsightsTab.
3. Verify in-browser: set goals, log meals, confirm progress updates.

**Verify C1 first (needs the user):** dictate a range ("meditated every morning for the
last 3 weeks, 20 min"), confirm ~21 dated `tracks` rows land and show on the Insights
meditation chart.

## Dev hygiene
After a schema change: `rm -rf node_modules/.vite` and, in the browser test tab,
`indexedDB.deleteDatabase('ht-store')` before re-testing. Always run
`npx tsc -b --noEmit && npm run build` before committing.
