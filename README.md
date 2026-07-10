# Health Tracker

A private, iPhone-first PWA for tracking activities & muscle aches, gut episodes, infections, energy/mood, day context, and nutrition — with Claude sorting your voice diary, estimating meal macros from photos, and surfacing patterns.

Everything runs client-side. Your data lives in a local **SQLite** database on the device and syncs to your **Dropbox** (App folder). Your Anthropic API key stays on the device.

## Stack

- Vite + React + TypeScript + Tailwind, installable PWA (`vite-plugin-pwa`)
- `sql.js` (SQLite in WebAssembly), cached in IndexedDB, synced to Dropbox via its browser API (OAuth PKCE)
- `@anthropic-ai/sdk` called directly from the browser (single-user, own key)
- Recharts for the Insights tab

## Tabs

- **Log** — dictate your day (iOS keyboard mic); Claude sorts it into activities / gut / infections / energy-mood / day-context and asks follow-ups for anything important you missed.
- **Meals** — photograph a meal; Claude estimates ingredients + calories/protein/fat/carbs/fiber and asks to confirm portions.
- **Insights** — energy/mood, stress, gut/infection counts, daily calories & macro averages.
- **Patterns** — Claude reviews recent data for correlations (e.g. anticipatory stress → infection/gut, warming-bottle vs stress).
- **Settings** — API key, model, Dropbox sync, and data export (.db / JSON / CSV / copy-to-clipboard).

## Local development

```bash
npm install
npm run dev
```

Open the printed URL. In **Settings**, paste your Anthropic API key. (Camera + dictation need HTTPS or `localhost`.)

## Dropbox sync setup

The app syncs `health.db` to a Dropbox **App folder** using browser-side OAuth (PKCE — no server, no client secret). One-time setup:

1. Open the Dropbox **App Console** (dropbox.com/developers/apps) → **Create app** → *Scoped access* → *App folder* → name it (e.g. `HealthTracker`).
2. On the **Permissions** tab, enable `files.content.write` and `files.content.read`, then **Submit**.
3. On the **Settings** tab, add your app URL as a **Redirect URI** (both the deployed URL, e.g. `https://<user>.github.io/health-tracker/`, and `http://localhost:5199/` for local dev).
4. Copy the **App key**. In the app's **Settings** tab, paste it under *Dropbox sync* and click **Connect Dropbox** — you'll approve access once, then it stays connected (refresh token stored on-device).

The app pulls the latest `health.db` on open and pushes changes back after you save (Dropbox `rev` is the version marker; single user → last-write-wins). **Export / Import .db** remains as a manual alternative.

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
