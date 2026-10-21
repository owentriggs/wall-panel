import type { JSX } from "preact";
import { Icon } from "../Icon";
import { ROOMS } from "../../state/model";
import {
  useStore,
  watchTv,
  tvPower,
  tvVol,
  tvMute,
  tvKey,
  tvApp,
  tvPlayPause,
  tvSkip,
} from "../../state/store";

const ell = "white-space:nowrap;overflow:hidden;text-overflow:ellipsis";

/** A single Android TV remote key (sends a command through the paired remote). */
function Key({ cmd, icon, label, cls }: { cmd: string; icon?: string; label?: string; cls?: string }): JSX.Element {
  return (
    <button class={"round" + (cls ? " " + cls : "")} onClick={() => tvKey(cmd)} aria-label={label ?? cmd}>
      {icon ? <Icon n={icon} /> : <span class="wt-ok">{label}</span>}
    </button>
  );
}

export function Watch(): JSX.Element {
  useStore();
  const t = watchTv();

  if (!t) {
    return (
      <div class="watch">
        <section class="card" style="display:grid;place-items:center">
          <div class="bigmsg"><Icon n="tv" /><p>No TV in this room.</p></div>
        </section>
      </div>
    );
  }

  const roomName = ROOMS.find((r) => r.id === t.room)?.name ?? "";
  const off = !t.available;
  const hasRemote = !!t.remote;
  const status = off ? "Offline" : t.on ? t.app || "On" : "Standby";

  return (
    <div class="split watch" style="grid-template-columns:480px minmax(0,1fr)">
      {/* Status + power + volume + transport */}
      <section class="card wt-side">
        <div class="lab" style="text-align:center">{roomName} TV</div>
        <div class={"wt-screen" + (t.on && !off ? " on" : "")}>
          <Icon n="tv" />
        </div>
        <div class="wt-name" style={ell}>{t.name}</div>
        <div class="wt-status" style={ell}>{status}</div>

        <button class={"btn wt-power" + (t.on && !off ? " primary" : "")} onClick={tvPower} disabled={off} aria-pressed={t.on}>
          <Icon n="power" />{t.on ? "Turn off" : "Turn on"}
        </button>

        <div class="wt-rocker">
          <button class="round" onClick={() => tvVol(-1)} disabled={off} aria-label="Volume down"><Icon n="chevdown" /></button>
          <div class="wt-vol">
            <span class="wt-voln mono">{t.vol}</span>
            <span class="lab">Volume</span>
          </div>
          <button class="round" onClick={() => tvVol(1)} disabled={off} aria-label="Volume up"><Icon n="chevup" /></button>
          <button class={"round" + (t.muted ? " on" : "")} onClick={tvMute} disabled={off} aria-label="Mute" aria-pressed={t.muted}>
            <Icon n={t.muted ? "volx" : "vol"} />
          </button>
        </div>

        <div class="ctrl wt-transport">
          <button class="round" onClick={() => tvSkip(-1)} disabled={off || !hasRemote} aria-label="Previous"><Icon n="skipb" /></button>
          <button class="play" onClick={tvPlayPause} disabled={off || !hasRemote} aria-label={t.playing ? "Pause" : "Play"}><Icon n={t.playing ? "pause" : "play"} fill /></button>
          <button class="round" onClick={() => tvSkip(1)} disabled={off || !hasRemote} aria-label="Next"><Icon n="skipf" /></button>
        </div>
      </section>

      {/* D-pad + navigation keys + apps */}
      <div class="col">
        <section class="card wt-navcard">
          {hasRemote ? (
            <div class="wt-pad">
              <div class="wt-dpad" aria-label="Directional pad">
                <Key cmd="DPAD_UP" icon="chevup" label="Up" cls="wt-up" />
                <Key cmd="DPAD_LEFT" icon="chevleft" label="Left" cls="wt-left" />
                <Key cmd="DPAD_CENTER" label="OK" cls="wt-ctr" />
                <Key cmd="DPAD_RIGHT" icon="chevright" label="Right" cls="wt-right" />
                <Key cmd="DPAD_DOWN" icon="chevdown" label="Down" cls="wt-down" />
              </div>
              <div class="wt-keys">
                <button class="btn" onClick={() => tvKey("BACK")} aria-label="Back"><Icon n="back" />Back</button>
                <button class="btn" onClick={() => tvKey("HOME")} aria-label="Home"><Icon n="home" />Home</button>
                <button class="btn" onClick={() => tvKey("MENU")} aria-label="Menu"><Icon n="sliders" />Menu</button>
              </div>
            </div>
          ) : (
            <div class="bigmsg"><Icon n="tv" /><p>No remote paired with this TV, so the d-pad is unavailable. Power and volume still work.</p></div>
          )}
        </section>

        <section class="card wt-appscard">
          <div class="lab" style="margin-bottom:12px">Apps</div>
          {t.apps.length ? (
            <div class="wt-apps">
              {t.apps.map((a) => (
                <button key={a.name} class={"wt-app" + (a.name === t.app ? " cur" : "")} onClick={() => tvApp(a)} disabled={off || !hasRemote}>
                  <span style={ell}>{a.name}</span>
                </button>
              ))}
            </div>
          ) : (
            <div class="bigmsg" style="min-height:0"><p>No apps reported by this TV.</p></div>
          )}
        </section>
      </div>
    </div>
  );
}
