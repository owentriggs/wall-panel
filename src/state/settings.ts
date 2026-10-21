/**
 * Task 2 — Settings UI state + logic, ported from the SETTINGS section of
 * docs/hearth-prototype.html. The prototype mutated a demo state object; here
 * every edit mutates the LIVE HomeConfig (getHome) and is committed via
 * applyConfig + persisted via saveConfig. The entity picker is fed from the
 * live HA catalog (src/ha/catalog.ts), not a hardcoded list.
 */
import { rev } from "./store";
import { applyConfig, showToast, allCalendarIds, calendarIds, loadCalendar } from "./store";
import { saveConfig } from "./persist";
import { resyncHome } from "../ha/adapter";
import { getConnection } from "../ha/service";
import {
  getHome,
  getDisp,
  getPin,
  sceneEntries,
  type HomeConfig,
  type RoomConfig,
  type DispConfig,
} from "../ha/config";
import { getCatalog, catalogEntity, type CatalogEntity } from "../ha/catalog";
import { queryRoot, themeTarget } from "../ui/root";

export const MAX_SCENES = 6;
export const LIGHT_ICONS = ["l-bulb", "l-ceiling", "l-floor", "l-desk", "l-wall", "l-wallup"];
export const SCENE_ICONS = ["sun", "dinner", "relax", "movie", "moon", "power", "sparkles", "music"];
export const SECS: Array<[string, string, string]> = [
  ["overview", "Overview", "grid"],
  ["rooms", "Rooms", "door"],
  ["lights", "Lights", "bulb"],
  ["media", "Media", "music"],
  ["tv", "TV", "tv"],
  ["scenes", "Scenes", "sparkles"],
  ["calendar", "Calendar", "calendar"],
  ["display", "Display", "monitor"],
];

export interface EditState {
  kind: "light" | "speaker" | "tv" | "scene" | "room";
  id: string | null;
  isNew: boolean;
  draft: Record<string, string | boolean>;
}
export interface PickState {
  kind: "field" | "lights" | "speaker" | "scene";
  field?: string;
  dom: string;
  cls: string;
  title: string;
  q: string;
  sel: string[];
  all: boolean;
  multi: boolean;
  cta: string;
  current: string;
}
interface SettingsUI {
  open: boolean;
  sec: string;
  filter: string;
  edit: EditState | null;
  pick: PickState | null;
}

let UI: SettingsUI = { open: false, sec: "overview", filter: "all", edit: null, pick: null };
export function settingsUI(): SettingsUI {
  return UI;
}
function bump(): void {
  rev.value++;
}

// ---- re-sync with Home Assistant (refresh catalog + import, pick up new/removed devices) ----
let _syncing = false;
export function syncing(): boolean {
  return _syncing;
}
export function resync(): void {
  if (_syncing) return;
  _syncing = true;
  bump();
  void resyncHome()
    .then((res) => {
      if (res === null) {
        showToast("Couldn’t read Home Assistant. This account may lack admin access.");
      } else if (res.removed) {
        showToast("Synced · removed " + res.removed + (res.removed === 1 ? " deleted device" : " deleted devices"));
      } else {
        showToast("Synced with Home Assistant · " + res.entities + " entities");
      }
    })
    .finally(() => {
      _syncing = false;
      bump();
    });
}

// ---- config helpers ----
const cfg = (): HomeConfig => getHome();
const clone = (c: HomeConfig): HomeConfig => JSON.parse(JSON.stringify(c)) as HomeConfig;
const prettify = (id: string): string => {
  const o = id.split(".")[1] ?? id;
  const s = o.replace(/_/g, " ").replace(/\bmass\b/gi, "").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};
export const entName = (id: string): string => cfg().names?.[id] || catalogEntity(id)?.name || prettify(id);
export const roomName = (id: string): string => cfg().rooms.find((r) => r.id === id)?.name ?? "";

function commit(): void {
  const c = cfg();
  applyConfig(c);
  saveConfig(getConnection(), c);
}
function withUndo(msg: string, mutate: () => void): void {
  const snap = clone(cfg());
  mutate();
  commit();
  showToast(msg, () => {
    applyConfig(snap);
    saveConfig(getConnection(), snap);
  });
}

