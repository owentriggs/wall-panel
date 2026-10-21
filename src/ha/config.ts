/**
 * Home config: which rooms exist and which HA entities belong to each.
 *
 * Seeded from the project brief (section 6). This is the data the Setup UI
 * (milestone 4) will eventually edit and persist; for now it is the starting
 * point. The adapter reads this + live HA states to build the view model.
 *
 * Noise entities (browser_mod, tablet switches, diagnostics, duplicates) are
 * simply not listed here, so they never appear.
 */

export interface RoomConfig {
  id: string;
  name: string;
  short: string;
  /** Light/switch entities shown as lights. */
  lights: string[];
  /** media_player entities used as speakers (now-playing + volume). */
  speakers: string[];
  /** media_player (device_class tv) + optional remote for the Watch/TV tile. */
  tv?: string;
  /** remote.* entity paired with the TV (Android TV Remote): d-pad + app launch. */
  tvRemote?: string;
  /** Optional temperature + motion sensor entity ids (user has some; ids TBC). */
  tempSensor?: string;
  humSensor?: string;
  motionSensor?: string;
}

/** Per-scene/script display metadata the Settings UI edits. */
export interface SceneMeta {
  name?: string;
  icon?: string;
  hidden?: boolean;
}

/** Display / behaviour settings (Task 2 Display section). Per-config for now. */
export interface DispConfig {
  theme: "auto" | "light" | "dark";
  h12: boolean;
  bright: number; // 40–100
  sleep: number; // seconds, 0 = never
}

export const DEFAULT_DISP: DispConfig = { theme: "auto", h12: false, bright: 100, sleep: 120 };

export interface HomeConfig {
  rooms: RoomConfig[];
  /** Global scenes shown on the Scenes tab + Home strip. */
  scenes: string[];
  /** Scripts offered alongside scenes (run like scenes). */
  scripts: string[];
  weather: string;
  /** calendar.* entities shown on the Calendar page (empty/absent = show all found). */
  calendars?: string[];
  /** Custom display names per entity id (overrides HA friendly_name). */
  names?: Record<string, string>;
  /** Custom icons per light entity id. */
  icons?: Record<string, string>;
  /** Per-scene/script metadata keyed by entity id. */
  sceneMeta?: Record<string, SceneMeta>;
  /** Display + behaviour settings. */
  disp?: DispConfig;
  /** PIN that unlocks Settings on non-admin devices (e.g. the kiosk account). */
  pin?: string;
}

/** Fallback Settings PIN used until the owner changes it (Settings → Display). */
export const DEFAULT_PIN = "1234";

/**
 * Hand-written fallback config (from the brief §6). Used only when the live
 * auto-import (Task 1) returns nothing — e.g. no HA, an old core, or a transient
 * registry error. On live HA the imported config replaces this, then Owen's
 * saved edits (Task 3) are overlaid on top.
 */
export const HOME: HomeConfig = {
  rooms: [
    {
      id: "lounge",
      name: "Lounge",
      short: "Lounge",
      lights: ["light.lounge_lights_group", "light.lounge_lamps_switch_1", "light.sofa_corner", "light.desk_corner"],
      speakers: ["media_player.lounge_radio"],
      tv: "media_player.lounge_tv_2",
      tvRemote: "remote.lounge_tv",
    },
    {
      id: "kitchen",
      name: "Kitchen",
      short: "Kitchen",
      lights: [],
      speakers: ["media_player.kitchen_revosuperconnect_mass"],
    },
    {
      id: "owens",
      name: "Owen's Room",
      short: "Owen",
      lights: [
        "light.owen_s_room",
        "light.owen_lamp",
        "light.wled",
        "light.desk_lamp_2",
        "light.h615a_31a4",
        "light.h618a_7e91",
      ],
      speakers: [],
    },
    {
      id: "sams",
      name: "Sam's Room",
      short: "Sam",
      lights: ["light.sam_s_room"],
      speakers: [],
    },
    {
      id: "ebens",
      name: "Eben's Room",
      short: "Eben",
      lights: ["light.eben_s_room_lights", "light.eben_s_smart_plug_1", "light.eben_smart_plug_2"],
      speakers: ["media_player.eben_s_room_speaker_2"],
    },
    {
      id: "front",
      name: "Front",
      short: "Front",
      lights: ["light.christmas_tree"],
      speakers: [],
    },
  ],
  scenes: ["scene.ambiance", "scene.reading", "scene.wind_down", "scene.study", "scene.green_scene"],
  scripts: ["script.bbc_radio_6", "script.rainbow_mode", "script.lullaby_mode", "script.generate_morning_briefing"],
  calendars: ["calendar.family", "calendar.bins"],
  weather: "weather.forecast_home",
};

/**
 * The config the app is currently driven by. Starts as the fallback; the
 * bootstrap swaps in the auto-imported + saved config via `setHome()`.
 */
let active: HomeConfig = HOME;

/** The active home config. Everything that used to read `HOME` reads this. */
export function getHome(): HomeConfig {
  return active;
}

/** Replace the active config (bootstrap / Settings). Callers then re-seed state. */
export function setHome(cfg: HomeConfig): void {
  active = cfg;
}

/** The active display settings, with defaults filled in. */
export function getDisp(): DispConfig {
  return { ...DEFAULT_DISP, ...(active.disp ?? {}) };
}

/** The Settings PIN (owner-set, else the default). */
export function getPin(): string {
  return active.pin || DEFAULT_PIN;
}

function titleFromId(id: string): string {
  const obj = id.split(".")[1] ?? id;
  const s = obj.replace(/_/g, " ").replace(/\bmass\b/gi, "").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface SceneEntry {
  id: string;
  kind: "scene" | "script";
  name: string;
  icon: string;
  show: boolean;
}

/**
 * The ordered scene+script list (scenes first), with Settings metadata applied.
 * `show` is true unless hidden. Used by the Settings Scenes section (full list)
 * and by `seed()` (which keeps only shown ones for the live views).
 */
export function sceneEntries(cfg: HomeConfig = active): SceneEntry[] {
  const meta = cfg.sceneMeta ?? {};
  const mk = (id: string, kind: "scene" | "script"): SceneEntry => ({
    id,
    kind,
    name: meta[id]?.name || cfg.names?.[id] || titleFromId(id),
    icon: meta[id]?.icon || "sparkles",
    show: !meta[id]?.hidden,
  });
  return [...cfg.scenes.map((id) => mk(id, "scene")), ...cfg.scripts.map((id) => mk(id, "script"))];
}

/** A display name for an entity id: custom name → HA friendly → prettified id. */
export function displayName(id: string, friendly?: string): string {
  return active.names?.[id] || friendly || titleFromId(id);
}
