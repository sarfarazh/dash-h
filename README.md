# Pulse Desk — Offline Health Dashboard PWA

A fully offline-capable mobile Progressive Web App for personal health tracking. Built with vanilla HTML, CSS, and JavaScript — zero build step, zero dependencies. Ships as a static site ready to drop onto Netlify.

## Features

- **Bento grid dashboard** with seven widgets:
  - HEART RATE — animated SVG trend graph + live BPM ticker
  - SLEEP SCORE — numeric score, moon icon, stage bars
  - ENERGY — calories intake vs burn with net delta
  - HYDRATION — tap-to-add bottle tracker with animated wave fill (persisted)
  - RECOVERY — body battery meter with dynamic color ramp
  - ACTIVITY RINGS — three concentric progress rings (Move / Exercise / Stand)
  - STEP COUNTER — count, goal progress, and quick actions (persisted)
- **Soft Neo-Brutalism** — deep charcoal (`#141414`) background, 2.5px borders, hard offset shadows, pastel accents (salmon, periwinkle, yellow, mint)
- **Bold all-caps typography** with modular fintech SaaS aesthetic
- **Fully offline** — service worker pre-caches every asset on first visit
- **Installable** — Web App Manifest with maskable icons, standalone display mode
- **Persistent state** — hydration and steps survive reloads via `localStorage`
- **Mobile-first** — safe-area-aware padding, bottom tab bar, responsive bento grid
- **Accessible** — semantic landmarks, ARIA roles/labels, reduced-motion support

## Project Structure

```
.
├── index.html              # Markup for all widgets + PWA meta tags
├── styles.css              # Neo-brutalist dark theme + bento grid
├── app.js                  # Widget logic, SVG charts, SW registration
├── sw.js                   # Cache-first service worker
├── manifest.webmanifest    # PWA manifest
├── icons/
│   ├── favicon.svg
│   ├── icon-192.svg
│   └── icon-512.svg
├── netlify.toml            # Netlify headers (SW scope, manifest MIME)
└── README.md
```

## Run Locally

A service worker requires a real HTTP origin (`file://` won't work). Any static server is fine:

```bash
# Python 3
python -m http.server 8080

# or Node
npx serve .
```

Then open `http://localhost:8080`.

## Deploy to Netlify

### Option A — drag and drop
1. Zip the project folder (or drag the folder itself).
2. Go to [app.netlify.com/drop](https://app.netlify.com/drop).
3. Drop it. Done.

### Option B — Netlify CLI
```bash
npm install -g netlify-cli
netlify deploy --prod --dir=.
```

### Option C — Git-based deploy
1. Push this folder to a new GitHub repo.
2. In Netlify, click **Add new site → Import an existing project**.
3. Select the repo. Leave build command empty; set publish directory to `.`.
4. Deploy.

After deploying, open the site on your phone, tap the browser's "Add to Home Screen" option, and launch it like a native app. It will work fully offline from the second visit onward.

## Customization

- Colors and radii live as CSS variables at the top of [styles.css](styles.css).
- Goals (`HYDRATION_GOAL`, `STEPS_GOAL`) and mock data generators are at the top of [app.js](app.js).
- Bump the `CACHE_NAME` in [sw.js](sw.js) whenever you change assets to force clients to update.

## License

MIT — do whatever you want.
