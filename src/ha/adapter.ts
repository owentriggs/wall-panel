import type { HaConnection } from "./types";
import { setConnection, getConnection } from "./service";
import { fetchRegistry, homeFromRegistry, pruneMissing, knownEntityIds } from "./import";
import { setCatalog } from "./catalog";
import { resetMusicCache } from "./music";
import { getHome } from "./config";
import { applyHa, applyConfig, connectionStatus } from "../state/store";
import { loadConfig, saveConfig, mergeConfig, remoteConfig, deviceId } from "../state/persist";

/**
 * Wire a HA connection (mock in dev, real inside Home Assistant) to the store.
 *
 * Boot order (so the UI seeds from the right rooms, no flash of fallback):
 *   1. auto-import a HomeConfig from the HA registries (Task 1),
 *   2. overlay Owen's saved edits from user-data (Task 3),
 *   3. apply that config + re-seed, THEN
 *   4. subscribe to entities (first push fills live values) + track status.
 *
 * All registry/user-data reads are guarded: if any fail (old core, transient
 * error, or a mock without them) we fall back to the default config and still
 * subscribe, so the panel always comes up.
 */
export function initHa(conn: HaConnection): () => void {
  setConnection(conn);
  connectionStatus.value = conn.status();
  const offStatus = conn.onStatusChange((s) => (connectionStatus.value = s));

  let offEntities: (() => void) | null = null;
  let offConfigSync: (() => void) | null = null;
  let stopped = false;

  const subscribe = (): void => {
    if (stopped) return;
    offEntities = conn.subscribeEntities((all) => applyHa(all));
  };

  // Live cross-device sync: when another device saves (the shared integration
  // fires `wall_panel_updated`), apply the new config here without a reload. We
  // ignore our own echo via `origin`. No-op when the transport can't subscribe
  // (mock, or the per-user fallback store).
  const subscribeConfigSync = (): void => {
    if (stopped || !conn.subscribeEvents) return;
    void conn
      .subscribeEvents<{ value?: unknown; origin?: string }>("wall_panel_updated", (ev) => {
        const d = ev?.data;
        if (!d || d.origin === deviceId()) return;
        const cfg = remoteConfig(d.value);
        if (cfg) applyConfig(cfg);
      })
      .then((off) => {
        if (stopped) off();
        else offConfigSync = off;
      })
      .catch(() => {
        /* subscription unsupported/denied — load-at-startup sync still works */
      });
  };

  void (async () => {
    try {
      const reg = await fetchRegistry(conn);
      if (reg) setCatalog(reg); // feed the Settings entity picker from live HA
      const imported = reg ? homeFromRegistry(reg) : null;
      const saved = await loadConfig(conn);
      const merged = mergeConfig(imported, saved);
      if (merged) {
        // Apply the merged config as-is. We deliberately do NOT prune "missing"
        // entities on the automatic boot path: a device that is merely offline
        // (a Google TV Streamer powered down, an integration still reloading at
        // HA startup) is absent from a single registry read, and pruning it here
        // would wipe a valid assignment — e.g. drop `room.tv` so the Watch tab
        // vanishes — and then persist + cross-device-sync that deletion to every
        // panel. Reconciling genuinely-deleted devices is left to the explicit
        // Settings → Re-sync, where the user is actively reconciling.
        applyConfig(merged.config);
        // Persist only to establish a baseline the first time (fresh import, no
        // saved edits yet), so later edits have something to diff against.
        if (!saved && imported) void saveConfig(conn, merged.config);
      }
    } catch {
      // Keep the fallback config; still bring the panel up.
    }
    subscribe();
    subscribeConfigSync();
  })();

  return () => {
    stopped = true;
    offStatus();
    offEntities?.();
    offConfigSync?.();
  };
}

/**
 * Re-read Home Assistant on demand (the Settings "Re-sync" button): refresh the
 * entity catalog that feeds the picker, re-run the area import, and overlay it
 * on the CURRENT in-app config so devices added/removed in HA show up without a
 * full reload. Existing rooms/names/assignments are kept; only newly-discovered
 * rooms are appended (same rule as the boot merge). Live states keep streaming
 * via the existing subscription; the music cache is cleared so Listen re-reads.
 *
 * Returns the entity count + how many stale assignments were pruned, or null if
 * the read failed (e.g. a non-admin user can't read the registries).
 */
export interface ResyncResult {
  entities: number;
  removed: number;
}
export async function resyncHome(): Promise<ResyncResult | null> {
  const conn = getConnection();
  const reg = await fetchRegistry(conn);
  if (!reg) return null;
  setCatalog(reg);
  const imported = homeFromRegistry(reg);
  // Overlay the fresh import on what's on the panel now (not the saved blob):
  // keeps the user's current edits, appends any rooms HA has gained.
  const merged = mergeConfig(imported, { version: 0, config: getHome() });
  let removed = 0;
  if (merged) {
    // Drop entities HA no longer knows about (deleted devices/speakers), so the
    // panel stops showing stale tiles. "unavailable" entities stay (still in reg).
    // Guard: only prune when HA actually returned a populated registry, so a
    // transient empty read can never wipe the user's whole config.
    const known = knownEntityIds(reg);
    const final = known.size > 0 ? pruneMissing(merged.config, known) : { config: merged.config, removed: 0 };
    removed = final.removed;
    applyConfig(final.config);
    saveConfig(conn, final.config);
  }
  resetMusicCache();
  return { entities: reg.entities.length, removed };
}
