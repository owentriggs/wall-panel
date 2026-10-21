import type { JSX, ComponentChildren } from "preact";
import { Icon } from "../Icon";
import { Slider } from "../widgets";
import { useStore, connectionStatus } from "../../state/store";
import { getCatalog } from "../../ha/catalog";
import {
  settingsUI,
  SECS,
  MAX_SCENES,
  LIGHT_ICONS,
  SCENE_ICONS,
  entName,
  roomName,
  lightItems,
  speakerItems,
  tvItems,
  sceneItems,
  rooms,
  usedMap,
  unusedList,
  getDisplay,
  closeSettings,
  setSec,
  setFilter,
  newItem,
  addEntity,
  openEdit,
  closeEdit,
  saveEdit,
  removeEdit,
  setField,
  toggleField,
  clearField,
  pickForField,
  roomRemovable,
  closePick,
  pickDone,
  setPickQuery,
  setPickAll,
  togglePickRow,
  toggleScene,
  setTheme,
  setClock,
  setBright,
  setSleep,
  resetAll,
  resync,
  syncing,
  setPin,
  calendarChoices,
  calShown,
  toggleCal,
} from "../../state/settings";
import { getPin } from "../../ha/config";

// ---- small kit (mirrors the prototype's sHead/sCard/sRow/sSeg/sSet) ----
function SHead({ t, sub, action }: { t: string; sub?: string; action?: ComponentChildren }): JSX.Element {
  return (
    <header class="s-head">
      <div class="grow">
        <h2>{t}</h2>
        {sub && <p>{sub}</p>}
      </div>
      {action}
    </header>
  );
}
function SCard({ label, style, children }: { label?: string; style?: string; children: ComponentChildren }): JSX.Element {
  return (
    <section class="card s-card" style={style}>
      {label && <div class="s-lab">{label}</div>}
      {children}
    </section>
  );
}
interface RowOpts {
  icon?: string;
  title: string;
  sub?: string;
  mono?: boolean;
  right?: ComponentChildren;
  ctrl?: ComponentChildren;
  dim?: boolean;
  onClick?: () => void;
  chev?: boolean;
  disabled?: boolean;
  pressed?: boolean;
}
function SRow(o: RowOpts): JSX.Element {
  const main = (
    <>
      {o.icon && <span class="s-ico"><Icon n={o.icon} /></span>}
      <span class="s-txt">
        <b>{o.title}</b>
        {o.sub && <span class={o.mono ? "mono" : undefined}>{o.sub}</span>}
      </span>
      {o.right}
      {o.onClick && o.chev !== false && <span class="s-chev"><Icon n="chev" /></span>}
    </>
  );
  return (
    <div class={"s-row" + (o.dim ? " dim" : "")}>
      {o.onClick ? (
        <button class="s-main" onClick={o.onClick} disabled={o.disabled} aria-pressed={o.pressed}>{main}</button>
      ) : (
        <div class="s-main">{main}</div>
      )}
      {o.ctrl}
    </div>
  );
}
const SVal = ({ children }: { children: ComponentChildren }): JSX.Element => <span class="s-val">{children}</span>;
function SBtn({ label, icon, onClick, primary, disabled }: { label: string; icon?: string; onClick: () => void; primary?: boolean; disabled?: boolean }): JSX.Element {
  return (
    <button class={"btn" + (primary ? " primary" : "")} onClick={onClick} disabled={disabled}>
      {icon && <Icon n={icon} />}
      {label}
    </button>
  );
}
function SSwitch({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }): JSX.Element {
  return (
    <button class="swb" role="switch" aria-checked={on} aria-label={label} onClick={onClick}>
      <span class="sw" aria-checked={on ? "true" : "false"} />
    </button>
  );
}
function SSeg({ opts, cur, onPick }: { opts: Array<[string | number, string, boolean?]>; cur: string | number; onPick: (v: string) => void }): JSX.Element {
  return (
    <div class="seg s-seg" role="group">
      {opts.map((o) => (
        <button key={o[0]} class={String(o[0]) === String(cur) ? "cur" : ""} aria-pressed={String(o[0]) === String(cur)} disabled={o[2]} onClick={() => onPick(String(o[0]))}>{o[1]}</button>
      ))}
    </div>
  );
}
function SSet({ title, sub, ctl }: { title: string; sub?: string; ctl: ComponentChildren }): JSX.Element {
  return (
    <div class="s-set">
      <div class="s-txt"><b>{title}</b>{sub && <span>{sub}</span>}</div>
      {ctl}
    </div>
  );
}
const SEmpty = ({ icon, msg }: { icon: string; msg: string }): JSX.Element => (
  <div class="bigmsg"><Icon n={icon} /><p>{msg}</p></div>
);

