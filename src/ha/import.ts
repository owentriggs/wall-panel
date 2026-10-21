/**
 * Task 1 — Auto-import rooms from Home Assistant.
 *
 * Reads the area / entity / device registries + current states over the
 * websocket and builds a `HomeConfig` (the same shape the UI already consumes),
 * classifying entities by domain and dropping noise. This is the first-run
 * seed; the Settings UI (Task 2) edits it and persistence (Task 3) saves the
 * edits, which are overlaid on top of this import.
 */
import type {
  AreaRegistryEntry,
  DeviceRegistryEntry,
  EntityRegistryEntry,
  HaConnection,
  HassEntity,
} from "./types";
import type { HomeConfig, RoomConfig } from "./config";

/**
 * Integration platforms whose media_player is a TV/streamer even without
 * device_class: tv. The Android TV Remote integration (Google TV Streamer,
 * Chromecast with Google TV, Nvidia Shield, most Android TVs) is the key case.
 */
export const TV_PLATFORMS = new Set(["androidtv_remote", "androidtv", "firetv", "webostv", "samsungtv", "bravia", "philips_js"]);

/**
 * True if a media_player should be treated as a TV/streamer rather than a
 * speaker. Shared by the auto-import and the Settings catalog so both agree.
 * `remoteDevices` is the set of device ids that own a remote.* entity.
 */
export function isTvMediaPlayer(
  reg: { platform?: string; device_id?: string | null } | undefined,
  deviceClass: string | undefined,
  remoteDevices: Set<string>,
): boolean {
  if (deviceClass === "tv") return true;
  if (reg && TV_PLATFORMS.has(reg.platform ?? "")) return true;
  if (reg?.device_id && remoteDevices.has(reg.device_id)) return true;
  return false;
}

/** The set of device ids that have at least one remote.* entity. */
export function remoteDeviceIds(entities: { entity_id: string; device_id?: string | null }[]): Set<string> {
  const s = new Set<string>();
  for (const e of entities) if (e.entity_id.startsWith("remote.") && e.device_id) s.add(e.device_id);
  return s;
}

/** Patterns in an entity id or name that mark it as noise to hide by default. */
const JUNK = [
  /browser_mod/i,
  /child.?lock/i,
  /disable.?led/i,
  /\bled\b.*\b(enable|disable)\b/i,
  /fully[_\s]?kiosk/i,
  /\b(screensaver|screen_?saver)\b/i,
  /wall[_\s]?tablet.*app/i,
  /_app_(switch|lock)/i,
  /\(old\)/i, // obvious duplicates named "... (old)"; conservative by design
];

/**
 * True if an entity should be hidden from the auto-import / picker by default.
 * Mirrors the brief §6 + §5 noise rules. Exported so the Settings picker
 * (Task 2) can reuse the exact same filter.
 */
export function isNoise(entityId: string, reg?: EntityRegistryEntry, friendlyName?: string): boolean {
  if (reg) {
    if (reg.hidden_by) return true;
    if (reg.disabled_by) return true;
    if (reg.entity_category === "diagnostic" || reg.entity_category === "config") return true;
  }
  const hay = entityId + " " + (friendlyName ?? reg?.name ?? reg?.original_name ?? "");
  return JUNK.some((re) => re.test(hay));
}

type Domain = "light" | "media_player" | "scene" | "script" | "weather" | "remote" | "calendar" | "other";
const domainOf = (id: string): Domain => {
  const d = id.split(".")[0];
  if (d === "light" || d === "media_player" || d === "scene" || d === "script" || d === "weather" || d === "remote" || d === "calendar") return d;
  return "other";
};

/** Resolve an entity's area: its own area_id, else its device's area_id. */
function areaFor(
  reg: EntityRegistryEntry | undefined,
  devices: Map<string, DeviceRegistryEntry>,
): string | null {
  if (!reg) return null;
  if (reg.area_id) return reg.area_id;
  if (reg.device_id) return devices.get(reg.device_id)?.area_id ?? null;
  return null;
}

