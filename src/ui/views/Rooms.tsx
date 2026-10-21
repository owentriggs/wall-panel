import type { JSX } from "preact";
import { Icon } from "../Icon";
import { Raw, Slider } from "../widgets";
import { lightColor, tspark, mchart, agoText, esc, artSvg } from "../format";
import { ROOMS, type Tv } from "../../state/model";
import {
  useStore,
  roomLights,
  toggleDevice,
  toggleZone,
  setZoneVol,
  play,
  skip,
  roomEverythingOff,
  openLight,
} from "../../state/store";

function LightTile({ l }: { l: import("../../state/model").Light }): JSX.Element {
  const state = !l.available ? "Offline" : l.on ? (l.dimmable ? l.level + "%" : "On") : "Off";
  return (
    <div class={"ltile" + (l.on ? " on" : "")} style={`--lc:${lightColor(l)}`}>
      <button class="ltile-hit" onClick={() => openLight(l.id)} aria-label={l.name + " options"} />
      <button class={"round sm" + (l.on ? " on" : "")} onClick={() => toggleDevice(l.id)} aria-pressed={l.on} aria-label={l.name} disabled={!l.available}>
        <Icon n={l.icon} />
      </button>
      <div class="ltile-t">
        <b>{l.name}</b>
        <span>{state}</span>
      </div>
      {l.dimmable && <div class="minibar"><i style={`width:${l.on ? l.level : 0}%`} /></div>}
    </div>
  );
}

function EmptyCard({ label, msg }: { label: string; msg: string }): JSX.Element {
  return (
    <section class="card pad" style="display:flex;flex-direction:column;min-height:0">
      <span class="lab">{label}</span>
      <div class="bigmsg"><Icon n="alert" /><p>{msg}</p></div>
    </section>
  );
}

