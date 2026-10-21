import { signal } from "@preact/signals";
import {
  seed,
  ROOMS,
  rebuildRooms,
  prettify,
  maTypeFor,
  TABS,
  type TabDef,
  type AppState,
  type Device,
  type Light,
  type Tv,
  type TvApp,
  type RoomId,
  type TabId,
  type MediaTab,
} from "./model";
import { getHome, setHome, displayName, type HomeConfig } from "../ha/config";
import { callService, getConnection } from "../ha/service";
import { getLibrary, searchAll, playUri, type BrowseItem, type SearchGroup, type MaMediaType } from "../ha/music";
import { getCalendarEvents, type CalEvent } from "../ha/calendar";
import { getCatalog } from "../ha/catalog";
import type { ConnectionStatus, HassEntity } from "../ha/types";

/** Central state; `rev` bumps on every change and components subscribe via useStore(). */
let _S: AppState = seed();
export const rev = signal(0);
export const connectionStatus = signal<ConnectionStatus>("connecting");
function bump(): void {
  rev.value++;
}
export function useStore(): AppState {
  rev.value;
  return _S;
}
export function peek(): AppState {
  return _S;
}
/** Re-render tick for the clock / idle checks (no simulation — HA pushes real state). */
export function tick(): void {
  bump();
}
/** Reset local state to the seed (HA re-fills on the next entity push). Dev only. */
export function reset(): void {
  _S = seed();
  bump();
}

/**
 * Swap in a new home config (auto-import at boot, or a Settings edit) and
 * re-seed from it. The next HA entity push re-fills live values. Rebuilds the
 * derived ROOMS list so the dock / picker / views follow.
 */
export function applyConfig(cfg: HomeConfig): void {
  setHome(cfg);
  rebuildRooms();
  _S = seed();
  // Re-apply the last live entities so on/off/brightness survive a config edit
  // (reseed starts from defaults; the next HA push would otherwise be the first
  // to refill, which the mock won't send). applyHa bumps.
  if (_lastEntities) applyHa(_lastEntities);
  else bump();
}

// ---- toast / undo ----
export const toast = signal<{ msg: string; undo: boolean; show: boolean }>({ msg: "", undo: false, show: false });
let undoFn: (() => void) | null = null;
let toastT: ReturnType<typeof setTimeout> | undefined;
export function showToast(msg: string, undo?: () => void): void {
  undoFn = undo ?? null;
  toast.value = { msg, undo: !!undo, show: true };
  clearTimeout(toastT);
  toastT = setTimeout(() => (toast.value = { ...toast.value, show: false }), 6000);
}
export function runUndo(): void {
  if (undoFn) {
    undoFn();
    undoFn = null;
    toast.value = { ...toast.value, show: false };
  }
}

// ---- selectors ----
export const dev = (id: string): Device | undefined => _S.devices.find((d) => d.id === id);
export const lights = (): Light[] => _S.devices.filter((d): d is Light => d.type === "light");
export const roomLights = (r: RoomId): Light[] => lights().filter((d) => d.room === r);
/** The TV in a room, if any (one per room). */
export const roomTv = (r: RoomId): Tv | undefined => _S.devices.find((d): d is Tv => d.type === "tv" && d.room === r);

/**
 * The dock tabs to show right now, in order. Watch appears only when the
 * selected room has a TV (brief: never show an empty "no TV here" page);
 * Calendar only when calendars are configured/discovered.
 */
export function visibleTabs(): TabDef[] {
  const hasWatch = !!roomTv(_S.rroom);
  const hasCal = calendarIds().length > 0;
  return TABS.filter((t) => (t.id === "watch" ? hasWatch : t.id === "calendar" ? hasCal : true));
}
/** Every calendar.* entity Home Assistant knows about (non-noise). */
export function allCalendarIds(): string[] {
  return getCatalog().filter((e) => e.dom === "calendar" && !e.noise).map((e) => e.id);
}
/**
 * Calendar entity ids to show. An explicit list in the config wins (even an
 * empty one — the user may have hidden them all); only when the config has never
 * set the field do we fall back to every calendar discovered.
 */