// ---- derived lists for the sections ----
export interface LightItem { ent: string; room: string; name: string; icon: string }
export function lightItems(): LightItem[] {
  const c = cfg();
  const out: LightItem[] = [];
  for (const r of c.rooms) for (const ent of r.lights) out.push({ ent, room: r.id, name: c.names?.[ent] ?? prettify(ent), icon: c.icons?.[ent] ?? "l-bulb" });
  return out;
}
export interface SpeakerItem { ent: string; room: string; name: string }
export function speakerItems(): SpeakerItem[] {
  const c = cfg();
  const out: SpeakerItem[] = [];
  for (const r of c.rooms) for (const ent of r.speakers) out.push({ ent, room: r.id, name: c.names?.[ent] ?? r.name });
  return out;
}
export interface TvItem { ent: string; remote: string; room: string; name: string }
export function tvItems(): TvItem[] {
  const c = cfg();
  const out: TvItem[] = [];
  for (const r of c.rooms) if (r.tv) out.push({ ent: r.tv, remote: r.tvRemote ?? "", room: r.id, name: c.names?.[r.tv] ?? (r.name + " TV") });
  return out;
}
export const sceneItems = (): ReturnType<typeof sceneEntries> => sceneEntries(cfg());
export const rooms = (): RoomConfig[] => cfg().rooms;

/** Every entity id currently placed on the panel → where it is used. */
export function usedMap(): Record<string, string> {
  const u: Record<string, string> = {};
  const c = cfg();
  for (const r of c.rooms) {
    for (const e of r.lights) u[e] = "Lights";
    for (const e of r.speakers) u[e] = "Speakers";
    if (r.tv) u[r.tv] = "TV";
    if (r.tvRemote) u[r.tvRemote] = "TV";
    for (const s of [r.tempSensor, r.humSensor, r.motionSensor]) if (s) u[s] = "Rooms";
  }
  for (const e of c.scenes) u[e] = "Scenes";
  for (const e of c.scripts) u[e] = "Scenes";
  return u;
}
/** Entities in HA (non-noise) that are not yet on the panel — Overview inbox. */
export function unusedList(): CatalogEntity[] {
  const u = usedMap();
  return getCatalog().filter((e) => !e.noise && !u[e.id] && (e.dom === "light" || e.cls === "speaker" || e.dom === "scene" || e.dom === "script"));
}

function guessIcon(name: string): string {
  const l = name.toLowerCase();
  if (/ceiling|pendant|island/.test(l)) return "l-ceiling";
  if (/lamp|floor/.test(l)) return "l-floor";
  if (/desk|bedside/.test(l)) return "l-desk";
  if (/shelf|strip|cabinet|under/.test(l)) return "l-wallup";
  if (/wall|porch|garden|mirror/.test(l)) return "l-wall";
  return "l-bulb";
}
function guessRoom(name: string): string | null {
  const l = name.toLowerCase();
  const r = cfg().rooms.find((x) => l.includes(x.short.toLowerCase()) || l.includes(x.name.toLowerCase()));
  return r?.id ?? null;
}

