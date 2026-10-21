# Project brief: "Wall Panel", a lightweight touch UI for Home Assistant

Paste this whole file into Claude Code as the first message in an empty repo. Read all of it before writing code. Ask me up to 5 questions at the start (only ones that change the architecture), then proceed in the milestones at the bottom.

## 1. What I want and why

A fixed-frame, flat, modern wall-tablet interface for my Home Assistant, in the spirit of Control4's simplicity. Family and guests should understand it instantly. It has to feel finished and sturdy, not like a Lovelace dashboard.

I already tried building this as Lovelace YAML (button-card, layout-card, browser_mod). Twice. It looked tacky and was fiddly: card sizing quirks, no real layout control, JS-in-YAML templating, clipped text. **So: do not build Lovelace YAML.** Build a small dedicated front-end app that talks to HA directly, plus a built-in setup/edit interface so I can customise it without touching code.

Inspirations (look at them for ideas, don't fork): TileBoard, HA-Fusion, Ovio (I found it confusing and paid). Control4 touch screens for the overall feel.

Hard requirements:
- **Lightweight.** Small bundle (aim < 150 KB gzipped, hard cap 250 KB), no heavy UI frameworks, instant first paint on an old Android tablet. Prefer Preact or Svelte plus Vite, plain CSS with custom properties, inline SVG icons (no icon font, no giant icon packs; ship a small curated set).
- **Fixed frame, no page scroll.** Everything fits 1280x800 landscape. Must also degrade sensibly at 1024x600, 1920x1080 and portrait phones (guests/family may open it on their phones). Use a layout that scales (CSS grid plus clamp()/container units), not fixed pixels everywhere.
- **Clean, consistent, modern, flat.** One design system: spacing scale, type scale, radii, one accent colour, two surface levels, no shadows or gradients, no borders except focus rings. Dark by default, light theme supported via tokens. Min touch target 48px. Respect `prefers-reduced-motion`; animations are short and subtle.
- **Reliable.** Reconnects automatically, shows a clear but unobtrusive "reconnecting" state, never shows stale data as live. Entities that are `unavailable` render dimmed with "Offline" and are not tappable in misleading ways. No white flashes, no layout shifts.
- **Free and self-hosted.** No paid services, no cloud, no telemetry.

## 2. Environment facts

- Home Assistant Core 2026.8.1 on Home Assistant OS. Timezone Europe/London. English (UK) formatting, 24-hour clock.
- Target device: Lenovo wall tablet, 1280x800 landscape, Android, kiosk. Users: me (admin), family, guests. Guests must not be able to reach settings; setup mode is behind a PIN or admin-only.
- Already installed in HA (you may use or ignore): browser_mod 3.x, card-mod, kiosk-mode, Material You Utilities, Mushroom, button-card, layout-card, Music Assistant integration. Prefer not to depend on any of them.
- Fonts: DM Sans (bundle a subset woff2 locally; do not hit Google Fonts).

### Integration approach (propose and justify, then confirm with me)
Preferred options, in order:
1. **Custom panel** (`panel_custom`) served from `/config/www`, as a single JS bundle (web component) that receives the `hass` object. Authentication comes for free, it appears in the sidebar and can be set as the tablet user's default panel, and it works with the HA companion/kiosk setup.
2. **HA add-on with Ingress** (static app plus tiny backend for config storage), if you can justify the extra weight.
3. Standalone SPA with a long-lived token. Only if 1 and 2 fail; I don't want token management.

Use the official `home-assistant-js-websocket` library (or a minimal equivalent if it is too big; measure) and subscribe to entities efficiently (`subscribe_entities`, not polling). Read the area, device and entity registries over the websocket so the setup UI can group entities by area.

Config storage: layout and settings must persist across devices and survive reloads. Choose between per-user `frontend/set_user_data`, a JSON file in `/config` written by a small HA service/script, or add-on storage. Explain the trade-off and pick one. Always provide **Export/Import JSON** and keep a versioned schema with migrations.

## 3. Product design

### Information architecture
Same model as my approved mockup (mockup source: `Main.dc.html` in the earlier session; if you don't have it, follow this description).

- **Top bar:** left, a **Room dropdown** pill ("ROOM  Kitchen v"); centre, large clock; right, date and weather summary. Tapping the pill opens a popup grid of room tiles, each with a one-line live summary (e.g. "2 lights on . Playing"). Selecting a room keeps the current page (Lights stays Lights); if the new room has no such page, fall back to that room's Home. **The room selector must behave identically on every page.**
- **Bottom dock:** large icon+label buttons. Default set: Home, Lights, Listen, Watch, Scenes. **Pages shown depend on what the room actually has** (no Lights button in a room with no lights, no Watch without a TV, no Listen without a speaker). Never show empty "no X here" placeholder pages.
- **Content area:** exactly one screen at a time. No scrolling; paging or segmented controls when there are many items.
- **Admin page:** reachable by long-pressing the weather, PIN-protected, for rarely used scripts and the setup UI.
- No people/presence widgets (my presence data is inaccurate). Alarm panel is off for now but keep it as an optional, hideable widget type for later.

### Screens
- **Home (per room):** compact entity tiles for everything in the room (lights, switches, TV, fans, covers, climate, sensors), a now-playing card if the room has a speaker, and a quick-scenes strip. Tile: icon, name, state/percentage, thin brightness bar where dimmable. Tap toggles, double-tap cycles brightness (25/50/75/100), long-press opens a detail sheet.
- **Lights:** one tall vertical dimmer per light (real drag-to-set brightness with live value, pointer events, no sluggishness), "All off" for the room, paging if more than 4-6. Detail sheet: brightness, colour temperature, colour wheel when supported, effects list.
- **Listen:** Music Assistant powered (see section 4): now playing with art, transport, volume, seek, queue, favourites/radio/playlists browse, search, and grouping/"play everywhere".
- **Watch:** TV power, volume, mute, source/app list, d-pad remote if a `remote.*` entity exists. Only shown if the room has a TV/media_player of device_class tv.
- **Scenes:** big tiles for scenes and scripts with icon and last-run feedback (brief "Done" confirmation). Scripts and scenes assignable per room or global.
- **Detail sheets:** modal bottom sheets for lights, media, climate, covers, etc. Consistent header, close button, swipe-down to dismiss.

### Visual spec (starting tokens, refine as needed)
- Dark: bg `#0E1013`, surface `#1A1D21`, surface-2 `#23272C`, text `#E8EAED`, muted `#8B929A`, disabled `#555B63`, accent (the only colour) `#F5B544`, text-on-accent `#14110A`.
- Radii: tiles 16px, sheets 24px, pills fully rounded. Spacing scale 4/8/12/16/24/32. Gap between tiles 12px. Page padding 24px.
- Type: DM Sans; 11px caps labels (letter-spacing .12em), 15px body/tile, 18-24px titles, clock around 36-44px. Weights 400/600/700 only.
- Icons: consistent 1.7px stroke outline set, 24px grid. Active state = accent colour. Off state = muted.
- Feedback: pressed state scales to ~0.98 with 80ms transition; success flash on actions.
- Lessons from my last attempts: text must never clip; cards must fill their grid cells; avoid "big and chunky"; empty space is better than filler; nothing should look like a stock HA card.

## 4. Music Assistant integration (important)

Music Assistant is installed and exposes players to HA as `media_player` entities (e.g. `media_player.kitchen_revosuperconnect_mass`). Use both layers:

- **HA media_player entities** for state (title, artist, album art `entity_picture`, volume, position, `group_members`, `source`) and basic services (`play_pause`, `next/previous`, `volume_set`, `volume_mute`, `media_seek`, `join`/`unjoin`).
- **Music Assistant HA actions and websocket API** for the rich bits. Verify the exact current names against the official docs before using them (MA changes): `music_assistant.play_media` (media_id, media_type, enqueue, radio_mode), `music_assistant.search`, `music_assistant.get_library`, queue actions, and the browsing via the standard `media_player/browse_media` websocket command and `media-source://music_assistant/...` IDs. Use whichever works through HA's websocket so I don't need a second connection or token.
- Features: now playing, queue view with reorder/remove if the API allows, search (artists/albums/tracks/playlists/radio), library browse with art grids, favourites, recently played, "play on" player selector, group/ungroup players, per-player volume.
- Handle players being `unavailable`/`off` and group leaders vs members gracefully.
- Cache browse results briefly in memory; lazy-load art with fixed-size placeholders to avoid layout shift.

## 5. Setup / customisation interface

An **Edit mode** (PIN-protected, or HA admin only) built into the same app. No YAML.

- **Rooms:** add/rename/reorder/delete, choose icon, optionally link to an HA area (auto-import from the area registry as a starting point).
- **Entities:** searchable picker over all HA entities with area/domain filters, shows state, hides noise by default (browser_mod screens, tablet app switches, "child lock", "disable LED", diagnostics). Auto-suggest per room from the area registry. Assign to a room, set display name, icon, tile type, and optionally a lights group vs individual lights.
- **Layout:** drag-and-drop to reorder tiles; per-page control of which dock pages exist per room (with sensible auto-defaults from what the room contains); per-room scene/script strips.
- **Scenes/scripts:** pick and order, set icons, mark global or per-room, mark "admin only".
- **Appearance:** accent colour picker with contrast check, dark/light/auto, density (comfortable/compact), clock style, weather entity selection, units.
- **Behaviour:** default room (per device), idle timeout returning to default room/home, optional screen-dim hook (call a HA service/entity), guest mode (hides admin and selected items), PIN change.
- **Per-device profiles:** the wall tablet and phones may want different default rooms and density; store a profile keyed by device ID.
- **Safety:** live preview while editing, Undo/Redo, Revert to last saved, Export/Import JSON, schema versioning with migration.

## 6. My current entities (starter data)

Rooms and what's in them (IDs as of today; many currently show `unavailable` after an outage, which is expected, so design for it):

- **Lounge:** lights `light.lounge_lights_group` (group), `light.lounge_lamps_switch_1`, `light.sofa_corner`, `light.desk_corner`; TV `media_player.lounge_tv_2` (also `remote.lounge_tv`, Roku `remote.roku_express`); speaker `media_player.lounge_radio`.
- **Kitchen:** speaker `media_player.kitchen_revosuperconnect_mass` (Music Assistant). The wall tablet itself lives here.
- **Owen's Room:** group `light.owen_s_room`; `light.lumi_lumi_switch_l2aeu1_light_2` (ceiling), `light.lumi_lumi_switch_l2aeu1_light` (wall switch), `light.owen_lamp`, `light.wled` (mirror), `light.h615a_31a4` (bed), `light.h618a_7e91` (wall), `light.desk_lamp_2`.
- **Sam's Room:** `light.sam_s_room`.
- **Eben's Room:** `light.eben_s_room_lights`, plugs `light.eben_s_smart_plug_1` and `light.eben_smart_plug_2` (these are exposed as lights), speaker `media_player.eben_s_room_speaker_2`.
- **Front:** `light.christmas_tree`.
- Whole-house media groups: `media_player.downstairs`, `media_player.upstairs`.
- **Scenes:** `scene.ambiance`, `scene.reading`, `scene.wind_down`, `scene.study`, `scene.green_scene`.
- **Scripts:** `script.bedtime_downstairs`, `script.1786453113281` (named "Leaving"), `script.rainbow_mode`, `script.bbc_radio_6`, `script.play_spotify_chill`, `script.lullaby_mode`, `script.generate_morning_briefing`, `script.broadcast_message`, `script.revo_smart_announcement`, `script.shutdown_laptop`, `script.ask_mummy_more_time`.
- **Weather:** `weather.forecast_home`.
- **Alarm:** `alarm_control_panel.home_alarm` and Alarmo `alarm_control_panel.alarm` (disarmed; leave off).
- Lots of junk entities (browser_mod screens and media players, tablet app switches, old device duplicates). The setup UI must filter these out by default and the first-run wizard must not import them.

Don't hardcode any of this. It is only for seeding the first-run wizard and tests.

## 7. Tech and quality bar

- TypeScript, strict. Vite build to one JS file plus assets, with a size budget check in CI (`npm run size`).
- State: small store (signals/zustand-like), no Redux. Derived data memoised so a state change on one light doesn't re-render the app.
- Accessibility: keyboard and screen-reader basics (roles, labels), focus rings, contrast >= 4.5:1.
- Testing: Vitest for logic (schema migration, room/page derivation, brightness mapping, MA payload builders); Playwright for visual and interaction tests against a **mock HA websocket server** you write (so I can run the UI without HA). Screenshot tests at 1280x800, 1024x600, 1920x1080 and 390x844 portrait. Include `unavailable`, long names, 8+ lights and empty-room cases.
- Dev experience: `npm run dev` with the mock HA; `npm run build` outputs a folder I can copy to `/config/www/wall-panel/`; a README with exact install steps (copy files, `panel_custom` YAML, set as the default panel for the tablet user, kiosk tips).
- No telemetry, no external requests at runtime other than my HA instance.
- Provide a short `DESIGN.md` documenting tokens and components so it stays consistent, and keep components few and reusable (Tile, Dock, Pill, Sheet, Slider, Sheet-list, Segmented, Button).

## 8. Milestones (stop and show me after each)

1. **Spike (small):** pick integration approach, scaffold, connect to HA (real or mock), render the shell (top bar, room pill popup, dock) with design tokens, one room, live light state. Report bundle size. Ask me to test on the real tablet.
2. **Core screens:** Home, Lights (real drag dimmers), Scenes, detail sheets, room switching rules, unavailable/reconnect states, mock HA server and screenshot tests.
3. **Music Assistant:** Listen screen, browse/search/queue, grouping, Watch screen.
4. **Setup UI:** first-run wizard (import from areas with noise filtered), edit mode, drag-and-drop, appearance, per-device profiles, export/import, PIN.
5. **Polish and hardening:** a11y, performance on a low-end tablet (profile), idle behaviour, error handling, docs, install guide.

## 9. Working agreement

- Be opinionated and keep scope tight: fewer, better components beat many mediocre ones. Say no to features that add weight.
- Before each milestone give me a 5-line plan; after, show screenshots and the bundle size.
- Tell me plainly what you couldn't verify without my live HA (especially Music Assistant call shapes and anything the mock can't prove).
- If an HA or Music Assistant API detail is uncertain, check the current docs rather than guessing.
- Keep the repo clean: conventional commits, no dead code, small PR-sized steps.