export function calendarIds(): string[] {
  const chosen = getHome().calendars;
  return chosen ? chosen : allCalendarIds();
}
export const playingRooms = (): AppState["media"]["zones"] => _S.media.zones.filter((z) => z.on);
const scopeLights = (): Light[] => (_S.room === "all" ? lights() : roomLights(_S.room));

/**
 * The speaker the Listen screen acts on ("play on"). Prefers the explicitly
 * chosen target, else the current room's speaker, else the first playing or
 * first available speaker — so transport + browse always have a sensible aim.
 */
export const targetZone = (): AppState["media"]["zones"][number] | undefined => {
  const z = _S.media.zones;
  const byTarget = z.find((x) => x.id === _S.media.target);
  if (byTarget) return byTarget;
  const byRoom = z.find((x) => x.id === _S.rroom);
  if (byRoom) return byRoom;
  return z.find((x) => x.on) ?? z.find((x) => x.available) ?? z[0];
};

// ---- colour temperature mapping (warm 0..100 ↔ kelvin) ----
const WARM_K = 2200;
const COOL_K = 6500;
const warmToKelvin = (warm: number): number => Math.round(COOL_K - (warm / 100) * (COOL_K - WARM_K));
export const kelvinToWarm = (k: number): number => Math.round(((COOL_K - k) / (COOL_K - WARM_K)) * 100);

// ---- navigation ----
export function setTab(id: TabId, picker = false): void {
  _S.tab = id;
  _S.picker = picker;
  bump();
}
export function togglePickerOrOpen(): void {
  if (_S.tab === "rooms") _S.picker = !_S.picker;
  else {
    _S.tab = "rooms";
    _S.picker = true;
  }
  bump();
}
export function closePicker(): void {
  _S.picker = false;
  bump();
}
export function selectRoom(id: RoomId): void {
  _S.rroom = id;
  _S.picker = false;
  // Brief rule: keep the current page when switching rooms, but if the new room
  // can't offer it (Watch with no TV), fall back to Home.
  if (_S.tab === "watch" && !roomTv(id)) _S.tab = "home";
  bump();
}
export function selectLightRoom(id: RoomId | "all"): void {
  _S.room = id;
  bump();
}
export function setMediaTab(t: AppState["media"]["mtab"]): void {
  _S.media.mtab = t;
  bump();
}

// ---- lights (optimistic update + HA service call) ----
export function toggleDevice(id: string): void {
  const d = dev(id);
  if (!d || !d.available) return;
  d.on = !d.on;
  bump();
  if (d.type === "light") void callService("light", "toggle", {}, { entity_id: d.ent });
  else void callService("media_player", d.on ? "turn_on" : "turn_off", {}, { entity_id: d.ent });
}
export function setLevel(id: string, v: number): void {
  const d = dev(id);
  if (!d || d.type !== "light") return;
  d.level = v;
  d.on = true;
  bump();
  void callService("light", "turn_on", { brightness_pct: v }, { entity_id: d.ent });
}
export function setWarm(id: string, v: number): void {
  const d = dev(id);
  if (!d || d.type !== "light") return;
  d.warm = v;
  d.on = true;
  bump();
  void callService("light", "turn_on", { color_temp_kelvin: warmToKelvin(v) }, { entity_id: d.ent });
}
export function setColor(id: string, rgb: [number, number, number]): void {
  const d = dev(id);
  if (!d || d.type !== "light") return;
  d.rgb = rgb;
  d.on = true;
  bump();
  void callService("light", "turn_on", { rgb_color: rgb }, { entity_id: d.ent });
}

