# Claude Design prompt — Health Tracker app UI kit

Paste the block below into the **MindBodyWorkFlow Design System** project on
claude.ai/design (not a fresh project — it needs the existing tokens).

---

I'm designing the UI for a private, single-user, iPhone-first health-tracking PWA.
Build it as a new `ui_kits/app` alongside the existing `ui_kits/website`.

## Follow the MindBodyWorkFlow design system

Use this project's existing tokens — ink-teal ground, cream text, sage muted, ember
accent — its typefaces (Cormorant Garamond for display, Jost for UI), and its
`.parchment` light world. The app should be recognisably the same brand as the website.

**Three deliberate departures, all required:**

1. **App-scale type ramp.** The website ramp is marketing-scale (h1 up to 112px). This
   is a 390px-wide phone app. Give me roughly a 12–28px ramp, keeping the same
   typefaces and the same tracking/leading relationships. Inputs must be at least 16px
   or iOS zooms on focus.

2. **Chart colours are exempt from the ember-only accent rule.** The app plots ~20
   distinguishable health metrics; one accent cannot encode that many categories. Brand
   governs all chrome — surfaces, text, buttons, cards, nav, the report layer. The data
   layer gets its own extended categorical palette, derived to sit on the ink-teal
   ground and harmonise with ember rather than fight it.

3. **Self-host the fonts.** No CDN `@import` — this is an offline-capable PWA.

## Who uses it, and in what state

One person. Often **while feeling unwell** — mid gut episode, during an infection, or in
a post-exertional crash. In bed, at night, one-handed. That should drive the design more
than any trend:

- Logging must survive low energy, low patience, shaky hands. Big targets, few taps. No
  gesture-only path to any action.
- Nothing celebratory, gamified, or streak-based. A missed day is usually a sick day —
  the UI must never make illness read as failure.
- Calm and restrained, not motivating. This is not a fitness app.
- Primary controls belong in the lower half of the screen, within thumb reach.

## Constraints

- 390×844 (iPhone 14 Pro). Dark is the default; also show the parchment light variant.
- Tailwind-compatible output — I'll port tokens into `tailwind.config.js` and a Tailwind
  `@layer components` block.
- Safe-area padding top and bottom.
- No external network dependency of any kind.

## Components

**Foundations:** type scale, colour tokens, elevation, radii, spacing.

**Components:**
- card
- buttons — primary, ghost, destructive, each including disabled
- text field, select
- **slider row** — the app's most-used control: colour dot + label + current value +
  unit + range slider + "Add note" + "Save". Give it the most attention.
- chip / segmented range selector (14d / 30d / 90d)
- horizontal 7-day strip — selected state, plus dot markers under days holding data
- stat tile (big number + caption)
- list row with trailing Edit / Delete — **must hold a 4-line wrapping title**
- 5-item bottom tab bar
- banner / callout, empty state
- **recovery check-in card** — a gentle prompt asking how an activity from a few days
  ago has felt since, with a per-activity row (name · duration · date), a free-text
  field, and two actions: "Save" and "No issues". This is the app's most important
  card — it's how the delayed-soreness question gets answered. It must feel like a
  caring question, never a nagging task, and it's answered by someone who may currently
  feel awful.
- **long-form report typography** — a generated markdown analysis: headings, bold,
  italic, bullets, a metadata line. Currently an unstyled wall of grey text. Make it
  scannable while unwell: someone should skim it in ten seconds, then read one bullet
  properly without losing their place.

## Chart system — the part I most need help with

Six charts on a dark surface: energy & mood (dual series), stress load, illness & gut
(step line + scatter + threshold), movement, meditation/breath work, pain.

**Two hard rules, never break either:**

1. **Good is always at the top.** Metrics where low is good — pain, stress, illness —
   render on a reversed Y axis.
2. **Series identity, never rank.** A given activity keeps the same hue in every chart.

**The palette must be a rule, not a fixed set.** Metric names arrive by voice dictation,
so new ones appear over time — "Muscle Soreness", "Muscle Stiffness", "Shaking" all
showed up this way. Give me four group hue families (movement / practice / symptom /
wellbeing) and a deterministic way to place an arbitrary new name inside its family so
it stays distinguishable from its siblings. Show it working with ~6 members in one
family. It must hold up on the ink-teal ground and stay legible at 2px line weight.

Include the chart frame: axes, gridlines, legend, tooltip.

**Also give me a visual answer for "no data" vs "a value of zero."** These currently look
identical and mean opposite things — a sick day with nothing logged is not a day of zero
movement.

## Real-content robustness

Show every component with realistic worst-case content, not lorem placeholder:

- List rows with a 4-line title ("Homemade Nut & Seed Cereal with Rice Milk") next to a
  number and two trailing actions.
- Charts where data covers only the most recent 40% of the selected range — what should
  the empty leading region look like? Don't just leave it blank.
- A tap-to-log grid of 20+ items, which is what it actually holds.

## Deliverable

Every component with its states on one canvas, both dark and parchment, plus the token
values as copyable CSS custom properties or a Tailwind theme block.
