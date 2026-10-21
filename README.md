# Wall Panel

A lightweight, flat touch UI for Home Assistant — a custom panel (web component) you
set as the default page for a wall tablet. No Lovelace YAML, no cloud, no telemetry.

**Status:** Milestone 1 (spike). Shell + room picker + dock + live light tiles, running
against a built-in mock HA. Bundle: **~15 KB gzipped** (budget: 150 KB target / 250 KB cap).

## Develop (no Home Assistant needed)
```bash
npm install
npm run dev      # opens a dev server; runs against the MOCK Home Assistant
```
The mock is seeded with your real room/entity names, so you can click tiles and switch
rooms exactly as the real thing will behave.

```bash
npm run build    # typechecks, then bundles to dist/wall-panel.js (one file)
npm run size     # prints gzipped size and checks the budget
```

## Install into Home Assistant (via HACS — recommended)
Wall Panel is a single Home Assistant **integration** that serves its own front-end and
registers the sidebar page itself. **No `/config/www` copying and no YAML.**

1. **HACS → ⋮ (top right) → Custom repositories.** Paste the repo URL
   `https://github.com/owentriggs/wall-panel`, choose category **Integration**, Add.
2. Find **Wall Panel** in HACS, click **Download**, then **restart Home Assistant**.
3. **Settings → Devices & Services → Add Integration → "Wall Panel" → Submit.**
4. Open **Wall Panel** from the sidebar.
5. **Set as the tablet user's default page:** that user's Profile → *Default dashboard*, or
   the companion app's default page. For kiosk, point the tablet at `http(s)://<ha>/wall-panel`.

> The panel reuses the connection HA gives it — no token, no login. Updates are one click in
> HACS; the served file is cache-busted by version so tablets pick up new builds after a reload.

### Cross-device sync (automatic)
Because the integration is always present, Wall Panel keeps **one** setup for the whole
household in HA's own storage (`.storage/wall_panel_config`). Every tablet, phone and guest
sees the same rooms, scenes, calendars and layout — **new devices need no setup**. Edit on
your phone and open panels update live (a `wall_panel_updated` event), no reload needed.
It stays local (no cloud), survives restarts, and any logged-in user can read/write it;
editing in the UI is still gated behind admin/PIN. **Export/Import JSON** in Settings lets
you back up or move the config.

> Each device keeps its own *default room* and *density* locally (a generated device id), so
> the shared setup doesn't force every screen to look identical.

### Upgrading from an older manual install
If you previously copied files in by hand, remove the old bits **on your HA** first so they
don't clash (your saved layout is safe — it lives in `.storage`, not these folders):
- delete `/config/www/wall-panel/` (old front-end copy),
- delete any hand-copied `/config/custom_components/wall_panel/` (HACS manages its own),
- remove the `panel_custom:` block and any bare `wall_panel:` line from `configuration.yaml`.

Then restart and install via HACS as above. (Tip: open Settings → **Export JSON** beforehand
as a backup.)

### Manual install (without HACS)
Copy the `custom_components/wall_panel/` folder from this repo into `/config/custom_components/`
(so you have `…/wall_panel/__init__.py` and `…/wall_panel/wall-panel.js`), restart HA, then
add the integration from **Settings → Devices & Services** as in step 3 above.

## Fonts
The brief asks for DM Sans bundled locally (no Google Fonts at runtime). I could not download
it in the build sandbox, so the UI currently falls back to the system UI font. To add DM Sans:
drop `dm-sans-400/600/700.woff2` (latin + latin-ext subset) into `src/assets/fonts/` and
uncomment the `@font-face` rules in [`src/styles/fonts.css`](src/styles/fonts.css).

## Project map
- `src/ha/` — connection interface + mock + real (reuses `hass`) + service helpers
- `src/store/` — per-entity signals, rooms (seed), page derivation, UI state, summaries
- `src/components/` — Tile, TopBar, Dock, RoomPicker, ConnectionBanner, screens
- `src/styles/` — tokens + base + components (see [DESIGN.md](DESIGN.md))
- `src/panel.tsx` — the `<wall-panel>` web component HA loads
- `src/main.tsx` — dev entry (mock HA)
