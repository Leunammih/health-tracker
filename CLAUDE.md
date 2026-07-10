# Health Tracker (PWA)

Private, iPhone-first PWA: activities & muscle aches, gut episodes, infections, energy/mood, nutrition. Claude sorts voice-diary entries and estimates meal macros. See README.md for full feature list.

## Stack
- Vite + React + TypeScript + Tailwind, `vite-plugin-pwa`
- `sql.js` (SQLite in WASM) → IndexedDB, synced to Nextcloud via WebDAV
- `@anthropic-ai/sdk` called client-side (single user, own key); Recharts for Insights

## Commands
- `npm run dev` — local dev (camera/dictation need HTTPS or localhost)
- `npm run build` — production build to `dist/`

## Conventions
- Everything stays client-side; no server. API key and health data never leave the device except to Nextcloud/Anthropic.
- The app exists to answer real open health questions (e.g. delayed-soreness/PEM timing after exertion) — when adding tracking fields, check they serve a question in STATUS.md.
- Commit after each working feature; update STATUS.md at session end.
