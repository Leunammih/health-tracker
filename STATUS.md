# STATUS

Quick-start context for a fresh session. Full roadmap: `docs/PLAN.md`. Change log: `docs/DEVLOG.md`.

_Last updated: 2026-07-11_

## What this is
Private iPhone-first PWA (Vite + React + TS + Tailwind), no backend. Local SQLite (sql.js)
in IndexedDB, Claude API called from the browser, **Dropbox** sync (OAuth PKCE).
Live: https://leunammih.github.io/health-tracker/ — pushing to `main` auto-deploys.

## Done ✅
- **Phase A** — storage-location panel, Log Q&A improvements, meal inline editing, delayed soreness.
- **Dropbox sync** — replaced Nextcloud. Code complete + verified with a mocked API.
- **Phase B** — B1 generic `tracks` table + weight + Insights charts; B2 next-day soreness
  check-ins; B3 tap-to-view/edit a saved entry. Schema at **v3** (migrations in
  `src/db/sqlite.ts` `runMigrations`, PRAGMA-guarded).

## Open / needs the user (not code)
- **Connect Dropbox (one-time):** register a Dropbox app — App Console → Create app →
  Scoped access → App folder → enable `files.content.read` + `files.content.write` →
  add Redirect URIs `https://leunammih.github.io/health-tracker/` **and**
  `http://localhost:5199/` → copy the **App key** → paste in the app's Settings → Dropbox
  sync → **Connect**. Until then sync is off (app still works locally; export/import is the manual fallback).

## Not started — for new sessions
- **Phase C:** (1) bulk/range entry by dictation ("meditated every morning for 3 weeks" →
  expand to dated `tracks` rows); (2) calorie/protein goals + progress display;
  (3) supplements (start date, composition via photo or name, periodic re-check reusing the
  B2 check-in queue pattern).
- **Phase D:** eating-pattern quick-adds by time of day (client-side frequency over `meals`).

## Exact next step
Start **Phase C item 1 — bulk/range entry**. It rides on the existing generic `tracks`
table (B1) and the Claude extraction pipeline. Plan:
1. In `src/ai/schemas.ts`, extend the `tracks` item schema (or add a sibling) so Claude can
   emit either a single date OR a recurrence (e.g. `{start_date, end_date, weekdays?}` or an
   explicit `dates: string[]`).
2. In `src/ai/prompts.ts`, tell Claude to expand ranges ("every morning for 3 weeks",
   "on Mon/Wed/Fri") into the recurrence fields rather than one row.
3. In `src/db/queries.ts` `saveDiaryExtraction`, expand a recurrence into one `tracks` row
   per date (add a small date-range helper in `src/lib/dates.ts`).
4. Verify: dictate a range, confirm N dated rows land and show on the Insights chart.

## Dev hygiene
After a schema change: `rm -rf node_modules/.vite` and, in the browser test tab,
`indexedDB.deleteDatabase('ht-store')` before re-testing. Always run
`npx tsc -b --noEmit && npm run build` before committing.
