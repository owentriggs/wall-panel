import type {
  AreaRegistryEntry,
  DeviceRegistryEntry,
  EntityRegistryEntry,
  HassEntity,
} from "../ha/types";

/**
 * Mock HA entities for `npm run dev`, using the real entity ids from the brief
 * so the panel behaves as it will against live Home Assistant. Includes on/off,
 * dimmed, colour-temp, unavailable, and media now-playing cases.
 */

function light(
  id: string,
  name: string,
  on: boolean,
  brightness?: number,
  kelvin?: number,
  modes?: string[],
): HassEntity {
  const supported = modes ?? (kelvin ? ["color_temp"] : ["brightness"]);
  const colorable = supported.some((m) => ["hs", "rgb", "rgbw", "rgbww", "xy"].includes(m));
  return {
    entity_id: id,
    state: on ? "on" : "off",
    attributes: {
      friendly_name: name,
      supported_color_modes: supported,
      ...(on && brightness != null ? { brightness } : {}),
      ...(on && kelvin != null ? { color_temp_kelvin: kelvin } : {}),
      ...(on && colorable ? { rgb_color: [120, 90, 255] as [number, number, number] } : {}),
    },
    last_updated: new Date().toISOString(),
  };
}
function unavailable(id: string, name: string): HassEntity {
  return { entity_id: id, state: "unavailable", attributes: { friendly_name: name }, last_updated: new Date().toISOString() };
}
function simple(id: string, name: string, state: string, attrs: HassEntity["attributes"] = {}): HassEntity {
  return { entity_id: id, state, attributes: { friendly_name: name, ...attrs }, last_updated: new Date().toISOString() };
}

export function seedEntities(): Record<string, HassEntity> {
  const list: HassEntity[] = [
    // Lounge
    light("light.lounge_lights_group", "Lounge Lights", true, 200, 2700),
    light("light.lounge_lamps_switch_1", "Lounge Lamps", true, 120, 2200),
    light("light.sofa_corner", "Sofa Corner", false),
    unavailable("light.desk_corner", "Desk Corner"),
    // Owen's Room
    light("light.owen_s_room", "Owen's Room", true, 255, 4000),
    light("light.owen_lamp", "Owen Lamp", false, undefined, undefined, ["rgb", "color_temp"]),
    light("light.wled", "WLED Mirror", true, 180, undefined, ["rgb"]),
    light("light.desk_lamp_2", "Desk Lamp", false),
    light("light.h615a_31a4", "Bed Light", false, undefined, undefined, ["rgb", "color_temp"]),
    light("light.h618a_7e91", "Wall Light", false, undefined, undefined, ["rgb"]),
    // Sam / Eben / Front
    light("light.sam_s_room", "Sam's Room", false),
    light("light.eben_s_room_lights", "Eben's Room", true, 90, 3000),
    // Plugs exposed as lights — on/off only (no brightness/colour).
    light("light.eben_s_smart_plug_1", "Eben Plug 1", false, undefined, undefined, ["onoff"]),
    light("light.eben_smart_plug_2", "Eben Plug 2", false, undefined, undefined, ["onoff"]),
    unavailable("light.christmas_tree", "Christmas Tree"),

    // Speakers
    simple("media_player.lounge_radio", "Lounge Radio", "playing", {
      media_title: "6 Music",
      media_artist: "BBC",
      volume_level: 0.35,
    }),
    simple("media_player.kitchen_revosuperconnect_mass", "Kitchen Speaker", "idle", { volume_level: 0.2 }),
    unavailable("media_player.eben_s_room_speaker_2", "Eben's Speaker"),
    // TV (Google TV Streamer via Android TV Remote): a media_player + a paired
    // remote on the same device. Note it reports NO device_class: tv and NO
    // activity_list — like the real integration — so the panel must classify it
    // as a TV by its platform/paired remote and show the curated app shortcuts.
    simple("media_player.lounge_tv_2", "Lounge TV", "on", {
      volume_level: 0.28,
      is_volume_muted: false,
      app_name: "Netflix",
    }),
    simple("remote.lounge_tv", "Lounge TV Remote", "on", {
      current_activity: "Netflix",
    }),

    // Calendars
    simple("calendar.family", "Family", "on"),
    simple("calendar.bins", "Bin collection", "off"),

    // Scenes & scripts
    simple("scene.ambiance", "Ambiance", "2026-10-16T20:00:00+00:00"),
    simple("scene.reading", "Reading", "2026-10-16T20:00:00+00:00"),
    simple("scene.wind_down", "Wind Down", "2026-10-16T20:00:00+00:00"),
    simple("scene.study", "Study", "2026-10-16T20:00:00+00:00"),
    simple("scene.green_scene", "Green", "2026-10-16T20:00:00+00:00"),
    simple("script.bbc_radio_6", "BBC Radio 6", "off"),
    simple("script.rainbow_mode", "Rainbow Mode", "off"),
    simple("script.lullaby_mode", "Lullaby Mode", "off"),
    simple("script.generate_morning_briefing", "Morning Briefing", "off"),

    // Weather
    simple("weather.forecast_home", "Home", "cloudy", { temperature: 11 }),

    // --- Noise entities: these must be filtered out of the auto-import. ---
    simple("light.disable_led_kitchen", "Kitchen Disable LED", "off"),
    simple("switch.wall_tablet_app_fully", "Fully Kiosk Screensaver", "on"),
    simple("media_player.browser_mod_wall_tablet", "browser_mod Wall Tablet", "idle"),
    simple("light.lounge_lamps_switch_1_child_lock", "Lounge Lamp Child Lock", "off"),
    simple("sensor.lounge_lights_group_signal", "Lounge Lights Signal", "-58", { device_class: "signal_strength" }),
    simple("light.sofa_corner_old", "Sofa Corner (old)", "unavailable"),
  ];

  const map: Record<string, HassEntity> = {};
  for (const e of list) map[e.entity_id] = e;
  return map;
}

