// App state model, driven by the real-home config (src/ha/config.ts).
// The HA adapter fills live state into this shape; actions route to HA services.

import { getHome, sceneEntries } from "../ha/config";

export type TabId = "home" | "rooms" | "lights" | "media" | "watch" | "scenes" | "calendar";
export type RoomId = string;
export type MediaTab = "radio" | "lists" | "tracks";

export interface Light {
  id: string;
  type: "light";
  ent: string; // HA entity id
  room: RoomId;
  name: string;
  icon: string;
  on: boolean;
  available: boolean;
  level: number; // 0–100
  warm: number; // 0 cool … 100 warm
  dimmable: boolean;
  tunable: boolean; // supports colour temperature
  colorable: boolean; // supports an RGB/HS colour
  rgb: [number, number, number] | null; // current colour when set
}
export interface Tv {
  id: "tv";
  type: "tv";
  ent: string; // media_player entity id
  remote: string; // paired remote.* entity id (Android TV Remote), or ""
  room: RoomId;
  name: string;
  on: boolean;
  available: boolean;
  vol: number; // 0–100
  muted: boolean;
  playing: boolean; // assumed play state (Android TV Remote doesn't report reliably)
  app: string; // current foreground app name, or ""
  apps: TvApp[]; // launchable apps (reported by HA, else curated deep-link defaults)
}
/** A launchable app shortcut on the Watch screen. */
export interface TvApp {
  name: string; // display label (matched against the current foreground app)
  launch: string; // passed to remote.turn_on `activity` (a deep-link URL or app id)
}
export type Device = Light | Tv;

export interface Zone {
  id: RoomId;
  name: string;
  ent: string;
  on: boolean; // actively playing
  available: boolean;
  vol: number;
  title: string;
  artist: string;
  art: string; // entity_picture url, or ""
  pos: number;
  dur: number;
}
export interface Media {
  mtab: MediaTab;
  shuffle: boolean;
  repeat: boolean;
  zones: Zone[];
  /** uri of the last browse item the user picked (for the "current" highlight). */
  selUri: string;
  /** The "play on" speaker: zone id transport + browse act on. "" = none set. */
  target: RoomId | "";
}
export interface Sensor {
  temp: number | null;
  hum: number | null;
  motion: boolean | null;
  hasTemp: boolean;
  hasMotion: boolean;
  last: number;
  hist: number[];
  tser: number[];
}
export interface SceneItem {
  id: string; // HA entity id
  name: string;
  icon: string;
  kind: "scene" | "script";
}

export interface AppState {
  tab: TabId;
  room: RoomId | "all";
  rroom: RoomId;
  picker: boolean;
  lastScene: string | null;
  devices: Device[];
  media: Media;
  sensors: Record<RoomId, Sensor>;
  scenes: SceneItem[];
  weather: { condition: string; temp: number | null };
}

export interface RoomDef {
  id: RoomId;
  name: string;
  short: string;
}
// `ROOMS` is derived from the active config. It is a `let` so the bootstrap /
// Settings can rebuild it when the config changes; ES module live bindings mean
// every importer sees the new array after `rebuildRooms()` + a store bump.
export let ROOMS: RoomDef[] = buildRooms();
function buildRooms(): RoomDef[] {
  return getHome().rooms.map((r) => ({ id: r.id, name: r.name, short: r.short }));
}
export function rebuildRooms(): void {
  ROOMS = buildRooms();
}

export interface TabDef {
  id: TabId;
  name: string;
  icon: string;
}
// Full tab set in dock order. Some are conditional (see visibleTabs in the
// store): Watch shows only when the selected room has a TV; Calendar only when
// at least one calendar is configured.
export const TABS: TabDef[] = [
  { id: "home", name: "Home", icon: "home" },
  { id: "rooms", name: "Rooms", icon: "grid" },
  { id: "lights", name: "Lights", icon: "bulb" },
  { id: "media", name: "Media", icon: "music" },
  { id: "watch", name: "Watch", icon: "tv" },
  { id: "scenes", name: "Scenes", icon: "sparkles" },
  { id: "calendar", name: "Calendar", icon: "calendar" },
];

/** Media browse tab → Music Assistant media type. */
export function maTypeFor(t: MediaTab): "radio" | "playlist" | "track" {
  return t === "radio" ? "radio" : t === "lists" ? "playlist" : "track";
}

/** Prettify an entity id into a fallback name. */
export function prettify(entityId: string): string {
  const obj = entityId.split(".")[1] ?? entityId;
  const s = obj.replace(/_/g, " ").replace(/\bmass\b/gi, "").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function emptySensor(): Sensor {
  return { temp: null, hum: null, motion: null, hasTemp: false, hasMotion: false, last: 0, hist: [], tser: [] };
}

/** Initial state built from config; the adapter fills live values from HA. */
export function seed(): AppState {
  const home = getHome();
  const devices: Device[] = [];
  const zones: Zone[] = [];
  const sensors: Record<RoomId, Sensor> = {};

  for (const r of home.rooms) {
    sensors[r.id] = emptySensor();
    for (const ent of r.lights) {
      devices.push({
        id: ent,
        type: "light",
        ent,
        room: r.id,
        name: home.names?.[ent] ?? prettify(ent),
        icon: home.icons?.[ent] ?? "l-bulb",
        on: false,
        available: false,
        level: 60,
        warm: 60,
        dimmable: true,
        tunable: false,
        colorable: false,
        rgb: null,
      });
    }
    if (r.tv) {
      devices.push({
        id: "tv",
        type: "tv",
        ent: r.tv,
        remote: r.tvRemote ?? "",
        room: r.id,
        name: home.names?.[r.tv] ?? "TV",
        on: false,
        available: false,
        vol: 20,
        muted: false,
        playing: false,
        app: "",
        apps: [],
      });
    }
    for (const ent of r.speakers) {
      zones.push({
        id: r.id,
        name: home.names?.[ent] ?? r.name,
        ent,
        on: false,
        available: false,
        vol: 30,
        title: "",
        artist: "",
        art: "",
        pos: 0,
        dur: 0,
      });
    }
  }

  // Only scenes marked "show" reach the live Home/Scenes views; Settings edits
  // the full list (including hidden) via sceneEntries().
  const scenes: SceneItem[] = sceneEntries(home)
    .filter((s) => s.show)
    .map((s) => ({ id: s.id, name: s.name, icon: s.icon, kind: s.kind }));

  return {
    tab: "home",
    room: "all",
    rroom: home.rooms[0]?.id ?? "",
    picker: false,
    lastScene: null,
    devices,
    media: { mtab: "radio", shuffle: false, repeat: false, zones, selUri: "", target: zones[0]?.id ?? "" },
    sensors,
    scenes,
    weather: { condition: "cloudy", temp: null },
  };
}
