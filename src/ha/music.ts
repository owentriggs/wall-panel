/**
 * Task 4 — Music Assistant browse.
 *
 * Thin wrappers over the Music Assistant Home Assistant actions, reusing HA's
 * authenticated websocket (no second connection). All names + parameters below
 * were verified against the official HA integration services.yaml (2026-10):
 *
 *   music_assistant.get_library  { config_entry_id*, media_type*, favorite?,
 *                                   search?, limit?, offset?, order_by? }
 *                                 → response { items: [{ name, uri, ... }] }
 *   music_assistant.search       { config_entry_id*, name*, media_type?[],
 *                                   limit?, library_only? }
 *                                 → response { artists, albums, tracks,
 *                                              playlists, radio, ... }
 *   music_assistant.play_media   target entity_id; { media_id*, media_type?,
 *                                   enqueue?(play|replace|next|replace_next|add),
 *                                   radio_mode? }
 *
 * NOTE: `limit`/`offset`/`order_by` (get_library) and `limit`/`library_only`
 * (search) are ALL TOP-LEVEL fields under `data:`. There is no `pagination` or
 * `search_options` object — Home Assistant rejects unknown service fields, so
 * wrapping them makes the whole call fail (verified against the 2026-10 docs at
 * home-assistant.io/actions/music_assistant.get_library and .search).
 *
 * What still needs live-HA confirmation (no instance in dev): the exact RESPONSE
 * item key names (we read several defensively) and a dedicated per-provider
 * browse tree (e.g. an "Apple Music" library hierarchy via
 * media_player/browse_media + media-source://music_assistant/...). Search
 * already spans every connected provider, Apple Music included.
 */
import type { HaConnection } from "./types";

/** Playable Music Assistant media types (superset of the three browse tabs). */
export type MaMediaType = "artist" | "album" | "playlist" | "track" | "radio";

export interface BrowseItem {
  uri: string;
  name: string;
  sub: string;
  /** Artwork URL (relative /api/... inside HA) or "" when none/unknown. */
  image: string;
  /** The item's own media type — set on search results so each plays correctly. */
  mediaType?: MaMediaType;
}

/** A labelled bucket of search results (artists, albums, tracks, …). */
export interface SearchGroup {
  type: MaMediaType;
  label: string;
  items: BrowseItem[];
}

// --- config entry discovery (search + get_library need the MA instance id) ---
// Cache only a SUCCESSFUL lookup. A failed/empty lookup stays `undefined` so the
// next browse retries it (e.g. after MA finishes starting, or a re-sync).
let _entryId: string | null | undefined; // undefined = not looked up / failed
async function configEntryId(conn: HaConnection): Promise<string | null> {
  if (_entryId) return _entryId;
  const entries = await conn.callWS<Array<{ entry_id: string; domain: string }>>({ type: "config_entries/get" });
  const ma = entries.find((e) => e.domain === "music_assistant");
  _entryId = ma?.entry_id ?? null;
  if (!ma) console.warn("[wall-panel] No Music Assistant config entry found via config_entries/get.");
  return _entryId;
}

/** Forget cached discovery + browse so the next request re-reads live (used on re-sync). */
export function resetMusicCache(): void {
  _entryId = undefined;
  cache.clear();
}

/**
 * Call a service that returns a response (return_response), via raw WS. Throws
 * on failure so callers can show a real error state — the exact HA message is
 * logged to the console first, which is the only way to diagnose MA call issues
 * without a second connection.
 */
async function callServiceResponse(
  conn: HaConnection,
  domain: string,
  service: string,
  data: Record<string, unknown>,
  target?: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  try {
    const res = await conn.callWS<{ response?: Record<string, unknown> }>({
      type: "call_service",
      domain,
      service,
      service_data: data,
      ...(target ? { target } : {}),
      return_response: true,
    });
    return res?.response ?? null;
  } catch (err) {
    console.error(`[wall-panel] ${domain}.${service} failed:`, err, "— data:", data);
    throw err;
  }
}

