import type { JSX } from "preact";
import { useRef } from "preact/hooks";
import { Icon } from "./Icon";
import { Slider, Switch } from "./widgets";
import { lightColor } from "./format";
import { ROOMS, type Light } from "../state/model";
import { useStore, detailId, dev, closeLight, toggleDevice, setLevel, setWarm, setColor } from "../state/store";

// A small curated palette for colour-capable lights (kept tiny on purpose).
const SWATCHES: Array<[number, number, number]> = [
  [255, 147, 41], // amber
  [255, 80, 80], // red
  [255, 105, 180], // pink
  [150, 90, 255], // violet
  [70, 130, 255], // blue
  [60, 200, 180], // teal
  [90, 210, 90], // green
  [255, 240, 230], // warm white
];

function sameRgb(a: Light["rgb"], b: [number, number, number]): boolean {
  return !!a && a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

export function LightSheet(): JSX.Element | null {
  useStore(); // re-render on live state changes while open
  const id = detailId.value;
  if (!id) return null;
  const d = dev(id);
  if (!d || d.type !== "light") return null;
  const l = d as Light;
  const room = ROOMS.find((r) => r.id === l.room)?.name ?? "";
  const wt = l.warm > 66 ? 2 : l.warm > 33 ? 1 : 0;

  return (
    <>
      <div class="d-scrim" onClick={closeLight} />
      <SheetBody>
        <div class="d-grab" />
        <div class="d-head">
          <div style="min-width:0">
            <div class="lab">{room}</div>
            <h3 class="d-title">{l.name}</h3>
          </div>
          <button class="swb" onClick={() => toggleDevice(l.id)} role="switch" aria-checked={l.on} aria-label={l.name + " power"} disabled={!l.available}>
            <Switch on={l.on} />
          </button>
          <button class="round" onClick={closeLight} aria-label="Close"><Icon n="x" /></button>
        </div>

        {!l.available ? (
          <div class="bigmsg" style="min-height:120px"><Icon n="alert" /><p>This light is offline.</p></div>
        ) : (
          <>
            {l.dimmable && (
              <div class="d-field">
                <div class="d-flab"><span class="lab">Brightness</span><span class="d-val">{l.on ? l.level + "%" : "Off"}</span></div>
                <Slider min={1} max={100} value={l.level} fill={l.on ? lightColor(l) : "var(--ink-3)"} label={l.name + " brightness"} onInput={(v) => setLevel(l.id, v)} />
              </div>
            )}

            {l.tunable && (
              <div class="d-field">
                <span class="lab">White temperature</span>
                <div class="seg" role="group" aria-label="White temperature">
                  <button class={l.on && wt === 0 ? "cur" : ""} onClick={() => setWarm(l.id, 15)}>Cool</button>
                  <button class={l.on && wt === 1 ? "cur" : ""} onClick={() => setWarm(l.id, 50)}>Neutral</button>
                  <button class={l.on && wt === 2 ? "cur" : ""} onClick={() => setWarm(l.id, 90)}>Warm</button>
                </div>
              </div>
            )}

            {l.colorable && (
              <div class="d-field">
                <span class="lab">Colour</span>
                <div class="d-swatches">
                  {SWATCHES.map((c) => (
                    <button
                      key={c.join(",")}
                      class={"d-sw" + (l.on && sameRgb(l.rgb, c) ? " cur" : "")}
                      style={`--sw:rgb(${c[0]},${c[1]},${c[2]})`}
                      onClick={() => setColor(l.id, c)}
                      aria-label={`Set colour rgb ${c.join(" ")}`}
                    />
                  ))}
                </div>
              </div>
            )}

            {!l.dimmable && !l.tunable && !l.colorable && (
              <p class="muted" style="font-size:20px">This light only supports on and off.</p>
            )}
          </>
        )}
      </SheetBody>
    </>
  );
}

/** Bottom sheet shell with swipe-down-to-dismiss. */
function SheetBody({ children }: { children: preact.ComponentChildren }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; dy: number } | null>(null);
  const onDown = (e: JSX.TargetedPointerEvent<HTMLDivElement>): void => {
    const t = e.target as HTMLElement;
    if (t.closest(".rng,.seg,.d-swatches,.swb,button")) return; // let controls work
    drag.current = { y: e.clientY, dy: 0 };
    ref.current?.setPointerCapture(e.pointerId);
  };
  const onMove = (e: JSX.TargetedPointerEvent<HTMLDivElement>): void => {
    if (!drag.current || !ref.current) return;
    const dy = Math.max(0, e.clientY - drag.current.y);
    drag.current.dy = dy;
    ref.current.style.transform = `translate(-50%,${dy}px)`;
  };
  const onUp = (): void => {
    if (!drag.current || !ref.current) return;
    const dy = drag.current.dy;
    drag.current = null;
    ref.current.style.transform = "";
    if (dy > 120) closeLight();
  };
  return (
    <div class="d-sheet card" ref={ref} role="dialog" aria-modal="true" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      {children}
    </div>
  );
}