// ---- sections ----
function Overview(): JSX.Element {
  const un = unusedList();
  const nSp = speakerItems().length;
  const cs = connectionStatus.value;
  const live = cs === "connected";
  const csLabel = live ? "Connected" : cs === "connecting" ? "Connecting…" : cs === "reconnecting" ? "Reconnecting…" : "Disconnected";
  const csSub = live ? "Reusing the panel's authenticated session" : cs === "disconnected" ? "Lost contact with Home Assistant" : "Waiting for Home Assistant…";
  return (
    <>
      <SHead t="Overview" sub="What the panel is connected to and what is set up." />
      <div class="s-body s-two">
        <div class="s-colstack">
          <SCard label="Home Assistant">
            <div class="s-status"><i class={"s-dot" + (live ? "" : " off")} /><b>{csLabel}</b><span class="muted">{live ? "Live" : "—"}</span></div>
            <SRow icon="wifi" title="Connection" sub={csSub} mono />
            <SRow icon="grid" title="Entities" sub="Found in Home Assistant" right={<SVal>{getCatalog().length || "—"}</SVal>} />
            <SRow
              icon="sync"
              title="Sync devices"
              sub="Pick up anything added or removed in HA"
              ctrl={<SBtn label={syncing() ? "Syncing…" : "Re-sync"} icon="sync" onClick={resync} disabled={syncing()} />}
            />
          </SCard>
          <SCard label="On this panel" style="flex:1">
            <SRow icon="door" title="Rooms" right={<SVal>{rooms().length}</SVal>} onClick={() => setSec("rooms")} />
            <SRow icon="bulb" title="Lights" right={<SVal>{lightItems().length}</SVal>} onClick={() => setSec("lights")} />
            <SRow icon="speaker" title="Speakers" right={<SVal>{nSp}</SVal>} onClick={() => setSec("media")} />
            <SRow icon="tv" title="TVs" right={<SVal>{tvItems().length}</SVal>} onClick={() => setSec("tv")} />
            <SRow icon="sparkles" title="Scenes" right={<SVal>{sceneItems().filter((s) => s.show).length + " shown"}</SVal>} onClick={() => setSec("scenes")} />
          </SCard>
        </div>
        <SCard label={"Not used yet · " + un.length} style="flex:1">
          <div class="s-list">
            {un.length ? (
              un.map((e) => (
                <SRow
                  key={e.id}
                  icon={e.dom === "light" ? "bulb" : e.cls === "speaker" ? "speaker" : "sparkles"}
                  title={e.name}
                  sub={e.id}
                  mono
                  ctrl={<button class="btn s-small" onClick={() => addEntity(e.id)}><Icon n="plus" />Add</button>}
                />
              ))
            ) : (
              <SEmpty icon="check" msg="Everything from Home Assistant is on the panel." />
            )}
          </div>
        </SCard>
      </div>
    </>
  );
}