// ---- display ----
export function getDisplay(): DispConfig {
  return getDisp();
}
/** Apply theme + brightness to the DOM. Safe to call anytime. */
export function applyDisp(): void {
  const d = getDisp();
  const root = themeTarget();
  if (d.theme === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", d.theme);
  const stage = queryRoot<HTMLElement>(".stage");
  if (stage) stage.style.filter = d.bright < 100 ? `brightness(${(d.bright / 100).toFixed(2)})` : "";
}
function setDisp(patch: Partial<DispConfig>): void {
  // Display settings don't change rooms/devices, so avoid a full reseed — just
  // apply to the DOM, persist, and re-render (getDisp() is read live elsewhere).
  const c = cfg();
  c.disp = { ...getDisp(), ...patch };
  applyDisp();
  saveConfig(getConnection(), c);
  bump();
}

// ---- calendars ----
/** All calendar.* entities HA knows about, for the Settings Calendar list. */
export function calendarChoices(): CatalogEntity[] {
  return getCatalog().filter((e) => e.dom === "calendar" && !e.noise);
}
/** Whether a calendar is currently shown on the Calendar page. */
export function calShown(id: string): boolean {
  return calendarIds().includes(id);
}
/** Toggle a calendar's visibility. Writes an explicit list so "none" sticks. */
export function toggleCal(id: string): void {
  const c = cfg();
  const cur = c.calendars ?? allCalendarIds();
  c.calendars = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  commit();
  loadCalendar(true);
}

// ---- PIN gate (lets a non-admin kiosk account reach Settings) ----
interface PinPrompt { open: boolean; entry: string; error: boolean }
let PIN: PinPrompt = { open: false, entry: "", error: false };
export function pinPrompt(): PinPrompt {
  return PIN;
}
function isAdmin(): boolean {
  try { return getConnection().isAdmin(); } catch { return false; }
}
/** Entry point for the gear: admins open straight in, everyone else enters a PIN. */
export function requestSettings(): void {
  if (isAdmin()) { openSettings(); return; }
  PIN = { open: true, entry: "", error: false };
  bump();
}
export function cancelPin(): void {
  PIN = { open: false, entry: "", error: false };
  bump();
}
/** Keypad input: a digit, or "del". Four correct digits unlock Settings. */
export function pinPush(key: string): void {
  if (!PIN.open) return;
  if (key === "del") { PIN.entry = PIN.entry.slice(0, -1); PIN.error = false; bump(); return; }
  if (PIN.entry.length >= 4) return;
  PIN.entry += key;
  PIN.error = false;
  if (PIN.entry.length === 4) {
    if (PIN.entry === getPin()) {
      PIN = { open: false, entry: "", error: false };
      openSettings();
      return;
    }
    PIN.error = true;
    PIN.entry = "";
  }
  bump();
}
/** Change the Settings PIN (Display section). Kept to 4 digits. */
export function setPin(v: string): void {
  const digits = v.replace(/\D/g, "").slice(0, 4);
  if (digits.length !== 4) { showToast("PIN must be 4 digits"); return; }
  const c = cfg();
  c.pin = digits;
  saveConfig(getConnection(), c);
  showToast("PIN updated");
  bump();
}

// ---- open / close ----
export function openSettings(): void {
  UI = { open: true, sec: "overview", filter: "all", edit: null, pick: null };
  bump();
}
export function closeSettings(): void {
  UI = { ...UI, open: false, edit: null, pick: null };
  bump();
}

// ---- editing ----
export function openEdit(kind: EditState["kind"], id: string | null, preset?: Record<string, string | boolean>): void {
  const c = cfg();
  let draft: Record<string, string | boolean> = {};
  if (kind === "light") {
    const it = id ? lightItems().find((l) => l.ent === id) : null;
    draft = it ? { name: it.name, room: it.room, icon: it.icon, ent: it.ent } : { name: "", room: c.rooms[0]?.id ?? "", icon: "l-bulb", ent: "", ...(preset ?? {}) };
  } else if (kind === "speaker") {
    const it = id ? speakerItems().find((s) => s.ent === id) : null;
    draft = it ? { name: it.name, room: it.room, ent: it.ent } : { name: "", room: c.rooms[0]?.id ?? "", ent: "", ...(preset ?? {}) };
  } else if (kind === "tv") {
    const it = id ? tvItems().find((t) => t.ent === id) : null;
    draft = it
      ? { name: it.name, room: it.room, ent: it.ent, remote: it.remote }
      : { name: "", room: c.rooms[0]?.id ?? "", ent: "", remote: "", ...(preset ?? {}) };
  } else if (kind === "scene") {
    const it = id ? sceneItems().find((s) => s.id === id) : null;
    draft = it ? { name: it.name, icon: it.icon, ent: it.id, show: it.show } : { name: "", icon: "sparkles", ent: "", show: true, ...(preset ?? {}) };
  } else {
    const r = id ? c.rooms.find((x) => x.id === id) : null;
    draft = r ? { name: r.name, temp: r.tempSensor ?? "", hum: r.humSensor ?? "", motion: r.motionSensor ?? "" } : { name: "", temp: "", hum: "", motion: "" };
  }
  UI = { ...UI, edit: { kind, id, isNew: !id, draft }, pick: null };
  bump();
}
export function closeEdit(): void {
  UI = { ...UI, edit: null };
  bump();
}
export function setField(field: string, value: string): void {
  if (UI.edit) UI.edit.draft[field] = value;
  bump();
}
export function toggleField(field: string): void {
  if (UI.edit) UI.edit.draft[field] = !UI.edit.draft[field];
  bump();
}
export function clearField(field: string): void {
  if (UI.edit) UI.edit.draft[field] = "";
  bump();
}

export function roomRemovable(id: string): boolean {
  const c = cfg();
  const r = c.rooms.find((x) => x.id === id);
  if (!r) return false;
  return r.lights.length === 0 && r.speakers.length === 0 && !r.tv && c.rooms.length > 1;
}

function removeEntEverywhere(c: HomeConfig, ent: string): void {
  for (const r of c.rooms) {
    r.lights = r.lights.filter((e) => e !== ent);
    r.speakers = r.speakers.filter((e) => e !== ent);
    if (r.tv === ent) { delete r.tv; delete r.tvRemote; }
    if (r.tvRemote === ent) delete r.tvRemote;
  }
  if (c.names) delete c.names[ent];
  if (c.icons) delete c.icons[ent];
}

export function saveEdit(): void {
  const e = UI.edit;
  if (!e) return;
  const dr = e.draft;
  const name = String(dr.name ?? "").trim();
  if (!name) {
    showToast("Give it a name first");
    return;
  }
  const c = cfg();
  c.names = c.names ?? {};
  c.icons = c.icons ?? {};

  if (e.kind === "light") {
    const ent = String(dr.ent ?? "");
    if (!ent) { showToast("Choose a Home Assistant entity first"); return; }
    const room = c.rooms.find((r) => r.id === String(dr.room)) ?? c.rooms[0];
    if (!room) return;
    if (e.id && e.id !== ent) removeEntEverywhere(c, e.id);
    else if (e.id) removeEntFromRooms(c, e.id, "lights");
    if (!room.lights.includes(ent)) room.lights.push(ent);
    c.names[ent] = name;
    c.icons[ent] = String(dr.icon ?? "l-bulb");
  } else if (e.kind === "speaker") {
    const ent = String(dr.ent ?? "");
    if (!ent) { showToast("Choose a Home Assistant entity first"); return; }
    const room = c.rooms.find((r) => r.id === String(dr.room)) ?? c.rooms[0];
    if (!room) return;
    if (e.id && e.id !== ent) removeEntEverywhere(c, e.id);
    else if (e.id) removeEntFromRooms(c, e.id, "speakers");
    if (!room.speakers.includes(ent)) room.speakers.push(ent);
    c.names[ent] = name;
  } else if (e.kind === "tv") {
    const ent = String(dr.ent ?? "");
    if (!ent) { showToast("Choose the TV’s media player first"); return; }
    const room = c.rooms.find((r) => r.id === String(dr.room)) ?? c.rooms[0];
    if (!room) return;
    // One TV per room: clear this media_player from wherever it was, and clear
    // the target room's existing TV, then set the new pairing.
    if (e.id) removeEntEverywhere(c, e.id);
    if (room.tv && room.tv !== ent) { delete c.names[room.tv]; delete room.tvRemote; }
    room.tv = ent;
    const remote = String(dr.remote ?? "");
    if (remote) room.tvRemote = remote; else delete room.tvRemote;
    c.names[ent] = name;
  } else if (e.kind === "scene") {
    const ent = String(dr.ent ?? "");
    if (!ent) { showToast("Choose a scene or script first"); return; }
    c.sceneMeta = c.sceneMeta ?? {};
    const isScript = ent.startsWith("script.");
    const list = isScript ? c.scripts : c.scenes;
    if (e.id && e.id !== ent) {
      removeScene(c, e.id);
    }
    if (!list.includes(ent)) list.push(ent);
    let show = dr.show !== false;
    const shown = sceneEntries(c).filter((s) => s.show && s.id !== ent).length;
    if (show && shown >= MAX_SCENES) { show = false; showToast("Saved, but hidden. The panel shows up to " + MAX_SCENES + " scenes."); }
    c.sceneMeta[ent] = { name, icon: String(dr.icon ?? "sparkles"), hidden: !show };
  } else {
    // room
    const short = name.length > 9 ? name.split(" ")[0]! : name;
    if (e.id) {
      const r = c.rooms.find((x) => x.id === e.id);
      if (r) { r.name = name; r.short = short; setSensors(r, dr); }
    } else {
      const id = "r" + (Date.now() % 1e7);
      const r: RoomConfig = { id, name, short, lights: [], speakers: [] };
      setSensors(r, dr);
      c.rooms.push(r);
    }
  }
  UI = { ...UI, edit: null };
  commit();
}

function removeEntFromRooms(c: HomeConfig, ent: string, key: "lights" | "speakers"): void {
  for (const r of c.rooms) r[key] = r[key].filter((e) => e !== ent);
}
function removeScene(c: HomeConfig, ent: string): void {
  c.scenes = c.scenes.filter((e) => e !== ent);
  c.scripts = c.scripts.filter((e) => e !== ent);
  if (c.sceneMeta) delete c.sceneMeta[ent];
}
function setSensors(r: RoomConfig, dr: Record<string, string | boolean>): void {
  const temp = String(dr.temp ?? ""), hum = String(dr.hum ?? ""), motion = String(dr.motion ?? "");
  if (temp) r.tempSensor = temp; else delete r.tempSensor;
  if (hum) r.humSensor = hum; else delete r.humSensor;
  if (motion) r.motionSensor = motion; else delete r.motionSensor;
}

export function removeEdit(): void {
  const e = UI.edit;
  if (!e) return;
  const id = e.id;
  const nm = String(e.draft.name || "Item");
  UI = { ...UI, edit: null };
  if (!id) { bump(); return; }
  if (e.kind === "light") return withUndo(nm + " removed from the panel", () => removeEntEverywhere(cfg(), id));
  if (e.kind === "speaker") return withUndo(nm + " speaker removed", () => removeEntEverywhere(cfg(), id));
  if (e.kind === "tv") return withUndo(nm + " removed", () => removeEntEverywhere(cfg(), id));
  if (e.kind === "scene") { removeScene(cfg(), id); showToast(nm + " removed"); commit(); return; }
  // room
  const c = cfg();
  c.rooms = c.rooms.filter((r) => r.id !== id);
  showToast(nm + " removed");
  commit();
}

// ---- picking (entities, from the live catalog) ----
export function openPick(o: Partial<PickState> & Pick<PickState, "kind" | "dom" | "title">): void {
  UI = { ...UI, pick: { cls: "", q: "", sel: [], all: false, multi: false, cta: "Use entity", current: "", ...o } };
  bump();
}
export function closePick(): void {
  UI = { ...UI, pick: null };
  bump();
}
export function setPickQuery(q: string): void {
  if (UI.pick) UI.pick.q = q;
  bump();
}
export function setPickAll(all: boolean): void {
  if (UI.pick) UI.pick.all = all;
  bump();
}
export function togglePickRow(id: string): void {
  const p = UI.pick;
  if (!p) return;
  const i = p.sel.indexOf(id);
  if (p.multi) { if (i >= 0) p.sel.splice(i, 1); else p.sel.push(id); }
  else p.sel = i >= 0 ? [] : [id];
  bump();
}

function lightPreset(ent: string): Record<string, string> {
  const e = catalogEntity(ent);
  const nm = e?.name ?? prettify(ent);
  const room = guessRoom(nm) ?? (UI.filter !== "all" ? UI.filter : cfg().rooms[0]?.id ?? "");
  const r = cfg().rooms.find((x) => x.id === room);
  const clean = r ? nm.replace(new RegExp("^" + r.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s+", "i"), "") : nm;
  return { ent, room, name: clean.charAt(0).toUpperCase() + clean.slice(1), icon: guessIcon(nm) };
}

export function pickDone(): void {
  const p = UI.pick;
  if (!p || !p.sel.length) return;
  const sel = p.sel.slice();
  UI = { ...UI, pick: null };
  if (p.kind === "field" && UI.edit && p.field) {
    UI.edit.draft[p.field] = sel[0]!;
    bump();
    return;
  }
  if (p.kind === "lights") {
    const c = cfg();
    c.names = c.names ?? {};
    c.icons = c.icons ?? {};
    for (const ent of sel) {
      const pre = lightPreset(ent);
      const room = c.rooms.find((r) => r.id === pre.room) ?? c.rooms[0];
      if (!room) continue;
      if (!room.lights.includes(ent)) room.lights.push(ent);
      c.names[ent] = pre.name!;
      c.icons[ent] = pre.icon!;
    }
    showToast("Added " + sel.length + (sel.length === 1 ? " light" : " lights") + ". Tap one to change its room or name.");
    commit();
    return;
  }
  if (p.kind === "speaker") {
    openEdit("speaker", null, { ent: sel[0]!, name: (catalogEntity(sel[0]!)?.name ?? "").replace(/\s+speaker$/i, "") });
    return;
  }
  // scene
  openEdit("scene", null, { ent: sel[0]!, name: catalogEntity(sel[0]!)?.name ?? prettify(sel[0]!), icon: "sparkles", show: true });
}

export function addEntity(ent: string): void {
  const e = catalogEntity(ent);
  if (!e) return;
  if (e.dom === "light") openEdit("light", null, lightPreset(ent));
  else if (e.cls === "speaker") openEdit("speaker", null, { ent, name: e.name.replace(/\s+speaker$/i, "") });
  else openEdit("scene", null, { ent, name: e.name, icon: "sparkles", show: true });
}

// ---- section nav + small toggles ----
export function setSec(sec: string): void {
  UI = { ...UI, sec, filter: "all" };
  bump();
}
export function setFilter(f: string): void {
  UI = { ...UI, filter: f };
  bump();
}
export function newItem(a: string): void {
  if (a === "lights") openPick({ kind: "lights", title: "Add lights", dom: "light", multi: true, cta: "Add" });
  else if (a === "speaker") openPick({ kind: "speaker", title: "Choose a speaker", dom: "media_player", cls: "speaker" });
  else if (a === "scene") openPick({ kind: "scene", title: "Choose a scene or script", dom: "scene,script", cta: "Continue" });
  else if (a === "tv") openEdit("tv", null);
  else if (a === "room") openEdit("room", null);
}
export function pickForField(field: string, dom: string, cls: string, title: string): void {
  const cur = UI.edit ? String(UI.edit.draft[field] ?? "") : "";
  openPick({ kind: "field", field, dom, cls, title, current: cur, sel: cur ? [cur] : [], all: false });
}
export function toggleScene(id: string): void {
  const c = cfg();
  c.sceneMeta = c.sceneMeta ?? {};
  const cur = sceneEntries(c).find((s) => s.id === id);
  const show = !!cur?.show;
  if (!show && sceneEntries(c).filter((s) => s.show).length >= MAX_SCENES) {
    showToast("The panel shows up to " + MAX_SCENES + " scenes. Hide one first.");
    return;
  }
  c.sceneMeta[id] = { ...(c.sceneMeta[id] ?? {}), hidden: show };
  commit();
}
export function setTheme(t: string): void {
  setDisp({ theme: t as DispConfig["theme"] });
}
export function setClock(a: string): void {
  setDisp({ h12: a === "12" });
}
export function setBright(v: number): void {
  setDisp({ bright: v });
}
export function setSleep(v: number): void {
  setDisp({ sleep: v });
}
export function resetAll(): void {
  const c = cfg();
  c.names = {};
  c.icons = {};
  c.sceneMeta = {};
  c.disp = undefined;
  applyDisp();
  commit();
  showToast("Settings reset");
}