// ---- light detail sheet (ephemeral UI; a signal so only the sheet re-renders) ----
export const detailId = signal<string | null>(null);
export function openLight(id: string): void {
  detailId.value = id;
}
export function closeLight(): void {
  detailId.value = null;
}
const PRESETS: Record<string, { level: number; warm: number; label: string }> = {
  bright: { level: 100, warm: 35, label: "Bright" },
  relax: { level: 40, warm: 90, label: "Relax" },
  night: { level: 10, warm: 100, label: "Night" },
};
export function applyPreset(k: string): void {
  const p = PRESETS[k];
  if (!p) return;
  const scope = scopeLights();
  const name = _S.room === "all" ? "All lights" : ROOMS.find((r) => r.id === _S.room)!.name;
  scope.forEach((d) => {
    d.on = true;
    d.level = p.level;
    d.warm = p.warm;
  });
  bump();
  const ids = scope.map((d) => d.ent);
  if (ids.length) void callService("light", "turn_on", { brightness_pct: p.level, color_temp_kelvin: warmToKelvin(p.warm) }, { entity_id: ids });
  showToast(p.label + " in " + name.toLowerCase());
}
export function allOffScope(): void {
  const scope = scopeLights();
  const name = _S.room === "all" ? "All lights" : ROOMS.find((r) => r.id === _S.room)!.name + " lights";
  scope.forEach((d) => (d.on = false));
  bump();
  const ids = scope.map((d) => d.ent);
  if (ids.length) void callService("light", "turn_off", {}, { entity_id: ids });
  showToast(name + " off");
}
export function alloffEverywhere(): void {
  const ls = lights();
  ls.forEach((d) => (d.on = false));
  bump();
  const ids = ls.map((d) => d.ent);
  if (ids.length) void callService("light", "turn_off", {}, { entity_id: ids });
  showToast("All lights are off");
}
export function roomEverythingOff(id: RoomId): void {
  const ls = roomLights(id);
  ls.forEach((l) => (l.on = false));
  const tv = _S.devices.find((d) => d.type === "tv" && d.room === id);
  if (tv) tv.on = false;
  // Stop any music playing in this room too (otherwise "everything off" lies).
  const zone = _S.media.zones.find((z) => z.id === id);
  const stopZone = zone && zone.on && zone.available ? zone : undefined;
  if (stopZone) stopZone.on = false;
  bump();
  const ids = ls.map((l) => l.ent);
  if (ids.length) void callService("light", "turn_off", {}, { entity_id: ids });
  if (tv) void callService("media_player", "turn_off", {}, { entity_id: tv.ent });
  if (stopZone) void callService("media_player", "media_pause", {}, { entity_id: stopZone.ent });
  showToast(ROOMS.find((r) => r.id === id)!.name + " is off");
}

// ---- scenes ----
export function runScene(id: string): void {
  const sc = _S.scenes.find((s) => s.id === id);
  if (!sc) return;
  _S.lastScene = id;
  bump();
  if (sc.kind === "scene") void callService("scene", "turn_on", {}, { entity_id: sc.id });
  else void callService("script", "turn_on", {}, { entity_id: sc.id });
  // A scene is "set"; a script is "run" — "is on" reads wrong for a script.
  showToast(sc.kind === "script" ? "Running " + sc.name : sc.name + " on");
}

