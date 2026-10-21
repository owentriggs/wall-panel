import type { JSX } from "preact";
import { useEffect } from "preact/hooks";
import { Icon } from "../Icon";
import { Raw, Slider } from "../widgets";
import { mmss, esc, artSvg } from "../format";
import { ROOMS, type MediaTab } from "../../state/model";
import type { BrowseItem } from "../../ha/music";
import {
  useStore,
  targetZone,
  setTarget,
  play,
  skip,
  getBrowse,
  loadBrowse,
  getSearch,
  runSearch,
  playBrowseItem,
  playSearchItem,
  setZoneVol,
  setSeek,
  setMediaTab,
  toggleShuffle,
  toggleRepeat,
} from "../../state/store";

const ell = "white-space:nowrap;overflow:hidden;text-overflow:ellipsis";

function art(item: BrowseItem, i: number): JSX.Element {
  // Lazy-load real artwork over a fixed-size placeholder to avoid layout shift.
  if (item.image) return <img class="art" src={item.image} alt="" loading="lazy" width={230} height={230} />;
  return <Raw html={artSvg(i)} />;
}

function TrkRow({ item, i, cur, onClick }: { item: BrowseItem; i: number; cur: boolean; onClick: () => void }): JSX.Element {
  return (
    <button class={"trk" + (cur ? " cur" : "")} onClick={onClick}>
      {art(item, i)}
      <span class="grow" style="min-width:0"><b>{item.name}</b><span>{item.sub || "Track"}</span></span>
    </button>
  );
}

/** Library list for the active tab (radio grid, or a track/playlist list). */
function BrowseList({ tab, selUri }: { tab: MediaTab; selUri: string }): JSX.Element {
  const b = getBrowse(tab);
  // Kick off the library load the first time a tab is shown.
  useEffect(() => {
    loadBrowse(tab);
  }, [tab]);

  if (b.status === "loading" || b.status === "idle") {
    return <div class="bigmsg" style="min-height:120px"><Icon n="disc" /><p>Loading…</p></div>;
  }
  if (b.status === "error") {
    return <div class="bigmsg" style="min-height:120px"><Icon n="radio" /><p>Couldn’t reach the music library.</p></div>;
  }
  if (b.items.length === 0) {
    return <div class="bigmsg" style="min-height:120px"><Icon n="listmusic" /><p>Nothing here yet.</p></div>;
  }
  if (tab === "radio") {
    return (
      <div class="stns">
        {b.items.map((s) => (
          <button key={s.uri} class={"stn" + (selUri === s.uri ? " cur" : "")} onClick={() => playBrowseItem(tab, s)} aria-label={esc(s.name)}>
            <small>Radio</small>
            <b>{s.name}</b>
            <span>{s.sub || "Radio"}</span>
          </button>
        ))}
      </div>
    );
  }
  return (
    <div class="lst">
      {b.items.map((it, i) => (
        <TrkRow key={it.uri} item={it} i={i} cur={selUri === it.uri} onClick={() => playBrowseItem(tab, it)} />
      ))}
    </div>
  );
}

