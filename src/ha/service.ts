import type { HaConnection, ServiceTarget } from "./types";

/** The active connection (set once at startup by the bootstrap). */
let active: HaConnection | null = null;

export function setConnection(conn: HaConnection): void {
  active = conn;
}

export function getConnection(): HaConnection {
  if (!active) throw new Error("No HA connection set");
  return active;
}

export function callService(
  domain: string,
  service: string,
  data?: Record<string, unknown>,
  target?: ServiceTarget,
): Promise<void> {
  return getConnection().callService(domain, service, data, target);
}

// --- Light brightness helpers (HA uses 0–255; the UI shows 0–100%). ---

export function brightnessToPercent(brightness255: number | undefined): number {
  if (!brightness255 || brightness255 <= 0) return 0;
  return Math.round((brightness255 / 255) * 100);
}

export function percentToBrightness(percent: number): number {
  const clamped = Math.max(0, Math.min(100, percent));
  return Math.round((clamped / 100) * 255);
}
