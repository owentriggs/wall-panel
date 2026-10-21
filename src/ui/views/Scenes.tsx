import type { JSX } from "preact";
import { Icon } from "../Icon";
import { useStore, runScene } from "../../state/store";

export function Scenes(): JSX.Element {
  const S = useStore();
  if (!S.scenes.length) {
    return (
      <section class="card pad" style="height:100%;display:flex">
        <div class="bigmsg"><Icon n="sparkles" /><p>No scenes set up yet.</p></div>
      </section>
    );
  }
  return (
    <div class="cards scroll scenes" style="height:100%;grid-template-columns:repeat(4,minmax(0,1fr));grid-auto-rows:182px">
      {S.scenes.map((s) => (
        <button key={s.id} class={"scn card" + (S.lastScene === s.id ? " cur" : "")} onClick={() => runScene(s.id)}>
          <span class="tic"><Icon n={s.icon} /></span>
          <span>
            <b>{s.name}</b>
            <p>{s.kind === "script" ? "Runs a script in Home Assistant." : "Sets the scene in Home Assistant."}</p>
          </span>
        </button>
      ))}
    </div>
  );
}