/** Unified "search everything" results, grouped by type. */
function SearchResults({ selUri }: { selUri: string }): JSX.Element {
  const s = getSearch();
  if (s.status === "loading") return <div class="bigmsg" style="min-height:120px"><Icon n="disc" /><p>Searching…</p></div>;
  if (s.status === "error") return <div class="bigmsg" style="min-height:120px"><Icon n="radio" /><p>Search is unavailable right now.</p></div>;
  if (s.groups.length === 0) return <div class="bigmsg" style="min-height:120px"><Icon n="search" /><p>No matches for “{s.q}”.</p></div>;
  return (
    <div class="lst">
      {s.groups.map((g) => (
        <div key={g.type}>
          <div class="lab" style="margin:10px 6px 4px">{g.label}</div>
          {g.items.map((it, i) => (
            <TrkRow key={it.uri} item={it} i={i} cur={selUri === it.uri} onClick={() => playSearchItem(it)} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function Media(): JSX.Element {
  const S = useStore();
  const m = S.media;
  const z = targetZone();
  const tName = z ? z.name : "";
  const playing = !!z && z.on;
  const title = z && z.title ? z.title : "Nothing playing";
  const sub = z ? z.artist : "";
  const artHtml = z && z.art ? `<img class="art" src="${esc(z.art)}" alt="Album art">` : artSvg(0);
  const live = playing && z!.dur === 0;
  const dur = z ? z.dur : 0;
  const pos = z ? z.pos : 0;
  const searching = getSearch().q.trim().length > 0;
  const tab = m.mtab;

  return (
    <div class="split" style="grid-template-columns:480px minmax(0,1fr)">
      <section class="np card">
        <div class="lab" style="text-align:center">{z ? (playing ? "Playing on " : "Ready · ") + tName : "No speaker"}</div>
        <Raw html={artHtml} />
        <div class="tt" style={ell}>{title}</div>
        <div class="ar" style={ell}>{sub}</div>
        {live || !dur ? (
          <div class="livebox">{playing ? <><span class="livepill"><i />Live</span><span>Streaming now</span></> : <span>Nothing playing</span>}</div>
        ) : (
          <div>
            <Slider min={0} max={dur} value={Math.floor(pos)} fill="var(--ink)" label="Track position" onInput={setSeek} />
            <div class="times"><span>{mmss(pos)}</span><span>{mmss(dur)}</span></div>
          </div>
        )}
        <div class="ctrl">
          <button class={"round" + (m.shuffle ? " on" : "")} onClick={toggleShuffle} aria-label="Shuffle"><Icon n="shuffle" /></button>
          <button class="round" onClick={() => skip(-1)} aria-label="Previous track"><Icon n="skipb" /></button>
          <button class="play" onClick={() => play()} aria-label={playing ? "Pause" : "Play"} disabled={!z || !z.available}><Icon n={playing ? "pause" : "play"} fill /></button>
          <button class="round" onClick={() => skip(1)} aria-label="Next track"><Icon n="skipf" /></button>
          <button class={"round" + (m.repeat ? " on" : "")} onClick={toggleRepeat} aria-label="Repeat"><Icon n="repeat" /></button>
        </div>
      </section>

      <div class="col">
        <section class="card" style="padding:20px">
          <div class="row" style="margin-bottom:12px">
            <span class="lab grow">Speakers</span>
            <span class="muted" style="font-size:17px">Tap to play here</span>
          </div>
          {m.zones.length === 0 ? (
            <div class="bigmsg" style="min-height:120px"><Icon n="speaker" /><p>No speakers set up yet.</p></div>
          ) : (
            <div class="spks">
              {m.zones.map((zn) => {
                const target = zn.id === m.target;
                const room = ROOMS.find((r) => r.id === zn.id)?.name ?? zn.name;
                return (
                  <div key={zn.ent} class={"spk" + (zn.on ? " on" : "") + (target ? " sel" : "")}>
                    <button class="spk-b" onClick={() => setTarget(zn.id)} aria-pressed={target} aria-label={"Play on " + zn.name} disabled={!zn.available}>
                      <Icon n="speaker" />
                      <span class="spk-tx">
                        <b style={ell}>{room}</b>
                        <span>{!zn.available ? "Offline" : zn.on ? "Playing · " + zn.vol + "%" : "Ready · " + zn.vol + "%"}</span>
                      </span>
                    </button>
                    <Slider min={0} max={100} value={zn.vol} fill={zn.on ? "var(--accent)" : "var(--ink-3)"} label={zn.name + " volume"} onInput={(v) => setZoneVol(zn.id, v)} />
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section class="card" style="padding:20px;flex:1;min-height:0;display:flex;flex-direction:column;gap:12px">
          <div class="row" style="margin:0;gap:12px">
            <div class="seg grow" style="margin:0" role="tablist" aria-label="Browse">
              {([["radio", "Radio"], ["lists", "Playlists"], ["tracks", "Tracks"]] as const).map((t) => (
                <button key={t[0]} role="tab" aria-selected={tab === t[0]} class={tab === t[0] && !searching ? "cur" : ""} onClick={() => { runSearch(""); setMediaTab(t[0]); }}>{t[1]}</button>
              ))}
            </div>
            <input
              type="search"
              placeholder="Search everything"
              aria-label="Search music"
              value={getSearch().q}
              onInput={(e) => runSearch((e.currentTarget as HTMLInputElement).value)}
              style="flex:0 0 240px;min-height:52px;background:var(--card-2);color:var(--ink);border:0;border-radius:calc(var(--R) - 6px);padding:0 18px;font:400 18px var(--f-body);outline-offset:3px"
            />
          </div>
          {searching ? <SearchResults selUri={m.selUri} /> : <BrowseList tab={tab} selUri={m.selUri} />}
        </section>
      </div>
    </div>
  );
}
