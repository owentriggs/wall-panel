import type { JSX } from "preact";
import { Icon } from "../Icon";
import { Raw } from "../widgets";
import { hhmm, plural, nowInfo } from "../format";
import { ROOMS } from "../../state/model";
import {
  useStore,
  lights,
  roomLights,
  playingRooms,
  setTab,
  alloffEverywhere,
  runScene,
  skip,
  play,
} from "../../state/store";

function MediaCtl({ playing }: { playing: boolean }): JSX.Element {
  return (
    <div class="ctl act">
      <button class="round" onClick={() => skip(-1)} aria-label="Previous"><Icon n="skipb" /></button>
      <button class="round solid" onClick={() => play()} aria-label={playing ? "Pause" : "Play"}><Icon n={playing ? "pause" : "play"} fill /></button>
      <button class="round" onClick={() => skip(1)} aria-label="Next"><Icon n="skipf" /></button>
    </div>
  );
}

export function Home(): JSX.Element {
  const S = useStore();
  const now = Date.now();
  const d = new Date();
  const h = d.getHours();
  const on = lights().filter((l) => l.on).length;
  const pr = playingRooms();
  const info = nowInfo();
  const greet = h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const ell = "white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
  const scenes = S.scenes.slice(0, 6);
  const wtemp = S.weather.temp;

  return (
    <div class="home">
      <section class="hero card" aria-label="Overview">
        <div class="time">{hhmm(now)}</div>
        <div class="date">{d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</div>
        <span class="chip"><Icon n="cloud" />{wtemp != null ? `${Math.round(wtemp)}° · ${S.weather.condition}` : S.weather.condition}</span>
        <div class="status">
          <h2>{greet}</h2>
          <div class="srow"><Icon n="bulb" />{on ? plural(on, "light") + " on" : "All lights are off"}</div>
          <div class="srow"><Icon n="music" />{pr.length ? "Playing in " + pr.map((z) => z.name).join(" and ") : "Nothing playing"}</div>
          {on > 0 && <button class="btn" onClick={alloffEverywhere}><Icon n="power" />All lights off</button>}
        </div>
      </section>

      <div class="hgrid">
        <section class={"tile card" + (on ? " on" : "")}>
          <button class="tile-hit" onClick={() => setTab("lights")} aria-label="Open lights" />
          <span class="tic"><Icon n="bulb" /></span>
          <div class="push">
            <div class="tt">Lights</div>
            <div class="ts">{on} of {lights().length} on</div>
            <div class="pills">
              {ROOMS.map((r) => (
                <span key={r.id} class={"pill" + (roomLights(r.id).some((l) => l.on) ? " on" : "")}>{r.short}</span>
              ))}
            </div>
          </div>
        </section>

        <section class={"tile card" + (pr.length ? " on" : "")}>
          <button class="tile-hit" onClick={() => setTab("media")} aria-label="Open media" />
          <div class="row">
            <Raw html={info.art} />
            <div class="grow">
              <div class="tt" style={ell}>{info.title}</div>
              <div class="ts" style={ell}>{info.sub}</div>
            </div>
          </div>
          <div class="push">
            <div class="ts" style="margin:0 0 12px">{pr.length ? "Playing in " + plural(pr.length, "room") : "Paused"}</div>
            <div class={"prog" + (info.live ? " live" : "")}><i style={`width:${info.live ? 100 : info.dur ? (info.pos / info.dur) * 100 : 0}%`} /></div>
            <div style="margin-top:16px"><MediaCtl playing={info.playing} /></div>
          </div>
        </section>

        <section class="tile card" style="grid-column:1/3" aria-label="Scenes">
          <div class="row"><span class="lab grow">Scenes</span></div>
          <div class="scrow">
            {scenes.map((s) => (
              <button key={s.id} class={"sc act" + (S.lastScene === s.id ? " cur" : "")} onClick={() => runScene(s.id)}>
                <Icon n={s.icon} />
                <span>{s.name}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
