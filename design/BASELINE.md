# UI baseline — pre-redesign functional contract

Captured on branch `redesign/ui` at commit `d00930f`, viewport 390×844 (iPhone 14 Pro),
dev server `localhost:5199`.

This is the regression checklist. After the redesign, every control listed here must
still exist and still work. Anything missing is a bug, not a design decision.

## Global chrome
- Header: tab title (left), `SyncBadge` "Sync off" + dot (right), tappable → "Tap to sync now"
- Amber banner: "Add your Anthropic API key in Settings…" → jumps to Settings
- Bottom tab bar, 5 items: Log · Meals · Insights · Patterns · Settings
- Active tab = brand teal (icon + label); inactive = ink-400
- Safe-area padding top and bottom (`.safe-top` / `.safe-bottom`)

## Log
- "Dictate or type your day" card
- LOGGING FOR + 7-day `DayStrip`, selected day = filled teal pill, dot markers under days with data
- Native date input (`21.07.2026`) + "or swipe the strip above"
- "This covers more than one day" checkbox → reveals multi-day range
- Free-text textarea (dictation via keyboard mic)
- "Process with Claude" primary button (disabled without API key)
- Explainer text under the button
- QUICK ENTRY panel: per-metric rows grouped by section (MOVEMENT, …), each with
  colour dot, label, "saved" state, value + unit, range slider, "Add note" + "Save"
- Sliders start at last value; nothing written until Save is tapped

## Meals
- "Photograph a meal" primary button (camera icon)
- "Dictate a meal" ghost button (mic icon)
- Explainer text
- RECENT MEALS list — per row: title, date + photo glyph, kcal, macro line
  (P/F/C/Fb), "Edit", "Delete" (red)

## Insights
- Range selector chips: 14d / 30d / 90d — active = teal outline
- TAP TO LOG grid: 17 metrics, each a coloured dot + label, tappable to log
  (Exercise, Dancing, Biking, Walking, Running, Stretching, Swimming, Yoga,
  Meditation, Breath work, Knee/Wrist/Back/Shoulder/Stomach pain, Release)
- Stat tiles row: Gut episodes · Infections · Warming bottle
- ENERGY & MOOD chart: dual Y-axis (0–10 left, 0–100 inverted right), 3 series
  (Energy, Mood, Release), legend below
- Further charts below the fold: plateau/movement, illness, pain

## Patterns
- Explainer card
- Range `<select>` ("Last 30 days") + "Analyse now" primary button
- Empty state: "No interpretations yet…"

## Settings
- CLAUDE API: API key field (password-ish), "Stored only on this device.", model `<select>`
- DROPBOX SYNC: numbered setup instructions incl. **the exact redirect URI
  `http://localhost:5199/`** — the dev port is load-bearing, do not change it
- Dropbox app key field, "Connect Dropbox" button
- "Save settings" button
- (further items below the fold — export/danger zone)

## Colour tokens in use today
- `brand` teal 50→800, primary `#0d9488` / hover `#14b8a6`
- `ink` 300→900, page bg `#0b1120`, card bg `ink-800`, border `ink-700`
- Chart series use their own hardcoded palette (see `src/lib/metrics.ts`)
- Dark mode only — `color-scheme: dark`, no light theme