/**
 * A minimal mock of the HA area / entity / device registries, matching the
 * seeded entities above so `npm run dev` exercises the auto-import path
 * (Task 1). Includes noise entries (hidden, diagnostic, junk patterns) that
 * the importer must drop.
 */
export interface MockRegistry {
  areas: AreaRegistryEntry[];
  entities: EntityRegistryEntry[];
  devices: DeviceRegistryEntry[];
}

export function seedRegistry(): MockRegistry {
  const areas: AreaRegistryEntry[] = [
    { area_id: "lounge", name: "Lounge" },
    { area_id: "kitchen", name: "Kitchen" },
    { area_id: "owens_room", name: "Owen's Room" },
    { area_id: "sams_room", name: "Sam's Room" },
    { area_id: "ebens_room", name: "Eben's Room" },
    { area_id: "front", name: "Front" },
    { area_id: "utility", name: "Utility" }, // empty area → should produce no room
  ];

  // entity_id → area_id. Most entities carry their own area; some rely on a device.
  const byArea: Record<string, string[]> = {
    lounge: [
      "light.lounge_lights_group",
      "light.lounge_lamps_switch_1",
      "light.sofa_corner",
      "light.desk_corner",
      "media_player.lounge_radio",
      "media_player.lounge_tv_2",
      "remote.lounge_tv",
    ],
    kitchen: ["media_player.kitchen_revosuperconnect_mass"],
    owens_room: [
      "light.owen_s_room",
      "light.owen_lamp",
      "light.wled",
      "light.desk_lamp_2",
      "light.h615a_31a4",
      "light.h618a_7e91",
    ],
    sams_room: ["light.sam_s_room"],
    ebens_room: ["light.eben_s_room_lights", "light.eben_s_smart_plug_1", "light.eben_smart_plug_2", "media_player.eben_s_room_speaker_2"],
    front: ["light.christmas_tree"],
  };

  // The Google TV Streamer's media_player + remote live on one androidtv_remote
  // device, with no device_class: tv — the panel pairs them by device id.
  const TV_DEVICE = "dev_lounge_gtv";
  const androidTv = new Set(["media_player.lounge_tv_2", "remote.lounge_tv"]);

  const entities: EntityRegistryEntry[] = [];
  for (const [area, ids] of Object.entries(byArea)) {
    for (const entity_id of ids) {
      if (androidTv.has(entity_id)) {
        entities.push({ entity_id, area_id: area, platform: "androidtv_remote", device_id: TV_DEVICE });
      } else {
        entities.push({ entity_id, area_id: area, platform: "mock" });
      }
    }
  }
  // Scenes & scripts are global (no area) — the importer collects them house-wide.
  for (const id of ["scene.ambiance", "scene.reading", "scene.wind_down", "scene.study", "scene.green_scene"]) {
    entities.push({ entity_id: id, area_id: null, platform: "homeassistant" });
  }
  for (const id of ["script.bbc_radio_6", "script.rainbow_mode", "script.lullaby_mode", "script.generate_morning_briefing"]) {
    entities.push({ entity_id: id, area_id: null, platform: "script" });
  }
  entities.push({ entity_id: "weather.forecast_home", area_id: null, platform: "met" });
  // Calendars are global (no area) — collected house-wide by the importer.
  for (const id of ["calendar.family", "calendar.bins"]) {
    entities.push({ entity_id: id, area_id: null, platform: "google" });
  }

  // Noise registry entries (various reasons the importer must skip them).
  entities.push(
    { entity_id: "light.disable_led_kitchen", area_id: "kitchen", platform: "mqtt", entity_category: "config" },
    { entity_id: "switch.wall_tablet_app_fully", area_id: "kitchen", platform: "fully_kiosk" },
    { entity_id: "media_player.browser_mod_wall_tablet", area_id: "kitchen", platform: "browser_mod" },
    { entity_id: "light.lounge_lamps_switch_1_child_lock", area_id: "lounge", platform: "mqtt" },
    { entity_id: "sensor.lounge_lights_group_signal", area_id: "lounge", platform: "zha", entity_category: "diagnostic" },
    { entity_id: "light.sofa_corner_old", area_id: "lounge", platform: "mqtt", hidden_by: "user" },
  );

  const devices: DeviceRegistryEntry[] = [{ id: TV_DEVICE, area_id: "lounge", name: "Lounge Google TV" }];
  return { areas, entities, devices };
}