function RoomsSec(): JSX.Element {
  return (
    <>
      <SHead t="Rooms" sub="Name your rooms and choose their sensors." />
      <div class="s-body">
        <div class="cards s-rooms scroll">
          {rooms().map((r) => {
            const ns = [r.tempSensor, r.humSensor, r.motionSensor].filter(Boolean).length;
            const sp = speakerItems().find((s) => s.room === r.id);
            const nl = r.lights.length;
            return (
              <button key={r.id} class="card s-rc" onClick={() => openEdit("room", r.id)}>
                <b>{r.name}</b>
                <span class="s-mini"><Icon n="bulb" />{nl + (nl === 1 ? " light" : " lights")}</span>
                <span class="s-mini"><Icon n="speaker" />{sp ? sp.name : "No speaker"}</span>
                <span class="s-mini"><Icon n="temp" />{ns ? ns + (ns === 1 ? " sensor" : " sensors") : "No sensors"}</span>
              </button>
            );
          })}
          <button class="card s-rc s-addtile" onClick={() => newItem("room")}><Icon n="plus" /><b>Add room</b></button>
        </div>
      </div>
    </>
  );
}

function LightsSec(): JSX.Element {
  const S = settingsUI();
  const f = S.filter;
  const list = lightItems().filter((l) => f === "all" || l.room === f);
  return (
    <>
      <SHead t="Lights" sub={lightItems().length + " lights across " + rooms().length + " rooms."} action={<SBtn label="Add lights" icon="plus" primary onClick={() => newItem("lights")} />} />
      <div class="s-body">
        <SSeg opts={[["all", "All"] as [string, string], ...rooms().map((r) => [r.id, r.short] as [string, string])]} cur={f} onPick={setFilter} />
        <SCard style="flex:1">
          <div class="s-list">
            {list.length ? (
              list.map((d) => (
                <SRow key={d.ent} icon={d.icon} title={d.name} sub={d.ent || "No entity"} mono right={<SVal>{roomName(d.room)}</SVal>} onClick={() => openEdit("light", d.ent)} />
              ))
            ) : (
              <SEmpty icon="bulb" msg="No lights here yet. Use Add lights." />
            )}
          </div>
        </SCard>
      </div>
    </>
  );
}

function MediaSec(): JSX.Element {
  const sp = speakerItems();
  return (
    <>
      <SHead t="Media" sub="Choose the speakers on the panel." action={<SBtn label="Add speaker" icon="plus" primary onClick={() => newItem("speaker")} />} />
      <div class="s-body">
        <SCard label={"Speakers · " + sp.length} style="flex:1">
          <div class="s-list">
            {sp.length ? (
              sp.map((z) => (
                <SRow key={z.ent} icon="speaker" title={z.name} sub={z.ent || "No entity"} mono right={<SVal>{roomName(z.room)}</SVal>} onClick={() => openEdit("speaker", z.ent)} />
              ))
            ) : (
              <SEmpty icon="speaker" msg="No speakers yet." />
            )}
          </div>
        </SCard>
      </div>
    </>
  );
}

function TvSec(): JSX.Element {
  const tvs = tvItems();
  return (
    <>
      <SHead t="TV" sub="The TVs and streamers the Watch screen controls." action={<SBtn label="Add TV" icon="plus" primary onClick={() => newItem("tv")} />} />
      <div class="s-body">
        <SCard label={"TVs · " + tvs.length} style="flex:1">
          <div class="s-list">
            {tvs.length ? (
              tvs.map((t) => (
                <SRow
                  key={t.ent}
                  icon="tv"
                  title={t.name}
                  sub={t.remote ? t.ent + " · remote paired" : t.ent + " · no remote"}
                  mono
                  right={<SVal>{roomName(t.room)}</SVal>}
                  onClick={() => openEdit("tv", t.ent)}
                />
              ))
            ) : (
              <SEmpty icon="tv" msg="No TVs yet. Use Add TV — pick its media player and, for a Google TV / Android TV, its remote." />
            )}
          </div>
        </SCard>
      </div>
    </>
  );
}