// ---- media ----
// Transport acts on a specific speaker: the given zone id, else the "play on"
// target. In a room view the caller passes that room's zone; the Listen screen
// passes nothing and the target is used.
function zoneFor(id?: RoomId): AppState["media"]["zones"][number] | undefined {
  return id ? _S.media.zones.find((x) => x.id === id) : targetZone();
}
/** Choose which speaker the Listen screen controls. */
export function setTarget(id: RoomId): void {
  _S.media.target = id;
  bump();
}
export function play(id?: RoomId): void {
  const z = zoneFor(id);
  if (!z || !z.available) return;
  z.on = !z.on;
  holdOptimistic(z.ent, "on", z.on);
  bump();
  void callService("media_player", "media_play_pause", {}, { entity_id: z.ent });
}
export function skip(dir: number, id?: RoomId): void {
  const z = zoneFor(id);
  if (!z) return;
  void callService("media_player", dir > 0 ? "media_next_track" : "media_previous_track", {}, { entity_id: z.ent });
}
export function toggleZone(id: RoomId): void {
  const z = _S.media.zones.find((x) => x.id === id);
  if (!z || !z.available) return;
  z.on = !z.on;
  holdOptimistic(z.ent, "on", z.on);
  bump();
  void callService("media_player", z.on ? "media_play" : "media_pause", {}, { entity_id: z.ent });
}
export function setZoneVol(id: RoomId, v: number): void {
  const z = _S.media.zones.find((x) => x.id === id);
  if (!z) return;
  z.vol = v;
  // Volume and playback are independent: changing the volume must NOT mark a
  // paused speaker as "Playing".
  bump();
  void callService("media_player", "volume_set", { volume_level: v / 100 }, { entity_id: z.ent });
}
export function toggleShuffle(): void {
  _S.media.shuffle = !_S.media.shuffle;
  bump();
  const z = targetZone();
  if (z) void callService("media_player", "shuffle_set", { shuffle: _S.media.shuffle }, { entity_id: z.ent });
}
export function toggleRepeat(): void {
  _S.media.repeat = !_S.media.repeat;
  bump();
  const z = targetZone();
  if (z) void callService("media_player", "repeat_set", { repeat: _S.media.repeat ? "all" : "off" }, { entity_id: z.ent });
}
export function setSeek(v: number): void {
  const z = targetZone();
  if (!z) return;
  z.pos = v;
  bump();
  void callService("media_player", "media_seek", { seek_position: v }, { entity_id: z.ent });
}
// ---- media browse (Music Assistant: Radio / Playlists / Tracks + search) ----
type Status = "idle" | "loading" | "ready" | "error";
type BrowseState = { status: Status; items: BrowseItem[] };
const browse: Record<MediaTab, BrowseState> = {
  radio: { status: "idle", items: [] },
  lists: { status: "idle", items: [] },
  tracks: { status: "idle", items: [] },
};

// Unified "search everything" — overrides the tab library view while a query is
// present. Grouped by type (Artists / Albums / Tracks / Playlists / Radio).
export interface SearchState {
  q: string;
  status: Status;
  groups: SearchGroup[];
}
const searchState: SearchState = { q: "", status: "idle", groups: [] };
export function getSearch(): SearchState {
  return searchState;
}

export function getBrowse(tab: MediaTab): BrowseState {
  return browse[tab];
}

/** Load (or reload) the library list for a tab. Guarded; sets error on failure. */
export function loadBrowse(tab: MediaTab, force = false): void {
  const b = browse[tab];
  if (!force && (b.status === "loading" || b.status === "ready")) return;
  b.status = "loading";
  bump();
  void getLibrary(getConnection(), maTypeFor(tab))
    .then((items) => {
      browse[tab] = { status: "ready", items };
    })
    .catch(() => {
      browse[tab] = { status: "error", items: [] };
    })
    .finally(bump);
}

/** Global search across every provider; empty query clears back to the library. */
export function runSearch(query: string): void {
  searchState.q = query;
  if (!query.trim()) {
    searchState.status = "idle";
    searchState.groups = [];
    bump();
    return;
  }
  searchState.status = "loading";
  bump();
  void searchAll(getConnection(), query)
    .then((groups) => {
      if (searchState.q !== query) return; // a newer search won
      searchState.status = "ready";
      searchState.groups = groups;
    })
    .catch(() => {
      if (searchState.q !== query) return;
      searchState.status = "error";
      searchState.groups = [];
    })
    .finally(bump);
}

/** The speaker a "play" from the Listen screen lands on (the "play on" target). */
function listenTarget(): AppState["media"]["zones"][number] | undefined {
  const z = _S.media.zones;
  return z.find((x) => x.id === _S.media.target && x.available) ?? targetZone() ?? z.find((x) => x.available);
}

/** Play a library browse item (tab decides its media type). */
export function playBrowseItem(tab: MediaTab, item: BrowseItem): void {
  playItem(item, maTypeFor(tab));
}

/** Play a search result, using the item's own media type. */
export function playSearchItem(item: BrowseItem): void {
  playItem(item, item.mediaType ?? "track");
}

