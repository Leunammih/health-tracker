# Dev Log

Reverse-chronological log of what changed and why. Keep entries short. See PLAN.md
for the roadmap and status checkboxes.

## 2026-07-11
- Started: replace Nextcloud sync with **Dropbox** (browser OAuth PKCE, CORS-friendly
  API) + Phase B (generic tracks/weight, next-day soreness check-ins, entry view/edit).
- Added planning files `docs/PLAN.md` + `docs/DEVLOG.md` so state persists in-repo.

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