function ScenesSec(): JSX.Element {
  const items = sceneItems();
  const n = items.filter((s) => s.show).length;
  return (
    <>
      <SHead t="Scenes" sub={n + " of " + MAX_SCENES + " shown on the panel."} action={<SBtn label="Add scene" icon="plus" primary onClick={() => newItem("scene")} />} />
      <div class="s-body">
        <SCard style="flex:1">
          <div class="s-list">
            {items.map((s) => (
              <SRow
                key={s.id}
                icon={s.icon}
                title={s.name}
                sub={s.id || "Panel only"}
                mono
                onClick={() => openEdit("scene", s.id)}
                ctrl={<SSwitch on={s.show} label={"Show " + s.name} onClick={() => toggleScene(s.id)} />}
              />
            ))}
          </div>
        </SCard>
      </div>
    </>
  );
}

function CalendarSec(): JSX.Element {
  const cals = calendarChoices();
  const nShown = cals.filter((c) => calShown(c.id)).length;
  return (
    <>
      <SHead t="Calendar" sub="Choose which Home Assistant calendars appear on the panel." />
      <div class="s-body">
        <SCard label={cals.length ? "Calendars · " + nShown + " of " + cals.length + " shown" : "Calendars"} style="flex:1">
          <div class="s-list">
            {cals.length ? (
              cals.map((c) => (
                <SRow
                  key={c.id}
                  icon="calendar"
                  title={c.name}
                  sub={c.id}
                  mono
                  ctrl={<SSwitch on={calShown(c.id)} label={"Show " + c.name} onClick={() => toggleCal(c.id)} />}
                />
              ))
            ) : (
              <SEmpty icon="calendar" msg="No calendars found in Home Assistant. Add a calendar integration, then Re-sync." />
            )}
          </div>
        </SCard>
      </div>
    </>
  );
}

function DisplaySec(): JSX.Element {
  const d = getDisplay();
  return (
    <>
      <SHead t="Display" sub="How the panel looks and when it sleeps." action={<SBtn label="Reset all settings" icon="reset" onClick={resetAll} />} />
      <div class="s-body s-two" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr)">
        <SCard label="Appearance">
          <SSet title="Theme" sub="Auto follows the device." ctl={<SSeg opts={[["auto", "Auto"], ["light", "Light"], ["dark", "Dark"]]} cur={d.theme} onPick={setTheme} />} />
          <SSet title="Clock" ctl={<SSeg opts={[["24", "24-hour"], ["12", "12-hour"]]} cur={d.h12 ? "12" : "24"} onPick={setClock} />} />
        </SCard>
        <div class="s-colstack">
          <SCard label="Screen">
            <SSet title="Brightness" sub={d.bright + "%"} ctl={<Slider min={40} max={100} value={d.bright} fill="var(--ink)" label="Brightness" onInput={setBright} />} />
            <SSet title="Sleep after" sub="Shows the clock when nobody touches the panel." ctl={<SSeg opts={[[60, "1 min"], [120, "2 min"], [300, "5 min"], [600, "10 min"], [0, "Never"]]} cur={d.sleep} onPick={(v) => setSleep(Number(v))} />} />
          </SCard>
          <SCard label="Access">
            <SSet
              title="Settings PIN"
              sub="Unlocks settings on non-admin devices (the wall tablet)."
              ctl={
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  defaultValue={getPin()}
                  aria-label="Settings PIN"
                  onChange={(e) => setPin((e.currentTarget as HTMLInputElement).value)}
                  style="width:110px;text-align:center;letter-spacing:.3em;min-height:52px;background:var(--card-2);color:var(--ink);border:0;border-radius:calc(var(--R) - 6px);font:600 22px var(--f-body)"
                />
              }
            />
          </SCard>
          <SCard label="About">
            <SRow icon="home" title="Wall panel" sub="Hearth · Home Assistant connected" />
          </SCard>
        </div>
      </div>
    </>
  );
}

