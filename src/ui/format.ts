import { type Light, type Sensor, type Zone } from "../state/model";
import { peek } from "../state/store";
import { getDisp } from "../ha/config";

export const hhmm = (ts: number): string => {
  const h12 = getDisp().h12;
  return new Date(ts).toLocaleTimeString(h12 ? "en-US" : "en-GB", { hour: h12 ? "numeric" : "2-digit", minute: "2-digit", hour12: h12 });
};
export const plural = (n: number, w: string): string => n + " " + w + (n === 1 ? "" : "s");
export const mmss = (s: number): string => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
export const esc = (s: string): string =>
  String(s).replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[m] as string);

export function agoText(ts: number): string {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
  return m < 1 ? "just now" : m < 60 ? m + " min ago" : Math.floor(m / 60) + " h " + (m % 60) + " min ago";
}
export const occupied = (sn: Sensor): boolean => sn.motion === true;

export function lightColor(d: Light): string {
  const t = d.warm / 100;
  const a = [242, 169, 59];
  const b = [190, 226, 242];
  return "rgb(" + a.map((v, i) => Math.round(b[i]! + (v - b[i]!) * t)).join(",") + ")";
}

/** The speaker currently playing (drives the now-playing card). */
export function activeZone(): Zone | undefined {
  const zones = peek().media.zones;
  return zones.find((z) => z.on) ?? undefined;
}

export interface NowInfo {
  live: boolean;
  title: string;
  sub: string;
  art: string;
  dur: number;
  pos: number;
  playing: boolean;
}
export function nowInfo(): NowInfo {
  const z = activeZone();
  if (z && z.title) {
    const art = z.art ? `<img class="art" src="${esc(z.art)}" alt="Album art">` : artSvg(0);
    return { live: z.dur === 0, title: z.title, sub: z.artist || "", art, dur: z.dur, pos: z.pos, playing: true };
  }
  return { live: false, title: "Nothing playing", sub: "", art: artSvg(0), dur: 0, pos: 0, playing: false };
}

/**
 * Placeholder cover when there's no artwork: a plain dark surface with a single
 * muted music note — deliberately simple, never a "scene"-like picture. The
 * optional index is ignored (kept so existing call sites don't change).
 */
export function artSvg(_i?: number): string {
  return `<svg class="art art-empty" viewBox="0 0 230 230" role="img" aria-label="No artwork"><rect width="230" height="230" fill="var(--card-2)"/><g transform="translate(63 63) scale(4.33)" fill="none" stroke="var(--ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></g></svg>`;
}
export function tspark(a: number[], w: number, h: number): string {
  if (a.length < 2) return "";
  const mx = Math.max.apply(null, a) + 0.25;
  const mn = Math.min.apply(null, a) - 0.25;
  const pts = a.map((v, i) => [(i / (a.length - 1)) * w, h - 4 - ((v - mn) / (mx - mn)) * (h - 10)]);
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0]!.toFixed(1) + " " + p[1]!.toFixed(1)).join("");
  const e = pts[pts.length - 1]!;
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Temperature over the last 24 hours"><path class="spark-f" d="${line}L${w} ${h}L0 ${h}Z"/><path class="spark" vector-effect="non-scaling-stroke" d="${line}"/><circle cx="${(e[0]! - 5).toFixed(1)}" cy="${e[1]!.toFixed(1)}" r="5" fill="var(--accent)"/></svg>`;
}
export function mchart(hist: number[]): string {
  const W = 460;
  const H = 132;
  const bw = W / 12;
  const mx = Math.max(4, Math.max.apply(null, hist.length ? hist : [0]));
  const h = new Date().getHours();
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Motion events per hour, last 12 hours">`;
  (hist.length ? hist : new Array(12).fill(0)).forEach((v, i) => {
    const bh = Math.max(5, (v / mx) * (H - 34));
    const x = i * bw + (bw - 24) / 2;
    s += `<rect class="mbar${i === 11 ? " now" : ""}" x="${x.toFixed(1)}" y="${(H - 24 - bh).toFixed(1)}" width="24" height="${bh.toFixed(1)}" rx="7"/>`;
    if (i % 3 === 0 || i === 11)
      s += `<text class="ax" x="${i * bw + bw / 2}" y="${H - 4}" text-anchor="middle">${String((h - 11 + i + 24) % 24).padStart(2, "0")}</text>`;
  });
  return s + "</svg>";
}
