# Dev Log

Reverse-chronological log of what changed and why. Keep entries short. See PLAN.md
for the roadmap and status checkboxes.

## 2026-07-11
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