const SECTIONS: Record<string, () => JSX.Element> = {
  overview: Overview,
  rooms: RoomsSec,
  lights: LightsSec,
  media: MediaSec,
  tv: TvSec,
  scenes: ScenesSec,
  calendar: CalendarSec,
  display: DisplaySec,
};

// ---- rail ----
function Rail(): JSX.Element {
  const S = settingsUI();
  const un = unusedList().length;
  const cnt: Record<string, string | number> = {
    overview: un ? un + " new" : "",
    rooms: rooms().length,
    lights: lightItems().length,
    media: speakerItems().length,
    tv: tvItems().length,
    scenes: sceneItems().filter((s) => s.show).length,
    calendar: "",
    display: "",
  };
  return (
    <aside class="rail card" aria-label="Settings sections">
      <button class="rail-item s-back" onClick={closeSettings}><span class="row"><Icon n="back" />Back</span></button>
      <div class="rail-gap" />
      {SECS.map((s) => (
        <button key={s[0]} class={"rail-item" + (S.sec === s[0] ? " cur" : "")} onClick={() => setSec(s[0])}>
          <span class="row"><Icon n={s[2]} />{s[1]}</span>
          <small>{cnt[s[0]]}</small>
        </button>
      ))}
    </aside>
  );
}

// ---- field helpers for the edit sheet ----
const FLab = ({ t }: { t: string }): JSX.Element => <div class="s-flab">{t}</div>;
function FText({ f, label, val, ph }: { f: string; label: string; val: string; ph?: string }): JSX.Element {
  return (
    <div class="s-field">
      <FLab t={label} />
      <input class="s-in" type="text" defaultValue={val} placeholder={ph} autocomplete="off" maxLength={28} onInput={(e) => setField(f, (e.currentTarget as HTMLInputElement).value)} />
    </div>
  );
}
function FChips({ f, label, opts, cur }: { f: string; label: string; opts: Array<[string, string, boolean?]>; cur: string }): JSX.Element {
  return (
    <div class="s-field">
      <FLab t={label} />
      <div class="s-chipset">
        {opts.map((o) => (
          <button key={o[0]} class={"s-chip" + (o[0] === cur ? " cur" : "")} disabled={o[2]} onClick={() => setField(f, o[0])}>{o[1]}</button>
        ))}
      </div>
    </div>
  );
}
function FIcons({ f, label, icons, cur }: { f: string; label: string; icons: string[]; cur: string }): JSX.Element {
  return (
    <div class="s-field">
      <FLab t={label} />
      <div class="s-icons">
        {icons.map((n) => (
          <button key={n} class={"s-ib" + (n === cur ? " cur" : "")} aria-label={n.replace("l-", "")} aria-pressed={n === cur} onClick={() => setField(f, n)}><Icon n={n} /></button>
        ))}
      </div>
    </div>
  );
}
function FToggle({ f, label, sub, on }: { f: string; label: string; sub?: string; on: boolean }): JSX.Element {
  return (
    <div class="s-field">
      <SRow title={label} sub={sub} ctrl={<SSwitch on={on} label={label} onClick={() => toggleField(f)} />} />
    </div>
  );
}
function FEntity({ f, label, val, dom, cls, title, clearable }: { f: string; label: string; val: string; dom: string; cls: string; title: string; clearable?: boolean }): JSX.Element {
  return (
    <div class="s-field">
      <FLab t={label} />
      <div class="s-entrow">
        <button class="s-ent" onClick={() => pickForField(f, dom, cls, title)}>
          <span class="s-txt"><b>{val ? entName(val) : "Choose an entity"}</b><span class="mono">{val || "Not set"}</span></span>
          <Icon n="chev" />
        </button>
        {clearable && val && <button class="round" aria-label="Clear" onClick={() => clearField(f)}><Icon n="x" /></button>}
      </div>
    </div>
  );
}

