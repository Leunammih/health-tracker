# Health Tracker

A private, iPhone-first PWA for tracking activities & muscle aches, gut episodes, infections, energy/mood, day context, and nutrition — with Claude sorting your voice diary, estimating meal macros from photos, and surfacing patterns.

Everything runs client-side. Your data lives in a local **SQLite** database on the device and syncs to your **Nextcloud** folder. Your Anthropic API key stays on the device.

## Stack

- Vite + React + TypeScript + Tailwind, installable PWA (`vite-plugin-pwa`)
- `sql.js` (SQLite in WebAssembly), cached in IndexedDB, synced to Nextcloud over WebDAV
- `@anthropic-ai/sdk` called directly from the browser (single-user, own key)
- Recharts for the Insights tab

## Tabs

- **Log** — dictate your day (iOS keyboard mic); Claude sorts it into activities / gut / infections / energy-mood / day-context and asks follow-ups for anything important you missed.
- **Meals** — photograph a meal; Claude estimates ingredients + calories/protein/fat/carbs/fiber and asks to confirm portions.
- **Insights** — energy/mood, stress, gut/infection counts, daily calories & macro averages.
- **Patterns** — Claude reviews recent data for correlations (e.g. anticipatory stress → infection/gut, warming-bottle vs stress).
- **Settings** — API key, model, Nextcloud sync, and data export (.db / JSON / CSV / copy-to-clipboard).

## Local development

```bash
npm install
npm run dev
```

Open the printed URL. In **Settings**, paste your Anthropic API key. (Camera + dictation need HTTPS or `localhost`.)

## Nextcloud sync setup

1. In Nextcloud, install and enable the **WebAppPassword** app (adds the CORS headers a browser needs for WebDAV).
2. Create a dedicated **app password**: Nextcloud → Settings → Security → Devices & sessions.
3. In the app’s **Settings** tab: enable sync, enter your **server URL** (just the domain, e.g. `https://cloud.example.com` — if your provider gave you a full WebDAV link instead, that's fine too, only the domain part is used), username, the app password, and a folder path (e.g. `/HealthTracker`), then **Test connection**. On success it shows the exact URL it's using — check that it looks right.

The app pulls the latest `health.db` on open and pushes changes back after you save. Single user → last-write-wins.

**If sync keeps failing (shows "Offline" even with correct details):** some Nextcloud providers — especially managed/hosted plans — never send the CORS headers a browser needs, and there's no user-facing setting to fix that (confirmed by probing the WebDAV endpoint directly: no `Access-Control-Allow-Origin` header on any response, even with the WebAppPassword app in theory enabled). In that case automatic sync cannot work from the browser at all. Use the manual fallback instead: Settings → **Export .db** on one device, save the file into your Nextcloud folder (e.g. via the Nextcloud iOS app or Files app), then Settings → **Import .db** on the other device to load it. This still keeps everything serverless and works with any storage provider.

## Deploy to GitHub Pages (install on iPhone)

1. Push this repo to GitHub with a `main` branch.
2. Repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The included workflow builds and deploys on every push (base path is set to `/<repo>/` automatically).
4. On the iPhone, open the Pages URL in Safari → **Share → Add to Home Screen**. Launch it from the home screen for a full-screen app with camera + dictation.

## Data & privacy

- The Anthropic key and Nextcloud credentials are stored in the device’s `localStorage`.
- Health data never leaves your device except: the text/photo sent to Anthropic for analysis, and the `health.db` synced to your own Nextcloud.
- Export anytime from Settings; the `.db` file opens in any SQLite tool and can be handed to Claude directly.

## Roadmap

- **Phase 2:** richer Insights (symptom overlays, correlation views) and auto-run interpretation.
- **Phase 3:** background analysis, more metrics, iteration.
