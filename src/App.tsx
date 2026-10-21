import type { JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "./ui/Icon";
import { hhmm, plural, occupied } from "./ui/format";
import { ROOMS, type TabId } from "./state/model";
import {
  useStore,
  peek,
  setTab,
  togglePickerOrOpen,
  closePicker,
  selectRoom,
  roomLights,
  playingRooms,
  lights,
  toast,
  runUndo,
  reset,
  tick,
  detailId,
  closeLight,
  visibleTabs,
} from "./state/store";
import { Home } from "./ui/views/Home";
import { Rooms } from "./ui/views/Rooms";
import { Lights } from "./ui/views/Lights";
import { Media } from "./ui/views/Media";
import { Watch } from "./ui/views/Watch";
import { Scenes } from "./ui/views/Scenes";
import { Calendar } from "./ui/views/Calendar";
import { Settings } from "./ui/settings/Settings";
import { LightSheet } from "./ui/LightSheet";
import { settingsUI, requestSettings, closeSettings, closeEdit, closePick, applyDisp, getDisplay, pinPrompt, pinPush, cancelPin } from "./state/settings";
import { byId, themeTarget } from "./ui/root";

// Index within the currently-visible tabs (drives slide direction + swipe).
const tabIndex = (id: TabId): number => visibleTabs().findIndex((t) => t.id === id);
const VIEW: Record<TabId, () => JSX.Element> = { home: Home, rooms: Rooms, lights: Lights, media: Media, watch: Watch, scenes: Scenes, calendar: Calendar };

/** PIN keypad shown when a non-admin opens Settings. Admins never see it. */
function PinPad(): JSX.Element | null {
  const p = pinPrompt();
  if (!p.open) return null;
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];
  return (
    <>
      <div class="pin-scrim" onClick={cancelPin} />
      <div class="pinpad card" role="dialog" aria-modal="true" aria-label="Enter PIN to open settings">
        <div class="pin-ttl">Enter PIN</div>
        <div class={"pin-dots" + (p.error ? " err" : "")} aria-live="polite">
          {[0, 1, 2, 3].map((i) => (
            <i key={i} class={i < p.entry.length ? "on" : ""} />
          ))}
        </div>
        <div class="pin-keys">
          {keys.map((k, i) =>
            k === "" ? (
              <span key={i} />
            ) : (
              <button key={i} class="pin-key" onClick={() => pinPush(k)} aria-label={k === "del" ? "Delete" : k}>
                {k === "del" ? <Icon n="back" /> : k}
              </button>
            ),
          )}
        </div>
        <button class="btn pin-cancel" onClick={cancelPin}>Cancel</button>
      </div>
    </>
  );
}

function toggleTheme(): void {
  const root = themeTarget();
  const cur = root.getAttribute("data-theme") || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  root.setAttribute("data-theme", cur === "dark" ? "light" : "dark");
}

