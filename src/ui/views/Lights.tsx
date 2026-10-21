import type { JSX } from "preact";
import { Icon } from "../Icon";
import { Slider } from "../widgets";
import { lightColor } from "../format";
import { ROOMS, type Light } from "../../state/model";
import {
  useStore,
  lights,
  roomLights,
  toggleDevice,
  setLevel,
  setWarm,
  selectLightRoom,
  applyPreset,
  allOffScope,
  openLight,
} from "../../state/store";

function LightCard({ d, all }: { d: Light; all: boolean }): JSX.Element {
  const room = ROOMS.find((r) => r.id === d.room)!.name;
  const wt = d.warm > 66 ? 2 : d.warm > 33 ? 1 : 0;
  return (
    <article class={"lc card" + (all ? "" : " tall") + (d.on ? " on" : "")} style={`--lc:${lightColor(d)}`}>
      <div class="head">
        <button class="tic" onClick={() => toggleDevice(d.id)} aria-label={`${d.name}${d.on ? ", on. Tap to turn off" : ", off. Tap to turn on"}`}>
          <Icon n={d.icon} />
        </button>
        <button class="lc-name" onClick={() => openLight(d.id)} aria-label={d.name + " options"}>
          <div class="nm">{d.name}</div>
          {all ? <div class="rm">{room}</div> : <div class="rm">Options</div>}
        </button>
      </div>
      <div class="pc">{!d.available ? <span class="off">Offline</span> : d.on ? (d.dimmable ? <>{d.level}<small>%</small></> : "On") : <span class="off">Off</span>}</div>
      {d.dimmable && <Slider min={1} max={100} value={d.level} fill={d.on ? lightColor(d) : "var(--ink-3)"} label={d.name + " brightness"} onInput={(v) => setLevel(d.id, v)} />}
      {!all && d.tunable && (
        <div class="seg" role="group" aria-label="White temperature">
          <button class={d.on && wt === 0 ? "cur" : ""} onClick={() => setWarm(d.id, 15)}>Cool</button>
          <button class={d.on && wt === 1 ? "cur" : ""} onClick={() => setWarm(d.id, 50)}>Neutral</button>
          <button class={d.on && wt === 2 ? "cur" : ""} onClick={() => setWarm(d.id, 90)}>Warm</button>
        </div>
      )}
      {!all && !d.tunable && d.colorable && (
        <button class="btn" style="margin-top:12px;width:100%" onClick={() => openLight(d.id)}><Icon n="sliders" />Colour</button>
      )}
    </article>
  );
}

export function Lights(): JSX.Element {
  const S = useStore();
  const all = S.room === "all";
  const list = all ? lights() : roomLights(S.room as Light["room"]);
  const rn = all ? "All lights" : ROOMS.find((r) => r.id === S.room)!.name;
  const on = list.filter((d) => d.on).length;

  return (
    <div class="split" style="grid-template-columns:268px minmax(0,1fr)">
      <aside class="rail card" aria-label="Rooms">
        <button class={"rail-item" + (all ? " cur" : "")} onClick={() => selectLightRoom("all")}>
          All lights<small>{lights().filter((d) => d.on).length} on</small>
        </button>
        {ROOMS.map((r) => {
          const o = roomLights(r.id).filter((d) => d.on).length;
          return (
            <button key={r.id} class={"rail-item" + (S.room === r.id ? " cur" : "")} onClick={() => selectLightRoom(r.id)}>
              {r.name}<small>{o ? o + " on" : "off"}</small>
            </button>
          );
        })}
      </aside>
      <div class="col">
        {all ? (
          <div class="cards scroll" style="flex:1;min-height:0;grid-auto-rows:232px">
            {list.map((d) => <LightCard key={d.id} d={d} all />)}
          </div>
        ) : list.length === 0 ? (
          <section class="card pad" style="flex:1;min-height:0;display:flex">
            <div class="bigmsg"><Icon n="bulb" /><p>No lights in this room</p></div>
          </section>
        ) : (
          <div class={"lrow" + (list.length <= 3 ? " few" : "")}>
            {list.map((d) => <LightCard key={d.id} d={d} all={false} />)}
          </div>
        )}
        <div class="bar card">
          <div class="grow" style="min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            <b style="font-size:23px">{rn}</b><span class="muted" style="font-size:20px"> · {on} of {list.length} on</span>
          </div>
          <button class="btn" onClick={() => applyPreset("bright")}>Bright</button>
          <button class="btn" onClick={() => applyPreset("relax")}>Relax</button>
          <button class="btn" onClick={() => applyPreset("night")}>Night</button>
          <button class="btn primary" onClick={allOffScope}>All off</button>
        </div>
      </div>
    </div>
  );
}
