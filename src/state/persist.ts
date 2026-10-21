/**
 * Task 3 — Config persistence.
 *
 * Storage has two tiers, chosen automatically at load:
 *
 *   1. SHARED household store — the `wall_panel` custom integration (its
 *      websocket commands `wall_panel/get` / `wall_panel/set`). One config for
 *      the whole home, shared across EVERY user and device. Preferred.
 *   2. PER-USER store — HA's built-in `frontend/get_user_data` /
 *      `frontend/set_user_data` (key `wall_panel`). Used only when the custom
 *      integration isn't installed. Syncs across one user's devices, but a
 *      different HA login sees its own copy.
 *
 * Either way it is server-side, so it survives reloads. A generated device id
 * (in localStorage) keeps per-device bits (default room, density) separate.
 *
 * Schema is versioned with a migration hook, and Export/Import JSON is provided
 * (brief §2/§5). Writes are debounced.
 *
 * NOTE: both transports can only be fully verified on live HA — the mock answers
 * all four commands in-memory so the save/load path is exercised in `npm run dev`.
 */
import type { HaConnection } from "../ha/types";
import type { HomeConfig } from "../ha/config";
import { getHome } from "../ha/config";

const KEY = "wall_panel";
export const SCHEMA_VERSION = 1;

export interface DeviceProfile {
  /** Default room this device opens to (Task 2 Display settings). */
  defaultRoom?: string;
  density?: "comfortable" | "compact";
}

export interface StoredConfig {
  version: number;
  config: HomeConfig;
  devices?: Record<string, DeviceProfile>;
  savedAt?: string;
}

// ---- device id (per-device profiles) ----
const DEVICE_KEY = "wall_panel_device_id";
export function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = "dev-" + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "dev-unknown";
  }
}

// ---- migrations ----
/** Bring any older stored blob up to the current schema. Returns null if unusable. */
function migrate(raw: unknown): StoredConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Partial<StoredConfig>;
  if (!obj.config || !Array.isArray(obj.config.rooms)) return null;
  let version = typeof obj.version === "number" ? obj.version : 0;
  // Future migrations go here, e.g.:
  //   if (version < 2) { ...transform obj.config...; version = 2; }
  version = SCHEMA_VERSION;
  return { version, config: obj.config, devices: obj.devices ?? {}, savedAt: obj.savedAt };
}

// ---- transport (shared household store vs per-user) ----
/**
 * Which store we read/write. Decided once at load and reused for every save, so
 * a config edit lands in the same place it was read from. Defaults to per-user
 * until the first load probes for the shared integration.
 */
export type SyncScope = "shared" | "user";
let transport: SyncScope = "user";
/** Where the config syncs: "shared" = whole household, "user" = this HA login. */
export function syncScope(): SyncScope {
  return transport;
}

// ---- load ----
/**
 * Read + migrate the saved config. Prefers the shared household store (custom
 * integration); if that command is unknown (integration not installed) it falls
 * back to HA's per-user store. Returns null if nothing valid is stored.
 */
export async function loadConfig(conn: HaConnection): Promise<StoredConfig | null> {
  // 1) Shared household store — syncs across all users and devices.
  try {
    const res = await conn.callWS<{ value: unknown }>({ type: "wall_panel/get" });
    transport = "shared";
    return migrate(res?.value);
  } catch {
    // Integration not installed (unknown command) — fall through to per-user.
  }
  // 2) Built-in per-user store — syncs across one user's devices only.
  transport = "user";
  try {
    const res = await conn.callWS<{ value: unknown }>({ type: "frontend/get_user_data", key: KEY });
    return migrate(res?.value);
  } catch {
    return null;
  }
}

// ---- save (debounced) ----
let saveT: ReturnType<typeof setTimeout> | undefined;
let pending: StoredConfig | null = null;
export function saveConfig(conn: HaConnection, config: HomeConfig, devices?: Record<string, DeviceProfile>): void {
  pending = { version: SCHEMA_VERSION, config, devices: devices ?? pending?.devices ?? {}, savedAt: new Date().toISOString() };
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    const value = pending;
    pending = null;
    if (!value) return;
    // Write back to whichever store we loaded from. The shared store carries
    // this device's id as `origin` so other panels can apply the update live
    // while this one ignores its own echo.
    const msg =
      transport === "shared"
        ? { type: "wall_panel/set", value, origin: deviceId() }
        : { type: "frontend/set_user_data", key: KEY, value };
    void conn.callWS(msg).catch(() => {
      // Non-fatal: the UI keeps its optimistic state; next edit retries.
    });
  }, 600);
}

/**
 * Convert a value pushed from another device (the `wall_panel_updated` event
 * payload) into a usable HomeConfig, or null if it isn't valid. Used for live
 * cross-device sync.
 */
export function remoteConfig(value: unknown): HomeConfig | null {
  return migrate(value)?.config ?? null;
}

// ---- merge import + saved ----
export interface ResolvedConfig {
  config: HomeConfig;
  /** True when there were no saved edits (first run on this HA user). */
  fresh: boolean;
}

/**
 * Combine the auto-import with saved edits. Saved edits win (order, names,
 * assignments), but any rooms the import discovered that the save predates are
 * appended, so adding a new HA area shows up without wiping customisation.
 */
export function mergeConfig(imported: HomeConfig | null, saved: StoredConfig | null): ResolvedConfig | null {
  if (!saved) return imported ? { config: imported, fresh: true } : null;
  const base = imported;
  if (!base) return { config: saved.config, fresh: false };
  const savedIds = new Set(saved.config.rooms.map((r) => r.id));
  const newRooms = base.rooms.filter((r) => !savedIds.has(r.id));
  return {
    config: { ...saved.config, rooms: [...saved.config.rooms, ...newRooms] },
    fresh: false,
  };
}

// ---- export / import JSON (brief requirement) ----
/** Serialise the active config for the Export button. */
export function exportConfig(devices?: Record<string, DeviceProfile>): string {
  const blob: StoredConfig = { version: SCHEMA_VERSION, config: getHome(), devices: devices ?? {}, savedAt: new Date().toISOString() };
  return JSON.stringify(blob, null, 2);
}

/** Parse + migrate an imported JSON blob. Returns null if invalid. */
export function parseImport(json: string): StoredConfig | null {
  try {
    return migrate(JSON.parse(json));
  } catch {
    return null;
  }
}
