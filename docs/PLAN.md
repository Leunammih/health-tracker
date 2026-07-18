# Health Tracker — Plan & Status

Living roadmap. Update the checkboxes and the DEVLOG when work lands so we never
have to reconstruct state from chat. Dates are absolute.

## Architecture (current)
- Pure client-side PWA (Vite + React + TS + Tailwind), no backend.
- Local SQLite via sql.js (WASM), cached in IndexedDB.
- Cloud sync: **Dropbox** (browser OAuth PKCE + CORS-friendly API). *(Replaced
  Nextcloud on 2026-07-11 — that provider blocked browser CORS entirely.)*
- Claude API called directly from the browser with the user's on-device key.
- Live at https://leunammih.github.io/health-tracker/ — auto-deploys on push to `main`.

## Decisions (locked)
- Generic `tracks` table for new categories (meditation, joints, weight, …) — not
  per-type tables. Additive; existing tables untouched.
- Supplement composition from Claude knowledge first; web search only if needed.
- Eating "learning" = client-side frequency, not ML.
- Sync = Dropbox. Nextcloud removed. Manual export/import stays as a fallback.

---

## Phase A — quick wins  ✅ DONE (2026-07-10, commit ca08389)
- [x] Settings "Where your data lives" panel (on-device storage, size, last-saved, backup reminder)
- [x] Log Q&A: persistent answers on back-nav; "anything else / correction" box; Back-to-questions
- [x] Stop asking about same-day workout soreness (DOMS is delayed)
- [x] Meals: inline-editable ingredient rows; "items not in the photo" field; unified re-estimate

## Dropbox migration  ✅ DONE (2026-07-11, code complete; needs user's app key to connect)
- [x] `src/sync/dropbox.ts` — OAuth PKCE, pull/push `health.db`, photo upload, rev versioning
- [x] Rewrite `src/sync/manager.ts` to use Dropbox (same public interface)
- [x] OAuth redirect handling on app startup (`?code=` → token exchange, cleans URL)
- [x] Settings: Dropbox connect + app key + status/disconnect + in-app setup steps
- [x] Remove `src/sync/nextcloud.ts`; NutritionTab photo upload → Dropbox
- [x] Update storage-panel + README copy (Nextcloud → Dropbox)
- **User action still required (one-time):** register a Dropbox app (Scoped, App folder,
  enable `files.content.read`/`write`), add redirect URIs (the deployed Pages URL + `http://localhost:5199/`),
  copy the **App key** into Settings → Dropbox sync → Connect. Until then sync stays off; app works fine locally.

## Phase B — foundations  ✅ DONE (2026-07-11)
- [x] B1 Generic `tracks` table + extraction routing + generic Insights charts (fitted Y-axis); **weight** as a track
- [x] B2 Next-day soreness check-ins on the Log tab (`recovery_checked` flag; record/dismiss)
- [x] B3 Tap a Recent entry → view saved details → Edit & re-analyze (replaces the entry)

## Phase C — in progress
- [x] C1 Bulk/range entry by dictation ("meditated every morning for 3 weeks") — track
  items carry an optional `recurrence` (start/end + weekdays) or explicit `dates[]`;
  `saveDiaryExtraction` expands them into one `tracks` row per date via
  `expandDateRange`/`weekdayNums` in `src/lib/dates.ts` (2026-07-11)
- [x] C2 Insights: combined meditation/breath-work, movement, and pain/discomfort
  charts with tap-to-see-detail (value, time of day, notes). `tracks` gained a `time`
  column (schema v4); pain/discomfort now also logs a standalone "stomach pain" track
  and is asked about as a follow-up question, same as energy/mood (2026-07-18)
- [ ] Calorie/protein goals + progress display
- [ ] Supplements (start date, composition via photo/name, periodic re-check via B2 queue)

## Phase D — later / data-dependent
- [ ] Eating-pattern quick-adds by time of day
- [ ] (sync already solved via Dropbox)

---

## Dev hygiene notes
- After a schema change: clear the Vite dep cache (`rm -rf node_modules/.vite`) and
  the browser IndexedDB (`indexedDB.deleteDatabase('ht-store')`) before re-testing.
- Schema migrations live in `runMigrations()` in `src/db/sqlite.ts` (PRAGMA-guarded).
- Verify each chunk: `npx tsc -b --noEmit` + `npm run build`, then browser-drive the flow.