function Sheet({ title, cls, onClose, body, foot }: { title: string; cls?: string; onClose: () => void; body: ComponentChildren; foot: ComponentChildren }): JSX.Element {
  return (
    <>
      <div class={"s-scrim" + (cls ? " " + cls : "")} onClick={onClose} />
      <div class={"s-sheet card" + (cls ? " " + cls : "")} role="dialog" aria-label={title}>
        <header class="s-sh-head"><h3>{title}</h3><button class="round" aria-label="Close" onClick={onClose}><Icon n="x" /></button></header>
        <div class="s-sh-body">{body}</div>
        <footer class="s-sh-foot">{foot}</footer>
      </div>
    </>
  );
}

function EditSheet(): JSX.Element {
  const e = settingsUI().edit!;
  const dr = e.draft;
  const k = e.kind;
  const label = k === "tv" ? "TV" : k;
  let removable = !e.isNew;
  let note = "";
  let body: ComponentChildren = null;
  const roomChips = rooms().map((r) => [r.id, r.name] as [string, string]);

  if (k === "light") {
    body = (
      <>
        <FText f="name" label="Name" val={String(dr.name ?? "")} ph="For example Reading lamp" />
        <FChips f="room" label="Room" opts={roomChips} cur={String(dr.room ?? "")} />
        <FIcons f="icon" label="Icon" icons={LIGHT_ICONS} cur={String(dr.icon ?? "l-bulb")} />
        <FEntity f="ent" label="Home Assistant entity" val={String(dr.ent ?? "")} dom="light" cls="" title="Choose a light" />
      </>
    );
  } else if (k === "speaker") {
    body = (
      <>
        <FText f="name" label="Name" val={String(dr.name ?? "")} ph="For example Kitchen" />
        <FChips f="room" label="Room" opts={roomChips} cur={String(dr.room ?? "")} />
        <FEntity f="ent" label="Home Assistant entity" val={String(dr.ent ?? "")} dom="media_player" cls="speaker" title="Choose a speaker" />
      </>
    );
  } else if (k === "tv") {
    body = (
      <>
        <FText f="name" label="Name" val={String(dr.name ?? "")} ph="For example Lounge TV" />
        <FChips f="room" label="Room" opts={roomChips} cur={String(dr.room ?? "")} />
        <FEntity f="ent" label="Media player" val={String(dr.ent ?? "")} dom="media_player" cls="tv" title="Choose the TV’s media player" />
        <FEntity f="remote" label="Remote (Google TV / Android TV)" val={String(dr.remote ?? "")} dom="remote" cls="" title="Choose the paired remote" clearable />
        <p class="s-note" style="padding:0 2px">The media player handles power and volume. The remote adds the d-pad, Back/Home/Menu and app shortcuts — leave it empty if the TV has none.</p>
      </>
    );
  } else if (k === "scene") {
    body = (
      <>
        <FText f="name" label="Name" val={String(dr.name ?? "")} ph="For example Movie time" />
        <FIcons f="icon" label="Icon" icons={SCENE_ICONS} cur={String(dr.icon ?? "sparkles")} />
        <FEntity f="ent" label="Home Assistant scene or script" val={String(dr.ent ?? "")} dom="scene,script" cls="" title="Choose a scene or script" />
        <FToggle f="show" label="Show on the panel" sub={"Up to " + MAX_SCENES + " scenes appear on Home and Scenes."} on={dr.show !== false} />
      </>
    );
  } else {
    body = (
      <>
        <FText f="name" label="Name" val={String(dr.name ?? "")} ph="For example Garden room" />
        <div class="s-flab s-sub">Sensors</div>
        <FEntity f="temp" label="Temperature" val={String(dr.temp ?? "")} dom="sensor" cls="temperature" title="Choose a temperature sensor" clearable />
        <FEntity f="hum" label="Humidity" val={String(dr.hum ?? "")} dom="sensor" cls="humidity" title="Choose a humidity sensor" clearable />
        <FEntity f="motion" label="Motion" val={String(dr.motion ?? "")} dom="binary_sensor" cls="motion" title="Choose a motion sensor" clearable />
      </>
    );
    if (removable && !roomRemovable(e.id!)) { removable = false; note = "Move or remove its lights, speaker and TV to delete this room."; }
  }

  const foot = (
    <>
      {removable && <button class="btn" onClick={removeEdit}><Icon n="trash" />Remove</button>}
      {note && <span class="s-note">{note}</span>}
      <span class="grow" />
      <button class="btn" onClick={closeEdit}>Cancel</button>
      <button class="btn primary" onClick={saveEdit}>{e.isNew ? "Add " + label : "Save"}</button>
    </>
  );
  return <Sheet title={(e.isNew ? "Add " : "Edit ") + label} onClose={closeEdit} body={body} foot={foot} />;
}

