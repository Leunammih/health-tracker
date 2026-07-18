# Dev Log

Reverse-chronological log of what changed and why. Keep entries short. See PLAN.md
for the roadmap and status checkboxes.

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
