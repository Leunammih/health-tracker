# Health Tracker (PWA)

Private, iPhone-first PWA: activities & muscle aches, gut episodes, infections, energy/mood, nutrition. Claude sorts voice-diary entries and estimates meal macros. See README.md for full feature list.

## Stack
- Vite + React + TypeScript + Tailwind, `vite-plugin-pwa`
- `sql.js` (SQLite in WASM) → IndexedDB, synced to **Dropbox** (OAuth PKCE; the old
  Nextcloud/WebDAV path is gone)
- `@anthropic-ai/sdk` called client-side (single user, own key); Recharts for Insights
- Live at https://leunammih.github.io/health-tracker/ — pushing to `main` auto-deploys

## Commands
- `npm run dev` — local dev (camera/dictation need HTTPS or localhost)
- `npm run build` — production build to `dist/`

## Conventions
- Everything stays client-side; no server. API key and health data never leave the device except to Dropbox/Anthropic.
- The app exists to answer real open health questions (e.g. delayed-soreness/PEM timing after exertion) — when adding tracking fields, check they serve a question in STATUS.md.
- Commit after each working feature; update STATUS.md at session end.

## Session workflow (standing instruction — follow every iteration)

One iteration = one feature. Repeat this loop without being asked:

1. **Build it** — verify in-browser yourself (Browser pane, both themes, seeded data via
   DEV-only `window.__ht`). Never hand over something unverified.
2. **`npx tsc -b --noEmit && npm run build`**, then **commit and push to `main`** — don't
   ask permission to push. The deploy *is* how Immanuel tests, so unpushed work is
   untestable work.
3. **Write the phone checklist** into STATUS.md under **"Check on your phone (current)"**
   — replace the previous iteration's list, don't accumulate them. Then repeat that same
   list in chat: numbered, concrete taps ("Settings → scroll past the orange Save
   settings button → …"), each with the exact expected result, plus what a failure would
   look like. No vague "check that it works".
4. **Stop and wait.** Do not start the next feature until he reports back.
5. **On his reply** — fix anything he reports, then move to the next item under "Exact
   next step" and start again at 1.

He is testing on a real iPhone against real data, so name what's genuinely new versus
what should be unchanged — a regression matters more than a missing nicety.