export function App({ demo = false, bare = false }: { demo?: boolean; bare?: boolean }): JSX.Element {
  const S = useStore();
  const fitRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLElement>(null);
  const [amb, setAmb] = useState(false);
  const ambRef = useRef(false);
  ambRef.current = amb;
  const lastTouch = useRef(Date.now());
  const scaleRef = useRef(1);
  const prevTab = useRef<TabId>(S.tab);

  // Slide direction for the tab transition.
  let slide = "";
  if (S.tab !== prevTab.current) {
    slide = tabIndex(S.tab) > tabIndex(prevTab.current) ? "slide-l" : "slide-r";
    prevTab.current = S.tab;
  }

  // Scale the 1280×800 stage to fit.
  useEffect(() => {
    const fit = (): void => {
      const f = fitRef.current;
      if (!f) return;
      const s = Math.min(f.clientWidth / 1280, f.clientHeight / 800) || 1;
      scaleRef.current = s;
      stageRef.current?.style.setProperty("--s", String(s));
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (fitRef.current) ro.observe(fitRef.current);
    return () => ro.disconnect();
  }, []);

  // Apply saved display settings (theme + brightness) once mounted.
  useEffect(() => {
    applyDisp();
  }, []);

  // Idle → ambient; sim tick every 1.5s. Sleep delay comes from Display settings.
  const driftRef = useRef(0);
  useEffect(() => {
    const id = setInterval(() => {
      tick();
      const sleep = getDisplay().sleep;
      if (sleep > 0 && !ambRef.current && Date.now() - lastTouch.current > sleep * 1000) setAmb(true);
      if (ambRef.current && Date.now() - driftRef.current > 20000) {
        driftRef.current = Date.now();
        const dr = byId("wp-drift");
        if (dr) {
          dr.style.setProperty("--dx", Math.random() * 80 - 40 + "px");
          dr.style.setProperty("--dy", Math.random() * 60 - 30 + "px");
        }
      }
    }, 1500);
    return () => clearInterval(id);
  }, []);

  const wake = (): void => {
    lastTouch.current = Date.now();
  };

  // Swipe between tabs + keyboard.
  useEffect(() => {
    const stage = stageRef.current;
    const view = viewRef.current;
    if (!stage) return;
    let swipe: { x: number; y: number; t: number; id: number; drag: boolean; dx: number } | null = null;

    const moveTab = (dir: number): void => {
      const tabs = visibleTabs();
      const i = tabs.findIndex((t) => t.id === peek().tab) + dir;
      if (i >= 0 && i < tabs.length) setTab(tabs[i]!.id);
    };
    const down = (e: PointerEvent): void => {
      if (ambRef.current) {
        e.stopPropagation();
        e.preventDefault();
        setAmb(false);
        wake();
        return;
      }
      wake();
      const t = e.target as HTMLElement;
      if (t.closest("input,.dock,.picker,.settings,.d-sheet,.d-scrim") || !t.closest(".stage")) return;
      swipe = { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId, drag: false, dx: 0 };
    };
    const move = (e: PointerEvent): void => {
      if (!swipe || e.pointerId !== swipe.id || !view) return;
      const dx = (e.clientX - swipe.x) / scaleRef.current;
      const dy = (e.clientY - swipe.y) / scaleRef.current;
      if (!swipe.drag) {
        if (Math.abs(dx) > 16 && Math.abs(dx) > Math.abs(dy) * 1.4) {
          swipe.drag = true;
          view.style.transition = "none";
        } else return;
      }
      swipe.dx = dx;
      const i = tabIndex(peek().tab);
      const edge = (dx > 0 && i === 0) || (dx < 0 && i === visibleTabs().length - 1);
      const f = edge ? 0.12 : 0.4;
      view.style.transform = `translateX(${(dx * f).toFixed(1)}px)`;
      view.style.opacity = String(1 - Math.min((Math.abs(dx) * f) / 300, 0.4));
    };
    const end = (e: PointerEvent): void => {
      if (!swipe || e.pointerId !== swipe.id) return;
      const s = swipe;
      swipe = null;
      if (!s.drag || !view) return;
      view.style.transition = "transform .25s,opacity .25s";
      view.style.transform = "";
      view.style.opacity = "";
      setTimeout(() => {
        if (view) view.style.transition = "";
      }, 280);
      const dt = Math.max(1, Date.now() - s.t);
      const commit = Math.abs(s.dx) > 120 || (Math.abs(s.dx) / dt > 0.5 && Math.abs(s.dx) > 45);
      if (commit) moveTab(s.dx < 0 ? 1 : -1);
    };
    const key = (e: KeyboardEvent): void => {
      wake();
      const t = e.target as HTMLElement;
      if (e.key === "Escape") {
        if (peek().picker) return closePicker();
        if (detailId.value) return closeLight();
        const s = settingsUI();
        if (s.pick) closePick();
        else if (s.edit) closeEdit();
        else if (s.open) closeSettings();
        return;
      }
      if (settingsUI().open) return; // settings owns the keyboard while open
      if (t.closest && t.closest("input")) return;
      if (e.key === "ArrowRight") moveTab(1);
      if (e.key === "ArrowLeft") moveTab(-1);
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", end);
    document.addEventListener("pointercancel", end);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", end);
      document.removeEventListener("pointercancel", end);
      document.removeEventListener("keydown", key);
    };
  }, []);

  const View = VIEW[S.tab];
  const on = lights().filter((l) => l.on).length;
  const pr = playingRooms();
  const d = new Date();
  const tv = toast.value;

  return (
    <div class={"wp-host" + (bare ? " bare" : "")}>
      <div id="vp">
        <div id="fit" ref={fitRef}>
          <div class="stage" ref={stageRef}>
            <main class={"view " + slide} key={S.tab} ref={viewRef} aria-live="off">
              <View />
            </main>

            <nav class="dock" aria-label="Main">
              {visibleTabs().map((t) => (
                <button
                  key={t.id}
                  class={"dock-btn" + (S.tab === t.id ? " cur" : "")}
                  aria-label={t.name}
                  aria-current={S.tab === t.id ? "page" : undefined}
                  onClick={() => (t.id === "rooms" ? togglePickerOrOpen() : setTab(t.id))}
                >
                  <Icon n={t.icon} />
                  <span class="lb">{t.id === "rooms" && S.tab === "rooms" ? ROOMS.find((r) => r.id === S.rroom)!.name : t.name}</span>
                </button>
              ))}
              <button class="dock-btn dock-set" aria-label="Settings" onClick={requestSettings}>
                <Icon n="gear" />
              </button>
            </nav>

            <Settings />
            <PinPad />
            <LightSheet />

            {S.picker && (
              <>
                <div class="picker-scrim" onClick={closePicker} />
                <div class="picker card" role="menu" aria-label="Choose a room">
                  {ROOMS.map((r) => {
                    const sn = S.sensors[r.id]!;
                    const lon = roomLights(r.id).filter((l) => l.on).length;
                    const occ = sn.hasMotion && occupied(sn);
                    return (
                      <button key={r.id} class={"rbtn" + (S.rroom === r.id ? " cur" : "")} role="menuitem" onClick={() => selectRoom(r.id)}>
                        <b>{r.name}{occ && <i class="occ" title="Occupied" />}</b>
                        <span>{sn.hasTemp && sn.temp != null ? sn.temp.toFixed(1) + "° · " : ""}{lon ? lon + " on" : "lights off"}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            <div class={"toast" + (tv.show ? " show" : "")} role="status" aria-live="polite">
              <span>{tv.msg}</span>
              {tv.undo && <button onClick={runUndo}><Icon n="undo" />Undo</button>}
            </div>

            <div class={"ambient" + (amb ? " show" : "")} aria-hidden="true" onClick={() => { setAmb(false); wake(); }}>
              <div class="drift" id="wp-drift">
                <div class="t">{hhmm(d.getTime())}</div>
                <div class="d">{d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</div>
                <div class="a">
                  <span>{on ? plural(on, "light") + " on" : "Lights off"}</span>
                  {pr.length > 0 && <span>Playing in {pr[0]!.name}{pr.length > 1 ? " and more" : ""}</span>}
                </div>
              </div>
            </div>
          </div>
        </div>

        {demo && (
          <div id="demo" role="toolbar" aria-label="Demo controls">
            <span>Demo controls</span>
            <button onClick={toggleTheme}><Icon n="theme" />Light or dark</button>
            <button onClick={() => setAmb(true)}><Icon n="sleep" />Sleep mode</button>
            <button onClick={reset}><Icon n="reset" />Reset</button>
          </div>
        )}
      </div>
      <div class="hint">This panel is built for a landscape wall tablet.<br />Turn your device sideways for the best view.</div>
    </div>
  );
}
