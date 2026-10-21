# Handoff — Wall Panel ("Hearth"): finish HA integration + make setup effortless

**You are a fresh Claude Code session in this repo.** Read this, then read
`CLAUDE.md` (the product brief) and `DESIGN.md` (tokens/IA) in full before coding.
The owner (Owen) has basic coding + Home Assistant understanding — explain as you go.

## Goal of this handoff
The app is built and already controls real Home Assistant devices. Four things remain,
and the owner asked to **fix all of them**:

1. **Auto-import rooms from HA areas** (so rooms aren't hand-written).
2. **In-app Settings UI** (the gear screen — port it from the prototype).
3. **Bundle fonts locally** (exact typefaces, no Google Fonts at runtime).
4. **Music Assistant browse** (Radio/Playlists/Tracks tabs → real library).

Plus **config persistence** (save the setup so it survives reloads / syncs devices).

> Before you start: ask Owen to drop his latest prototype HTML (the file named
> `Hearth Wall Panel (1).html`, which contains the Settings design) into this repo at
> `docs/hearth-prototype.html`. That file is the exact visual + behavioural spec for the
> Settings UI — match it. If it's missing, ask for it.

## Hard design rules (keep — from the prototype & brief)
- Fixed **1280×800** stage scaled with `transform: scale()`, **never scrolls**, flat/solid,
  **one radius** `--R:22px` (inner blocks `calc(--R - 6px)`), dark-first + light theme,
  touch targets large, respect `prefers-reduced-motion`, keep a11y labels.
- **Never show the literal text "Music Assistant"** anywhere — use **Speakers / Radio /
  Playlists / Tracks**.
- **Bare mode = production**: the real panel fills the screen, no demo bar, no outer frame
  (`<App bare />` in `panel.tsx`). The dev demo bar (`<App demo />`) is dev-only.
- Don't redesign. Keep the look identical to `docs/hearth-prototype.html`.

## Stack & how it's wired (current architecture)
Preact + `@preact/signals` + Vite + TypeScript (strict). Builds to **one file**
`dist/wall-panel.js` loaded by HA via `panel_custom`. Size budget: `npm run size`
(<150 KB gz target; currently ~27.5 KB).

- **Entries:** `src/panel.tsx` — production web component `<wall-panel>`; HA assigns `hass`,
  we create `RealConnection(hass)` and reuse its live, authenticated websocket (no token).
  `src/main.tsx` — dev; uses `MockConnection`; `?bare` previews the in-HA look.
- **HA layer** (`src/ha/`):
  - `types.ts` — the `HaConnection` interface + minimal `HassEntity`.
  - `real-connection.ts` — wraps `hass.connection`; `subscribeEntities`, `callService`,
    status from connection events. **Add a generic `callWS`/`sendWS` here** for registries.
  - `mock-connection.ts` — dev HA, seeded by `src/mock/seed.ts` with the **real entity ids**
    from the brief. Understands light/scene/script/media_player services.
  - `service.ts` — `setConnection`, `callService`, brightness helpers.
  - `adapter.ts` — `initHa(conn)`: subscribes → `applyHa(entities)`, tracks status.
  - `config.ts` — **`HOME`**: rooms + which entities belong to each (hand-written from the
    brief). This is the thing auto-import should replace/seed.
- **State** (`src/state/`):
  - `model.ts` — types; `ROOMS` derived from `HOME`; `seed()` builds initial state.
  - `store.ts` — signals `rev` (bump→rerender) + `connectionStatus`; selectors; **actions do
    optimistic update + `callService`**; `applyHa()` maps live entities → state.
- **UI:** `src/App.tsx` (scaled stage, dock, room picker, toast, ambient sleep, swipe,
  keyboard, demo bar, bare mode). Views: `src/ui/views/{Home,Rooms,Lights,Media,Scenes}.tsx`.
  `Icon.tsx` + `sprite.ts` (Lucide sprite), `widgets.tsx` (`Raw`,`Slider`,`Switch`),
  `format.ts`. Styles: `src/styles/hearth.css` (full design, verbatim from prototype + a
  "UI refinements" block), `fonts.css` (placeholder), `inject.ts` (injects CSS + sprite).

## What works today
Lights (on/off, brightness %, Cool/Neutral/Warm colour temp), scenes & scripts, media
play/pause/skip/volume + speaker on-off + live now-playing, weather, availability (offline
entities dim/disable). Reads live HA state, controls real devices. Runs in dev against the
mock (seeded with real ids); same code uses the live `hass` in the panel.

Note: a light-count "bug" was investigated and is **not real** — it was a stale dev artifact;
state is consistent on a clean load. Don't chase it.

---

## Task 1 — Auto-import rooms from HA areas
Owen chose: **auto-import from HA areas on first run, then edit in Settings.**
- Add registry reads (real: `hass.callWS`/`conn.sendMessagePromise`):
  `config/area_registry/list`, `config/entity_registry/list`, `config/device_registry/list`.
- Build rooms from **areas**; assign each entity to its area via `entity.area_id` (fall back
  to its device's `area_id`). Classify by domain: `light.*`→lights; `media_player` with
  `device_class: tv`→tv, else speaker; `scene.*`/`script.*`→scenes.
- **Filter noise** (brief §6 + general): skip `hidden_by`, `entity_category` of
  `diagnostic`/`config`, and the junk patterns (browser_mod screens/players, tablet app
  switches, "child lock", "disable LED", old duplicates).
- Make `config.ts` `HOME` the **fallback**; prefer imported config, then overlay Owen's saved
  edits (Task 3). Keep everything behind the same `HOME`-shaped object so the UI is unchanged.
- **Mock:** extend `MockConnection` to answer these WS commands with a small mock registry so
  `npm run dev` exercises the import path.

## Task 2 — In-app Settings UI (port from `docs/hearth-prototype.html`)
The prototype has the full Settings design + logic. In it, search the CSS block beginning
`/* settings */` and the JS section headed `SETTINGS`. Port faithfully to Preact/TS:
- Add the prototype's `/* settings */ … .btn:disabled` CSS block to `hearth.css`, and add the
  **new sprite icons** it introduces to `sprite.ts`: `gear, chev, search, plus, check, x,
  edit, back, trash, wifi, sync, sliders, monitor, clock, door, alert, inbox`.
- Sections: **Overview, Rooms, Lights, Media, Scenes, Display**. Edit sheets
  (`fText/fChips/fIcons/fEntity/fToggle`) and the entity **picker** sheet (search,
  Available/All filter, single + multi select, shows where each entity is used).
- **Feed the picker from LIVE HA entities** (registry/states), not the prototype's hardcoded
  `HA[]` catalog.
- Open from the dock **gear** (prototype adds a `dock-set` button). Gate behind admin/PIN per
  the brief (guests must not reach settings). Real `hass.user.is_admin` is available.
- All edits mutate the config and persist (Task 3). Keep optimistic updates + the Undo toast.

## Task 3 — Persist the config
- Store via websocket user data: `frontend/set_user_data` / `frontend/get_user_data`
  (real: `hass.callWS({ type:'frontend/set_user_data', key:'wall_panel', value:{…} })`).
- **Versioned schema + migrations**; **Export/Import JSON** (brief requires); per-device
  profiles keyed by a generated device id kept in `localStorage`.
- Load saved config at startup and merge over the auto-import. Debounce writes.

## Task 4 — Music Assistant browse
- **Verify current MA API names against the official docs first** (they change). Likely:
  `music_assistant.play_media` (media_id, media_type, enqueue, radio_mode),
  `music_assistant.search`, library/browse via the `media_player/browse_media` websocket
  command and `media-source://music_assistant/…` ids.
- Wire the Media **browse tabs** (Radio/Playlists/Tracks) to real search/library/favourites,
  replacing the placeholder `STATIONS/PLAYLISTS/TRACKS` in `model.ts`. now-playing + transport
  + volume are already real. Handle players unavailable/off, group leaders vs members, cache
  browse results briefly, lazy-load art with fixed-size placeholders.
- Tell Owen clearly which MA call shapes you couldn't verify without his live instance.

## Task 5 — Bundle fonts (quick win)
- Add subsetted **DM Mono, Figtree, Bricolage Grotesque** woff2 files under
  `src/assets/fonts/` and uncomment the `@font-face` templates in `src/styles/fonts.css`
  (weights: Figtree 400–700, Bricolage 500/600, DM Mono 400/500; latin + latin-ext).
- The production bundle must make **no external requests at runtime** — the Google Fonts
  `<link>` in `index.html` is dev-only and fine to keep there.

---

## Run / build / install
- `npm install` · `npm run dev` (mock HA; add `?bare`) · `npm run build` (tsc + vite →
  `dist/wall-panel.js`) · `npm run size`.
- Install into HA: copy `dist/wall-panel.js` → `/config/www/wall-panel/wall-panel.js`; add to
  `configuration.yaml`:
  ```yaml
  panel_custom:
    - name: wall-panel
      sidebar_title: Wall Panel
      sidebar_icon: mdi:tablet-dashboard
      url_path: wall-panel
      module_url: /local/wall-panel/wall-panel.js
      embed_iframe: false
  ```
  Restart HA. When updating, bump `?v=N` on `module_url` to dodge caching.
- **There is no HA instance in this environment.** Verify logic against the mock, and state
  plainly what needs Owen's live HA (MA call shapes, registry data, `set_user_data`).

## Gotchas
- **Group lights:** `config.ts` lists some group entities (e.g. `light.lounge_lights_group`)
  and, for Owen's room, group + members. Decide to show group **or** members to avoid double
  control; the brief calls out "lights group vs individual lights" as a setup choice.
- `entity_picture` is a relative `/api/...` URL — works inside HA; the mock has none.
- `RoomId` is a `string`; sensors are optional per room (graceful empty states already exist).
- Keep the existing Preact views; do not rewrite the design.

## References
`CLAUDE.md` (brief, incl. §6 real entities), `DESIGN.md` (tokens/IA),
`docs/hearth-prototype.html` (full design incl. Settings — ask Owen to add it), `README.md`
(install). Suggested order: **Task 1 → Task 3 (scaffold persistence) → Task 2 → Task 5 →
Task 4.** Stop and show Owen screenshots + bundle size after each.