// Defensive readers — the exact MA item keys aren't documented, so try a few.
const str = (o: Record<string, unknown>, ...keys: string[]): string => {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v) return v;
  }
  return "";
};

function toItem(raw: unknown, mediaType?: MaMediaType): BrowseItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const uri = str(o, "uri", "media_id", "item_id");
  const name = str(o, "name", "title");
  if (!uri || !name) return null;
  const artistObj = o["artists"];
  let sub = str(o, "artist", "album", "subtitle", "media_type");
  if (!sub && Array.isArray(artistObj) && artistObj[0] && typeof artistObj[0] === "object") {
    sub = str(artistObj[0] as Record<string, unknown>, "name");
  }
  const image = str(o, "image", "media_image_url", "thumbnail", "image_url");
  const item: BrowseItem = { uri, name, sub, image };
  if (mediaType) item.mediaType = mediaType;
  return item;
}

const MEDIA_CACHE_MS = 60_000;
const cache = new Map<string, { at: number; items: BrowseItem[] }>();

/**
 * Fetch a library list for a browse tab. Radio uses favourites first (the most
 * useful on a wall panel), tracks/playlists list the library. Cached briefly.
 */
export async function getLibrary(conn: HaConnection, mediaType: MaMediaType): Promise<BrowseItem[]> {
  const key = mediaType;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < MEDIA_CACHE_MS) return hit.items;

  const entry = await configEntryId(conn);
  if (!entry) return [];
  const data: Record<string, unknown> = {
    config_entry_id: entry,
    media_type: mediaType,
    limit: 100,
    offset: 0,
    order_by: "name",
  };
  if (mediaType === "radio") data["favorite"] = true;
  const res = await callServiceResponse(conn, "music_assistant", "get_library", data);
  const rawItems = (res?.["items"] as unknown[]) ?? [];
  const items = rawItems.map((r) => toItem(r, mediaType)).filter((x): x is BrowseItem => x !== null);
  cache.set(key, { at: Date.now(), items });
  return items;
}

// The search response groups results by plural bucket names.
const GROUPS: Array<{ type: MaMediaType; bucket: string; label: string }> = [
  { type: "artist", bucket: "artists", label: "Artists" },
  { type: "album", bucket: "albums", label: "Albums" },
  { type: "track", bucket: "tracks", label: "Tracks" },
  { type: "playlist", bucket: "playlists", label: "Playlists" },
  { type: "radio", bucket: "radio", label: "Radio" },
];

/**
 * Unified "search everything": one global search across every connected
 * provider (Apple Music, radio, local library, …), returned grouped by type.
 * Empty groups are dropped so the UI only renders what matched.
 */
export async function searchAll(conn: HaConnection, name: string): Promise<SearchGroup[]> {
  const entry = await configEntryId(conn);
  if (!entry || !name.trim()) return [];
  const res = await callServiceResponse(conn, "music_assistant", "search", {
    config_entry_id: entry,
    name: name.trim(),
    // Omit media_type → MA searches all types; `limit` caps items per bucket.
    limit: 12,
  });
  if (!res) return [];
  const out: SearchGroup[] = [];
  for (const g of GROUPS) {
    const raw = (res[g.bucket] as unknown[]) ?? [];
    const items = raw.map((r) => toItem(r, g.type)).filter((x): x is BrowseItem => x !== null);
    if (items.length) out.push({ type: g.type, label: g.label, items });
  }
  return out;
}

/** Play (or enqueue) a browse item on a player. radio_mode is set for radio. */
export async function playUri(
  conn: HaConnection,
  entityId: string,
  item: BrowseItem,
  mediaType: MaMediaType,
): Promise<void> {
  await conn
    .callService(
      "music_assistant",
      "play_media",
      {
        media_id: item.uri,
        media_type: mediaType,
        enqueue: "play",
        radio_mode: mediaType === "radio",
      },
      { entity_id: entityId },
    )
    .catch(() => {});
}
