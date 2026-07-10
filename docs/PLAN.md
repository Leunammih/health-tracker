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

## Dropbox migration  — IN PROGRESS (2026-07-11)
- [ ] `src/sync/dropbox.ts` — OAuth PKCE, pull/push `health.db`, photo upload, rev versioning
- [ ] Rewrite `src/sync/manager.ts` to use Dropbox (same public interface)
- [ ] OAuth redirect handling on app startup (`?code=` → token exchange)
- [ ] Settings: replace Nextcloud fields with Dropbox connect + app key + status
- [ ] Remove `src/sync/nextcloud.ts`; update NutritionTab photo upload
- [ ] Update storage-panel + README copy (Nextcloud → Dropbox)
- Setup the user must do once: register a Dropbox app (App folder, files.content.read/write),
  add redirect URIs (Pages URL + localhost), paste the **App key** in Settings, click Connect.

## Phase B — foundations
- [ ] B1 Generic `tracks` table + extraction routing + generic Insights chart; **weight** as a track
- [ ] B2 Deferred-prompt queue → next-day soreness check-ins on the Log tab
- [ ] B3 Tap a Recent entry → view saved details → edit text & re-analyze (fix dictation errors)

## Phase C — later
- [ ] Bulk/range entry by dictation ("meditated every morning for 3 weeks")
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
