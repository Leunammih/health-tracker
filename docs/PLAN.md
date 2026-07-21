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
- [x] Meals: dictated entries (pick a date, describe verbally/by typing, Claude
  estimates macros via `analyseMealText`) alongside photos; `meals` gained
  `source`/`notes` columns (schema v5); Recent meals rows gained an Edit button to
  correct a saved meal in place and attach/replace a photo after the fact (2026-07-18)
- [ ] Calorie/protein goals + progress display
- [ ] Supplements (start date, composition via photo/name, periodic re-check via B2 queue)

## Phase D — Insights / Logs / Meals overhaul  (planned 2026-07-21)

Built in four chunks, each committed and reviewed before the next.

### Decisions (locked, from the user 2026-07-21)
- **Release 💦**: a track logged in 10% steps. Axis runs **0% at top → 100% at bottom**.
  Defaults to a constant 0% line; only days with an explicit entry spike down. The value
  is the *intensity* of the release (100% = full).
- **Log date navigation**: a swipeable horizontal **day strip** (chips you flick with a
  thumb), not an `<input type=range>`. Chips mark which days already have entries.
- **Infection carry-forward**: severity carries forward indefinitely from the last entry
  **until explicitly logged as gone / 0**. No auto-expiry.
- **Good is always at the top.** Metrics where low = good (pain, stress, infection,
  gut, release) render on a **reversed** Y axis. Movement/practice/energy stay normal.

### D1 — Foundation (data + shared primitives)
- [ ] `dateSpine()` in `src/lib/dates.ts` — every ISO date in a range, so all charts
  share one X axis even on days with no entry
- [ ] New `src/lib/metrics.ts` — single source of truth for: canonical track name →
  colour (exercise yellow, dancing blue, biking green, …), axis polarity
  (lower-is-better set), and the quick-log item registry (label, category, unit,
  min/max/step) used by both Insights tap-to-log and the Log tab quick-add
- [ ] `Release` as a first-class track: `'release'` added to `TrackCategory` and to the
  extraction enum so Claude can also route it from dictation
- [ ] Query primitives: `upsertTrackValue()` (one row per name+date, replaces),
  `distinctTrackNames()`, `lastTrackValueOnOrBefore()` (powers carry-forward + the
  "default to yesterday's value" slider)

### D2 — Insights
- [ ] **Plateau chart** for exercise & movement: rounded-corner step line per activity,
  continuous left→right, sitting at 0 on days not done, rising to that day's minutes.
  One colour per activity from the D1 registry. Combines `activities` (workouts) and
  movement-category `tracks`
- [ ] **Tap a tracked item → log it**: tapping any series (knee pain, breath work,
  dancing…) opens an add/edit sheet — pick a day, drag a slider for minutes or 0-10
  severity, confirm, then pick another day without closing. Includes "same as today"
  and "yesterday same as today" shortcuts
- [ ] **Illness chart**: infections + gut pain + stool consistency on one chart, with
  infection severity carried forward per the locked decision
- [ ] **Good-at-top polarity** applied across every chart
- [ ] **Shared date axis** on all charts including calories, so days line up vertically
  and are readable as one stacked column

### D3 — Logs
- [ ] Swipeable day strip for the entry date (keeps the existing date field as a fallback)
- [ ] **Multi-day entry toggle** — tells the extractor the text covers several days
- [ ] **Expanded quick-entry panel**: last week's logs grouped by category (health,
  movement, practice…), each with a 5-min-increment slider defaulting to the previous
  day's value
- [ ] **Quick-add section** — tap a field to add a new item for the selected day, same
  5-min increments
- [ ] **Release 💦** as a 10%-increment quick-log, surfaced on the energy & mood chart

### D4 — Meals
- [ ] Multi-meal dictation: detect breakfast/lunch/dinner (and multi-day spans) in one
  dictation and emit several meals instead of one
- [ ] **Multi-entry toggle** on the meal form so the text is scanned for several meals

## Phase E — later / data-dependent
- [ ] Eating-pattern quick-adds by time of day
- [ ] (sync already solved via Dropbox)

---

## Dev hygiene notes
- After a schema change: clear the Vite dep cache (`rm -rf node_modules/.vite`) and
  the browser IndexedDB (`indexedDB.deleteDatabase('ht-store')`) before re-testing.
- Schema migrations live in `runMigrations()` in `src/db/sqlite.ts` (PRAGMA-guarded).
- Verify each chunk: `npx tsc -b --noEmit` + `npm run build`, then browser-drive the flow.