/**
 * Mock answer for calendar.get_events (dev only). Produces a plausible week of
 * events relative to the requested window's Monday, so `npm run dev` exercises
 * the Calendar page — including timed, all-day and multi-day events.
 */
export function mockCalendar(
  ids: string[],
  startISO?: string,
  _endISO?: string,
): Record<string, { events: Array<{ summary: string; start: string; end: string; location?: string }> }> {
  const base = startISO ? new Date(startISO) : new Date();
  base.setHours(0, 0, 0, 0);
  // Snap to Monday of that week.
  base.setDate(base.getDate() - ((base.getDay() + 6) % 7));
  const pad = (n: number): string => String(n).padStart(2, "0");
  const day = (offset: number): Date => {
    const d = new Date(base);
    d.setDate(base.getDate() + offset);
    return d;
  };
  const dateStr = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const timed = (offset: number, h: number, m: number): string => `${dateStr(day(offset))}T${pad(h)}:${pad(m)}:00`;

  const family = [
    { summary: "School run", start: timed(0, 8, 30), end: timed(0, 9, 0) },
    { summary: "Dentist", start: timed(1, 11, 15), end: timed(1, 12, 0), location: "High St Dental" },
    { summary: "Football practice", start: timed(2, 18, 0), end: timed(2, 19, 30) },
    { summary: "Half term", start: dateStr(day(2)), end: dateStr(day(5)) }, // multi-day all-day
    { summary: "Dinner with Sam", start: timed(4, 19, 0), end: timed(4, 21, 0) },
    { summary: "Swimming", start: timed(5, 10, 0), end: timed(5, 11, 0) },
  ];
  const bins = [
    { summary: "Recycling", start: dateStr(day(3)), end: dateStr(day(4)) }, // all-day
    { summary: "General waste", start: dateStr(day(6)), end: dateStr(day(7)) },
  ];

  const byId: Record<string, Array<{ summary: string; start: string; end: string; location?: string }>> = {
    "calendar.family": family,
    "calendar.bins": bins,
  };
  const out: Record<string, { events: Array<{ summary: string; start: string; end: string; location?: string }> }> = {};
  for (const id of ids) out[id] = { events: byId[id] ?? [] };
  return out;
}
