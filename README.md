# Pulse Desk — Offline Health Dashboard PWA

A fully offline-capable mobile Progressive Web App for personal health tracking, with an optional AI health coach. Built with vanilla HTML, CSS, and JavaScript — zero build step, zero dependencies. Deploys to Netlify as a static site.

## Features

### Five fully functional screens

- **HOME** — Bento dashboard with seven live widgets (heart rate, sleep score, energy, hydration, recovery battery, activity rings, step counter). All widgets read today's entries from IndexedDB.
- **STATS** — 7- or 30-day SVG mini-charts for every metric: heart avg BPM, sleep score, hydration (with goal line), steps (with goal line), kcal net, recovery percent.
- **LOG** — full-screen hub with a metric picker and entry form for every metric, plus a recent-entries list with swipe-to-delete. A floating **+** FAB opens the same forms from any screen in a bottom sheet.
- **PROFILE** — streak counter, all-time entry count, display name, editable daily goals (hydration / steps / calories), and today-at-a-glance summary.
- **SETTINGS** — OpenRouter API key + model picker, JSON export/import (with optional API-key inclusion), clear-all-data, and about.

### Log any metric

- HEART RATE · BPM + rest/active context
- SLEEP · score, duration, optional stage minutes (deep/rem/light/awake)
- FOOD · name + kcal
- BURN · activity + kcal
- HYDRATION · quick 250 / 500 / 750 ml tiles or custom
- RECOVERY · body-battery %, optional HRV
- ACTIVITY RINGS · three sliders for move / exercise / stand
- STEPS · quick tiles or custom count

### Optional AI Health Coach (OpenRouter)

- Entirely optional — the app is fully functional without a key.
- Settings links to [openrouter.ai/workspaces/default/keys](https://openrouter.ai/workspaces/default/keys) to grab a key.
- Choose from **Gemini 3 Flash Preview** (recommended), **Grok 4.1 Fast** (cheapest), or **Gemini 2.5 Flash** (popular).
- When a key is saved, a Daily Tip card appears at the top of Home.
- Tap the card to open a streaming chat with the coach (persistent history in IndexedDB).
- System prompt is auto-populated with today's goals and metrics so the coach gives grounded advice.

### Offline-first

- Service worker pre-caches every static asset (`index.html`, `styles.css`, `app.js`, `db.js`, `ai.js`, icons, manifest).
- IndexedDB stores all entries, settings, and chat history locally.
- OpenRouter requests are excluded from the cache and fail gracefully when offline (chat disables, tip card falls back to the last cached tip).
- JSON backup / restore with optional API-key inclusion.

### Design

- Soft Neo-Brutalism: deep charcoal (`#141414`) background, 2.5px borders, hard offset shadows, 20px radius.
- Pastel accents: salmon, periwinkle, yellow, mint.
- Bold all-caps sans-serif typography with modular fintech SaaS aesthetic.
- Mobile-first layout, safe-area aware, bottom tab bar + center FAB.

## Project Structure

```
.
├── index.html              # 5 screens + sheet + chat
├── styles.css              # Neo-brutalist theme + all component styles
├── app.js                  # Router, forms, widgets, stats, profile, settings, coach
├── db.js                   # IndexedDB wrapper (entries, settings, chats)
├── ai.js                   # OpenRouter client (tip + streaming chat)
├── sw.js                   # Cache-first service worker
├── manifest.webmanifest    # PWA manifest
├── icons/                  # SVG app icons
├── netlify.toml            # Headers for SW scope and manifest MIME
└── README.md
```

## Run Locally

Service workers need a real HTTP origin (`file://` won't work). Any static server works:

```bash
python -m http.server 8080
# or
npx serve .
```

Open `http://localhost:8080` and try "Add to Home Screen" on mobile.

## Deploy to Netlify

### Drag and drop
1. Go to [app.netlify.com/drop](https://app.netlify.com/drop).
2. Drag the project folder onto the page.

### Netlify CLI
```bash
npm install -g netlify-cli
netlify deploy --prod --dir=.
```

### Git-based
1. Push to a GitHub repo.
2. In Netlify, **Add new site → Import an existing project**, pick the repo, leave build command empty, publish directory `.`.

## Using the AI Coach

1. Visit [openrouter.ai/workspaces/default/keys](https://openrouter.ai/workspaces/default/keys) and create a key.
2. In the app, open **Settings**, paste the key, pick a model, and hit **SAVE**.
3. Tap **TEST CONNECTION** to verify.
4. A **Daily Tip** card appears on Home — tap it to chat.

The key never leaves your device except in API calls directly to OpenRouter.

## Customization

- Colors / radii: CSS variables at the top of [styles.css](styles.css).
- Default goals and metrics: `DEFAULTS` in [db.js](db.js).
- Model list and pricing: `MODELS` in [ai.js](ai.js).
- System prompt: `buildSystemPrompt` in [ai.js](ai.js).
- Bump `CACHE_NAME` in [sw.js](sw.js) when you ship asset changes.

## License

MIT.