export function Rooms(): JSX.Element {
  const S = useStore();
  const r = ROOMS.find((x) => x.id === S.rroom) ?? ROOMS[0]!;
  const sn = S.sensors[r.id]!;
  const ls = roomLights(r.id);
  const on = ls.filter((l) => l.on).length;
  const z = S.media.zones.find((x) => x.id === r.id);
  const tv = S.devices.find((d): d is Tv => d.type === "tv" && d.room === r.id) ?? null;
  const occ = sn.motion === true;
  const temp = sn.temp;
  const comfort = temp == null ? "" : temp < 18 ? "Cool" : temp > 22 ? "Warm" : "Comfortable";
  const lo = sn.tser.length ? Math.min.apply(null, sn.tser) : 0;
  const hi = sn.tser.length ? Math.max.apply(null, sn.tser) : 0;
  const anyOn = on > 0 || (tv ? tv.on : false);
  const ell = "white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
  const zTitle = z?.title || "Nothing playing";
  const zSub = z?.artist || "";
  const artSmall = (z && z.art ? `<img class="art" style="width:84px;height:84px;border-radius:16px" src="${esc(z.art)}" alt="">` : artSvg(0).replace('class="art"', 'class="art" style="width:84px;height:84px;border-radius:16px"'));

  return (
    <div class="roomview">
      <section class="card pad" style="display:flex;flex-direction:column">
        <span class="lab">Room</span>
        <h2 class="rname">{r.name}</h2>
        {sn.hasMotion && <span class="chip" style="margin-top:16px"><i class={"occ" + (occ ? "" : " off")} />{occ ? "Occupied" : "Quiet"}</span>}
        <div class="status" style="margin-top:auto;display:grid;gap:14px">
          {sn.hasTemp && temp != null && <div class="srow"><Icon n="temp" />{temp.toFixed(1)}° and {sn.hum ?? "–"}% humidity</div>}
          <div class="srow"><Icon n="bulb" />{on ? on + " of " + ls.length + " lights on" : "Lights off"}</div>
          <div class="srow"><Icon n="music" />{z ? (z.on ? "Playing " + zTitle : "Speaker ready") : "No speaker here"}</div>
          {anyOn && <button class="btn" style="margin-top:6px;width:100%" onClick={() => roomEverythingOff(r.id)}><Icon n="power" />Turn everything off</button>}
        </div>
      </section>

      <div class="col">
        <section class="card pad" style="flex:1;min-height:0;display:flex;flex-direction:column">
          <div class="lab" style="margin-bottom:10px;flex:none">Lights{tv ? " and TV" : ""}</div>
          {ls.length === 0 && !tv ? (
            <div class="bigmsg" style="height:80%"><Icon n="bulb" /><p>No lights in this room</p></div>
          ) : (
            <div class="lgrid">
              {ls.map((l) => <LightTile key={l.id} l={l} />)}
              {tv && (
                <div class={"ltile" + (tv.on ? " on" : "")}>
                  <button class={"round sm" + (tv.on ? " on" : "")} onClick={() => toggleDevice("tv")} aria-pressed={tv.on} aria-label="TV"><Icon n="tv" /></button>
                  <div class="ltile-t"><b>TV</b><span>{tv.on ? "On" : "Off"}</span></div>
                </div>
              )}
            </div>
          )}
        </section>

        <section class="card pad" style="flex:none;height:248px;display:flex;flex-direction:column">
          {z ? (
            <>
              <div class="row">
                <Raw html={artSmall} />
                <div class="grow">
                  <div class="h3" style={"font-size:26px;" + ell}>{zTitle}</div>
                  <div class="muted" style={"font-size:20px;" + ell}>{zSub}</div>
                </div>
                <button class={"round" + (z.on ? " solid" : "")} onClick={() => toggleZone(z.id)} aria-pressed={z.on} aria-label={"Speaker in " + r.name} disabled={!z.available}><Icon n="speaker" /></button>
              </div>
              <div class={"prog" + (z.dur ? "" : " live")} style="margin-top:16px"><i style={`width:${z.dur ? (z.pos / z.dur) * 100 : 0}%`} /></div>
              <div class="row push">
                <button class="round" onClick={() => skip(-1, z.id)} aria-label="Previous track" style="width:56px;height:56px"><Icon n="skipb" /></button>
                <button class="round solid" onClick={() => play(z.id)} aria-label={z.on ? "Pause" : "Play"} style="width:56px;height:56px"><Icon n={z.on ? "pause" : "play"} fill /></button>
                <button class="round" onClick={() => skip(1, z.id)} aria-label="Next track" style="width:56px;height:56px"><Icon n="skipf" /></button>
                <div class="grow" style="padding-left:10px"><Slider min={0} max={100} value={z.vol} fill={z.on ? "var(--accent)" : "var(--ink-3)"} label={"Volume in " + r.name} onInput={(v) => setZoneVol(z.id, v)} /></div>
              </div>
            </>
          ) : (
            <>
              <span class="lab">Media</span>
              <div class="bigmsg"><Icon n="speaker" /><p>No speaker in this room</p></div>
            </>
          )}
        </section>
      </div>

      <div class="col" style="display:grid;grid-template-rows:repeat(2,minmax(0,1fr));gap:12px">
        {sn.hasTemp && temp != null ? (
          <section class="card pad" style="display:flex;flex-direction:column;min-height:0">
            <div class="row"><span class="lab grow">Temperature</span><span class="mono muted" style="font-size:17px">Last 24 h</span></div>
            <div class="bignum">{temp.toFixed(1)}<small>°C</small></div>
            <p class="muted" style="font-size:21px">{comfort}{sn.hum != null ? " · " + sn.hum + "% humidity" : ""}</p>
            <div class="push" style="height:76px"><Raw html={tspark(sn.tser, 300, 76)} /></div>
            <div class="row mono muted" style="justify-content:space-between;font-size:17px;margin-top:6px"><span>Low {lo.toFixed(1)}°</span><span>High {hi.toFixed(1)}°</span></div>
          </section>
        ) : (
          <EmptyCard label="Temperature" msg="No temperature sensor set" />
        )}
        {sn.hasMotion ? (
          <section class="card pad" style="display:flex;flex-direction:column;min-height:0">
            <div class="row"><span class="lab grow">Motion</span><span class="mono muted" style="font-size:17px">Last 12 h</span></div>
            <div class="bignum" style="font-size:54px;margin-top:10px">{occ ? "Occupied" : "Quiet"}</div>
            <p class="muted" style="font-size:21px">{sn.last ? "Last motion " + agoText(sn.last) : "No motion recorded"}</p>
            <div class="push" style="height:132px"><Raw html={mchart(sn.hist)} /></div>
          </section>
        ) : (
          <EmptyCard label="Motion" msg="No motion sensor set" />
        )}
      </div>
    </div>
  );
}