/**
 * Build a HomeConfig from the three registries + states. Pure so it is unit
 * testable; `importHome` fetches the data and calls this.
 */
export function buildHomeFromRegistry(
  areas: AreaRegistryEntry[],
  entities: EntityRegistryEntry[],
  devices: DeviceRegistryEntry[],
  states: Record<string, HassEntity>,
): HomeConfig {
  const deviceMap = new Map(devices.map((d) => [d.id, d]));

  // Seed a room per area, in area order. Empty rooms are dropped at the end.
  const rooms = new Map<string, RoomConfig>();
  const order: string[] = [];
  for (const a of areas) {
    rooms.set(a.area_id, { id: a.area_id, name: a.name, short: a.name.split(/[\s']/)[0] || a.name, lights: [], speakers: [] });
    order.push(a.area_id);
  }

  const scenes: string[] = [];
  const scripts: string[] = [];
  const calendars: string[] = [];
  let weather = "";
  // remote.* entities by area and by device, so each TV media_player can be
  // paired to its remote below (Android TV Remote gives a media_player + a
  // remote.* on the SAME device; device pairing is the reliable signal).
  const remotesByArea = new Map<string, string[]>();
  const remotesByDevice = new Map<string, string[]>();
  const push = (m: Map<string, string[]>, k: string, v: string): void => {
    const arr = m.get(k);
    if (arr) arr.push(v);
    else m.set(k, [v]);
  };
  // media_player entities are deferred to a second pass so every remote is known
  // before we decide which players are TVs.
  const mediaPlayers: EntityRegistryEntry[] = [];

  for (const reg of entities) {
    const id = reg.entity_id;
    const st = states[id];
    const friendly = st?.attributes.friendly_name as string | undefined;
    if (isNoise(id, reg, friendly)) continue;

    switch (domainOf(id)) {
      case "scene":
        scenes.push(id);
        break;
      case "script":
        scripts.push(id);
        break;
      case "weather":
        if (!weather) weather = id;
        break;
      case "calendar":
        calendars.push(id);
        break;
      case "light": {
        const room = rooms.get(areaFor(reg, deviceMap) ?? "");
        if (room) room.lights.push(id);
        break;
      }
      case "media_player":
        mediaPlayers.push(reg);
        break;
      case "remote": {
        const area = areaFor(reg, deviceMap);
        if (area) push(remotesByArea, area, id);
        if (reg.device_id) push(remotesByDevice, reg.device_id, id);
        break;
      }
      default:
        break;
    }
  }

  // Classify each media_player as a TV or a speaker. The Android TV Remote (what
  // a Google TV Streamer / Chromecast with Google TV uses) does NOT set
  // device_class: tv on its media_player, so we must also recognise it by its
  // integration platform and by a remote.* paired on the same device.
  for (const reg of mediaPlayers) {
    const id = reg.entity_id;
    const room = rooms.get(areaFor(reg, deviceMap) ?? "");
    if (!room) continue;
    const st = states[id];
    const deviceClass = st?.attributes.device_class as string | undefined;
    const deviceRemotes = reg.device_id ? remotesByDevice.get(reg.device_id) : undefined;
    const isTv =
      deviceClass === "tv" ||
      TV_PLATFORMS.has(reg.platform ?? "") ||
      (deviceRemotes != null && deviceRemotes.length > 0);
    if (isTv && !room.tv) {
      room.tv = id;
      // Pair a remote: prefer one on the same device, else a name/area match.
      const areaRemotes = remotesByArea.get(room.id);
      const tvObj = id.split(".")[1] ?? "";
      room.tvRemote =
        deviceRemotes?.[0] ??
        areaRemotes?.find((r) => tvObj && (r.includes("tv") || (r.split(".")[1] ?? "").split("_")[0] === tvObj.split("_")[0])) ??
        areaRemotes?.[0];
    } else {
      room.speakers.push(id);
    }
  }

  const roomList = order
    .map((aid) => rooms.get(aid)!)
    .filter((r) => r.lights.length > 0 || r.speakers.length > 0 || r.tv);

  return { rooms: roomList, scenes, scripts, calendars, weather: weather || "weather.forecast_home" };
}

export interface Registry {
  areas: AreaRegistryEntry[];
  entities: EntityRegistryEntry[];
  devices: DeviceRegistryEntry[];
  states: Record<string, HassEntity>;
}

/** Every entity id Home Assistant currently knows about (registry + states). */
export function knownEntityIds(reg: Registry): Set<string> {
  const ids = new Set<string>();
  for (const e of reg.entities) ids.add(e.entity_id);
  for (const id of Object.keys(reg.states)) ids.add(id);
  return ids;
}

/**
 * Drop entities that Home Assistant no longer knows about (genuinely deleted —
 * NOT merely "unavailable", which stays in the registry). Used by Re-sync so a
 * device removed in HA stops showing on the panel. Returns a new config and the
 * count removed; rooms are kept even if emptied (the user may re-fill them), and
 * `weather` is left alone (it is not a per-device assignment). Pure + testable.
 */
export function pruneMissing(config: HomeConfig, known: Set<string>): { config: HomeConfig; removed: number } {
  let removed = 0;
  const drop = (id: string): boolean => {
    const gone = !known.has(id);
    if (gone) removed++;
    return gone;
  };
  const rooms = config.rooms.map((r) => {
    const next: RoomConfig = { ...r, lights: r.lights.filter((e) => !drop(e)), speakers: r.speakers.filter((e) => !drop(e)) };
    if (next.tv && drop(next.tv)) delete next.tv;
    if (next.tvRemote && drop(next.tvRemote)) delete next.tvRemote;
    for (const k of ["tempSensor", "humSensor", "motionSensor"] as const) {
      if (next[k] && drop(next[k]!)) delete next[k];
    }
    return next;
  });
  const scenes = config.scenes.filter((e) => !drop(e));
  const scripts = config.scripts.filter((e) => !drop(e));
  const calendars = config.calendars?.filter((e) => !drop(e));
  const clean = <T>(m: Record<string, T> | undefined): Record<string, T> | undefined => {
    if (!m) return m;
    const out: Record<string, T> = {};
    for (const [k, v] of Object.entries(m)) if (known.has(k)) out[k] = v;
    return out;
  };
  return {
    config: { ...config, rooms, scenes, scripts, calendars, names: clean(config.names), icons: clean(config.icons), sceneMeta: clean(config.sceneMeta) },
    removed,
  };
}

/** Fetch the three registries + states in one go. Returns null on failure. */
export async function fetchRegistry(conn: HaConnection): Promise<Registry | null> {
  try {
    const [areas, entities, devices, stateList] = await Promise.all([
      conn.callWS<AreaRegistryEntry[]>({ type: "config/area_registry/list" }),
      conn.callWS<EntityRegistryEntry[]>({ type: "config/entity_registry/list" }),
      conn.callWS<DeviceRegistryEntry[]>({ type: "config/device_registry/list" }),
      conn.callWS<HassEntity[]>({ type: "get_states" }),
    ]);
    if (!Array.isArray(areas) || !Array.isArray(entities)) return null;
    const states: Record<string, HassEntity> = {};
    for (const s of stateList ?? []) states[s.entity_id] = s;
    return { areas, entities, devices: devices ?? [], states };
  } catch {
    return null;
  }
}

/**
 * Build a HomeConfig from a fetched registry. Returns null if it has no rooms
 * so the caller can fall back to the hand-written default config.
 */
export function homeFromRegistry(reg: Registry): HomeConfig | null {
  const home = buildHomeFromRegistry(reg.areas, reg.entities, reg.devices, reg.states);
  return home.rooms.length ? home : null;
}

/** Convenience: fetch + build in one call (used where the registry isn't reused). */
export async function importHome(conn: HaConnection): Promise<HomeConfig | null> {
  const reg = await fetchRegistry(conn);
  return reg ? homeFromRegistry(reg) : null;
}
