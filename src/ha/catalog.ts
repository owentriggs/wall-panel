/**
 * Live entity catalog for the Settings entity picker (Task 2).
 *
 * Populated once at boot from the same registry fetch used by the auto-import,
 * so the picker lists REAL Home Assistant entities (not a hardcoded catalog).
 * Noise is hidden by default via the shared isNoise() filter; the picker's
 * "All" toggle can still reveal everything of the requested domain.
 */
import type { Registry } from "./import";
import { isNoise, isTvMediaPlayer, remoteDeviceIds } from "./import";

export interface CatalogEntity {
  id: string;
  name: string;
  dom: string; // domain, e.g. "light", "media_player", "scene"
  /** Coarse class used by the picker filters: speaker/tv/temperature/… */
  cls: string;
  state: string;
  /** True when this entity is noise (diagnostic/hidden/junk) — hidden unless "All". */
  noise: boolean;
}

let catalog: CatalogEntity[] = [];

function classify(
  dom: string,
  deviceClass: string | undefined,
  reg: { platform?: string; device_id?: string | null } | undefined,
  remoteDevices: Set<string>,
): string {
  // A media_player is a TV when device_class says so OR it's an Android-TV-style
  // streamer (platform / a paired remote) — matching the auto-import, so a Google
  // TV Streamer is pickable as a TV and never offered as a speaker.
  if (dom === "media_player") return isTvMediaPlayer(reg, deviceClass, remoteDevices) ? "tv" : "speaker";
  if (dom === "sensor") return deviceClass ?? "";
  if (dom === "binary_sensor") return deviceClass === "motion" || deviceClass === "occupancy" ? "motion" : (deviceClass ?? "");
  return "";
}

/** Build the catalog from a fetched registry (+ states for names/classes). */
export function setCatalog(reg: Registry): void {
  const remoteDevices = remoteDeviceIds(reg.entities);
  const next: CatalogEntity[] = [];
  for (const re of reg.entities) {
    const id = re.entity_id;
    const dom = id.split(".")[0] ?? "";
    const st = reg.states[id];
    const friendly = (st?.attributes.friendly_name as string | undefined) ?? re.name ?? re.original_name ?? undefined;
    const name = friendly || id;
    const dc = st?.attributes.device_class as string | undefined;
    next.push({ id, name, dom, cls: classify(dom, dc, re, remoteDevices), state: st?.state ?? "unknown", noise: isNoise(id, re, friendly) });
  }
  // Include any states that have no registry entry (rare) so nothing is missed.
  for (const id of Object.keys(reg.states)) {
    if (next.some((e) => e.id === id)) continue;
    const st = reg.states[id]!;
    const dom = id.split(".")[0] ?? "";
    const friendly = st.attributes.friendly_name as string | undefined;
    const dc = st.attributes.device_class as string | undefined;
    next.push({ id, name: friendly || id, dom, cls: classify(dom, dc, undefined, remoteDevices), state: st.state, noise: isNoise(id, undefined, friendly) });
  }
  catalog = next.sort((a, b) => a.name.localeCompare(b.name));
}

export function getCatalog(): CatalogEntity[] {
  return catalog;
}

export function catalogEntity(id: string): CatalogEntity | undefined {
  return catalog.find((e) => e.id === id);
}

/** True once the catalog has been populated (picker falls back gracefully if not). */
export function hasCatalog(): boolean {
  return catalog.length > 0;
}