function playItem(item: BrowseItem, type: MaMediaType): void {
  const target = listenTarget();
  if (!target) {
    showToast("No speaker is available");
    return;
  }
  _S.media.selUri = item.uri;
  _S.media.target = target.id;
  target.on = true;
  bump();
  void playUri(getConnection(), target.ent, item, type);
  const verb = type === "radio" || type === "artist" ? "Playing " : "Queued ";
  showToast(verb + item.name + " on " + target.name);
}

// Curated app shortcuts for when HA reports no app list (the usual case for the
// Android TV Remote). `launch` is passed to remote.turn_on `activity`: an https
// deep link opens the app on Google TV; app-package ids are less reliable since
// a 2023 Play Store change, so prefer links. Edit these to match your TV's apps.
const CURATED_TV_APPS: TvApp[] = [
  { name: "YouTube", launch: "https://www.youtube.com" },
  { name: "Netflix", launch: "https://www.netflix.com/title" },
  { name: "Disney+", launch: "https://www.disneyplus.com" },
  { name: "Prime Video", launch: "https://app.primevideo.com" },
  { name: "BBC iPlayer", launch: "https://www.bbc.co.uk/iplayer" },
  { name: "Spotify", launch: "https://open.spotify.com" },
  { name: "ITVX", launch: "https://www.itv.com" },
  { name: "YouTube Music", launch: "https://music.youtube.com" },
];

// ---- TV / Watch (Android TV Remote) ----
// The Watch screen acts on the currently-selected room's TV. Keys go through the
// paired remote.* (remote.send_command); power/volume use the media_player; apps
// launch via remote.turn_on activity. Android TV Remote reports no reliable play
// state, so we treat transport/app optimistically.
export const watchTv = (): Tv | undefined => roomTv(_S.rroom);

export function tvPower(): void {
  const t = watchTv();
  if (!t || !t.available) return;
  t.on = !t.on;
  holdOptimistic(t.ent, "on", t.on);
  bump();
  void callService("media_player", t.on ? "turn_on" : "turn_off", {}, { entity_id: t.ent });
}
export function tvVol(dir: number): void {
  const t = watchTv();
  if (!t) return;
  t.vol = Math.max(0, Math.min(100, t.vol + (dir > 0 ? 5 : -5)));
  if (dir > 0) t.muted = false;
  bump();
  void callService("media_player", dir > 0 ? "volume_up" : "volume_down", {}, { entity_id: t.ent });
}
export function tvMute(): void {
  const t = watchTv();
  if (!t) return;
  t.muted = !t.muted;
  bump();
  void callService("media_player", "volume_mute", { is_volume_muted: t.muted }, { entity_id: t.ent });
}
/** Send a raw Android TV key through the paired remote (DPAD_UP, BACK, HOME, …). */
export function tvKey(command: string): void {
  const t = watchTv();
  if (!t) return;
  if (t.remote) void callService("remote", "send_command", { command }, { entity_id: t.remote });
}
export function tvPlayPause(): void {
  const t = watchTv();
  if (!t) return;
  t.playing = !t.playing;
  bump();
  tvKey("MEDIA_PLAY_PAUSE");
}
export function tvSkip(dir: number): void {
  tvKey(dir > 0 ? "MEDIA_NEXT" : "MEDIA_PREVIOUS");
}
/**
 * Launch an app on the TV. `app` carries a display name and a `launch` target
 * passed to `remote.turn_on` as `activity` — a deep-link URL (opens reliably on
 * Google TV) or, for HA-reported apps, the activity/source name itself.
 */
export function tvApp(app: TvApp): void {
  const t = watchTv();
  if (!t) return;
  t.app = app.name;
  t.on = true;
  bump();
  if (t.remote) void callService("remote", "turn_on", { activity: app.launch }, { entity_id: t.remote });
  showToast("Opening " + app.name + " on " + t.name);
}