function PickSheet(): JSX.Element {
  const p = settingsUI().pick!;
  const used = usedMap();
  const doms = p.dom.split(",");
  const list = getCatalog().filter((e) => !e.noise && doms.indexOf(e.dom) >= 0 && (!p.cls || e.cls === p.cls));
  const avail = list.filter((e) => !used[e.id] || e.id === p.current);
  const q = p.q.trim().toLowerCase();
  const shown = (p.all ? list : avail).filter((e) => !q || (e.name + " " + e.id).toLowerCase().indexOf(q) >= 0);
  const n = p.sel.length;
  const cta = p.multi ? (n ? p.cta + " " + n : p.cta) : p.cta;
  const body = (
    <>
      <div class="s-search">
        <Icon n="search" />
        <input class="s-in" type="text" defaultValue={p.q} placeholder="Search by name or entity id" autocomplete="off" onInput={(e) => setPickQuery((e.currentTarget as HTMLInputElement).value)} />
      </div>
      <div style="margin:12px 0">
        <SSeg opts={[["avail", "Available (" + avail.length + ")"], ["all", "All (" + list.length + ")"]]} cur={p.all ? "all" : "avail"} onPick={(v) => setPickAll(v === "all")} />
      </div>
      <div class="s-plist">
        {shown.length ? (
          shown.map((e) => {
            const on = p.sel.indexOf(e.id) >= 0;
            const u = !!used[e.id] && e.id !== p.current;
            return (
              <div key={e.id} class={"s-row s-pr" + (u ? " dim" : "")}>
                <button class="s-main" disabled={u} aria-pressed={on} onClick={() => togglePickRow(e.id)}>
                  <span class={"s-chk" + (on ? " on" : "")}>{on && <Icon n="check" />}</span>
                  <span class="s-txt"><b>{e.name}</b><span class="mono">{e.id}</span></span>
                  <span class="s-val">{u ? "In " + used[e.id] : e.state}</span>
                </button>
              </div>
            );
          })
        ) : (
          <SEmpty icon="inbox" msg={avail.length ? "Nothing matches that search." : "Everything of this type is already in use."} />
        )}
      </div>
    </>
  );
  const foot = (
    <>
      <span class="grow s-note">{p.multi && n ? n + (n === 1 ? " entity" : " entities") + " selected" : ""}</span>
      <button class="btn" onClick={closePick}>Cancel</button>
      <button class="btn primary" disabled={!n} onClick={pickDone}>{cta}</button>
    </>
  );
  return <Sheet title={p.title} cls="pick" onClose={closePick} body={body} foot={foot} />;
}

export function Settings(): JSX.Element {
  useStore(); // re-render on any store/settings bump
  const S = settingsUI();
  return (
    <div class={"settings" + (S.open ? " open" : "")} aria-label="Settings">
      {S.open && (
        <>
          <Rail />
          <div class="s-main-col">{SECTIONS[S.sec]!()}</div>
          {S.edit && <EditSheet key={S.edit.kind + ":" + (S.edit.id ?? "new")} />}
          {S.pick && <PickSheet key={(S.pick.field ?? S.pick.kind) + ":" + S.pick.title} />}
        </>
      )}
    </div>
  );
}