// ---- Calendar ----
export interface CalendarState {
  status: "idle" | "loading" | "ready" | "error";
  events: CalEvent[];
  /** Week offset from the current week (0 = this week). */
  week: number;
  loadedWeek: number | null;
}
const calendar: CalendarState = { status: "idle", events: [], week: 0, loadedWeek: null };
export function getCalendar(): CalendarState {
  return calendar;
}
/** Monday 00:00 of the week `offset` weeks from now (local). */
function weekStart(offset: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - dow + offset * 7);
  return d;
}
export function setCalWeek(offset: number): void {
  calendar.week = offset;
  bump();
  loadCalendar(true);
}
/** Load events for the active week. Guarded so a visible tab only fetches once. */
export function loadCalendar(force = false): void {
  if (!force && (calendar.status === "loading" || (calendar.status === "ready" && calendar.loadedWeek === calendar.week))) return;
  const ids = calendarIds();
  if (!ids.length) {
    calendar.status = "ready";
    calendar.events = [];
    calendar.loadedWeek = calendar.week;
    bump();
    return;
  }
  const start = weekStart(calendar.week);
  const end = weekStart(calendar.week + 1);
  calendar.status = "loading";
  bump();
  void getCalendarEvents(getConnection(), ids, start, end)
    .then((events) => {
      calendar.status = "ready";
      calendar.events = events;
      calendar.loadedWeek = calendar.week;
    })
    .catch(() => {
      calendar.status = "error";
      calendar.events = [];
    })
    .finally(bump);
}

// ---- HA → state ----
const num = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);
let _lastEntities: Record<string, HassEntity> | null = null;

// Optimistic-action hold. After a local toggle we show the new value at once,
// but subscribe_entities keeps streaming the OLD state for a beat (HA hasn't
// acted yet), which flips play/pause (and power) icons back and forth. Hold the
// optimistic value for an entity+field until HA reports it (or a short timeout),
// so the control doesn't flicker.
const PENDING_MS = 5000;
const _pending = new Map<string, { value: unknown; until: number }>();
export function holdOptimistic(ent: string, field: string, value: unknown): void {
  _pending.set(ent + "\u0000" + field, { value, until: Date.now() + PENDING_MS });
}
/** True while we should keep the optimistic value instead of HA's `incoming`. */
function heldOptimistic(ent: string, field: string, incoming: unknown): boolean {
  const key = ent + "\u0000" + field;
  const p = _pending.get(key);
  if (!p) return false;
  if (Date.now() > p.until || incoming === p.value) {
    _pending.delete(key);
    return false;
  }
  return true;
}
export function applyHa(entities: Record<string, HassEntity>): void {
  _lastEntities = entities;
  for (const d of _S.devices) {
    const e = entities[d.ent];
    const avail = !!e && e.state !== "unavailable" && e.state !== "unknown";
    d.available = avail;
    if (!e) {
      d.on = false;
      continue;
    }
    d.name = displayName(d.ent, e.attributes.friendly_name);
    if (d.type === "light") {
      d.on = e.state === "on";
      // Capabilities from supported_color_modes (fall back to live attributes).
      const modes = Array.isArray(e.attributes.supported_color_modes)
        ? (e.attributes.supported_color_modes as string[])
        : [];
      if (modes.length) {
        d.dimmable = modes.some((m) => m !== "onoff");
        d.tunable = modes.includes("color_temp");
        d.colorable = modes.some((m) => ["hs", "rgb", "rgbw", "rgbww", "xy"].includes(m));
      }
      const br = num(e.attributes.brightness);
      d.dimmable = d.dimmable || br !== undefined;
      if (br !== undefined) d.level = Math.max(1, Math.round((br / 255) * 100));
      const k = num(e.attributes.color_temp_kelvin);
      if (k !== undefined) {
        d.tunable = true;
        d.warm = Math.max(0, Math.min(100, kelvinToWarm(k)));
      }
      const rgb = e.attributes.rgb_color;
      d.rgb = Array.isArray(rgb) && rgb.length === 3 ? [rgb[0], rgb[1], rgb[2]] as [number, number, number] : null;
    } else {
      // TV (media_player, device_class tv) + paired Android TV remote.
      const liveOn = e.state !== "off" && e.state !== "standby";
      if (!heldOptimistic(d.ent, "on", liveOn)) d.on = liveOn;
      // Play state is driven optimistically by the transport buttons: the
      // Android TV Remote reports no reliable play state, so overwriting it from
      // HA here only flips the play/pause icon back and forth. Leave `d.playing`
      // to tvPlayPause, but clear it when the TV is off so it doesn't resume
      // showing "pause".
      if (!d.on) d.playing = false;
      const vl = num(e.attributes.volume_level);
      if (vl !== undefined) d.vol = Math.round(vl * 100);
      d.muted = e.attributes.is_volume_muted === true;
      const rem = d.remote ? entities[d.remote] : undefined;
      // Current app + launchable apps: prefer the remote's activity info, fall
      // back to the media_player's source list.
      d.app =
        (rem?.attributes.current_activity as string | undefined) ||
        (e.attributes.app_name as string | undefined) ||
        (e.attributes.source as string | undefined) ||
        "";
      // Launchable apps: prefer what HA reports (remote activity_list / media
      // player source_list). The Android TV Remote usually reports none, so fall
      // back to a curated set of deep links that reliably open on Google TV.
      const reported =
        (rem?.attributes.activity_list as string[] | undefined) ||
        (e.attributes.source_list as string[] | undefined);
      d.apps =
        Array.isArray(reported) && reported.length
          ? reported.filter((a): a is string => typeof a === "string").map((a) => ({ name: a, launch: a }))
          : CURATED_TV_APPS;
      // The TV is available if either its media_player or its remote is reachable.
      if (!avail && rem && rem.state !== "unavailable" && rem.state !== "unknown") d.available = true;
    }
  }

  for (const z of _S.media.zones) {
    const e = entities[z.ent];
    z.available = !!e && e.state !== "unavailable" && e.state !== "unknown";
    if (!e) {
      z.on = false;
      z.title = "";
      continue;
    }
    z.name = getHome().names?.[z.ent] ?? roomNameFor(z.id) ?? e.attributes.friendly_name ?? z.name;
    const zoneOn = e.state === "playing";
    if (!heldOptimistic(z.ent, "on", zoneOn)) z.on = zoneOn;
    const vl = num(e.attributes.volume_level);
    if (vl !== undefined) z.vol = Math.round(vl * 100);
    z.title = (e.attributes.media_title as string) ?? "";
    z.artist = (e.attributes.media_artist as string) ?? "";
    z.art = (e.attributes.entity_picture as string) ?? "";
    z.pos = num(e.attributes.media_position) ?? 0;
    z.dur = num(e.attributes.media_duration) ?? 0;
  }

  const h = getHome();
  for (const sc of _S.scenes) {
    const e = entities[sc.id];
    const custom = h.sceneMeta?.[sc.id]?.name || h.names?.[sc.id];
    if (!custom && e?.attributes.friendly_name) sc.name = e.attributes.friendly_name;
  }

  // Sensors (optional per room, from config).
  for (const r of getHome().rooms) {
    const sn = _S.sensors[r.id]!;
    if (r.tempSensor) {
      const e = entities[r.tempSensor];
      sn.hasTemp = !!e;
      sn.temp = e ? Number(e.state) : null;
    }
    if (r.humSensor) {
      const e = entities[r.humSensor];
      sn.hum = e ? Number(e.state) : null;
    }
    if (r.motionSensor) {
      const e = entities[r.motionSensor];
      sn.hasMotion = !!e;
      sn.motion = e ? e.state === "on" : null;
      if (sn.motion) sn.last = Date.now();
    }
  }

  const w = entities[getHome().weather];
  if (w) {
    _S.weather.condition = w.state;
    _S.weather.temp = num(w.attributes.temperature) ?? _S.weather.temp;
  }

  bump();
}
function roomNameFor(id: RoomId): string | undefined {
  return ROOMS.find((r) => r.id === id)?.name;
}

// Keep prettify referenced for scenes fallback naming consistency.
void prettify;
