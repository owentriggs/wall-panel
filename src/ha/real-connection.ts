import {
  subscribeEntities as haSubscribeEntities,
  type Connection,
  type HassEntities,
} from "home-assistant-js-websocket";
import type {
  ConnectionStatus,
  HaConnection,
  HassEntity,
  ServiceTarget,
} from "./types";

/**
 * The Home Assistant `hass` object given to a custom panel. We only type the
 * bits we use. HA keeps this authenticated and connected for us.
 */
export interface Hass {
  connection: Connection;
  user?: { is_admin?: boolean; name?: string };
  callService: (
    domain: string,
    service: string,
    data?: Record<string, unknown>,
    target?: ServiceTarget,
  ) => Promise<unknown>;
}

/**
 * Real connection: a thin adapter over the live `hass.connection`. No auth,
 * no token — HA already did that. We subscribe once and translate connection
 * lifecycle events into our simple status model.
 */
export class RealConnection implements HaConnection {
  private _status: ConnectionStatus;
  private statusListeners = new Set<(s: ConnectionStatus) => void>();

  constructor(private hass: Hass) {
    this._status = hass.connection.connected ? "connected" : "connecting";
    const conn = hass.connection;
    conn.addEventListener("ready", () => this.setStatus("connected"));
    conn.addEventListener("disconnected", () => this.setStatus("reconnecting"));
    conn.addEventListener("reconnect-error", () => this.setStatus("disconnected"));
  }

  /** Swap in a fresh hass object if HA replaces it (rare, but safe). */
  updateHass(hass: Hass): void {
    this.hass = hass;
  }

  status(): ConnectionStatus {
    return this._status;
  }

  isAdmin(): boolean {
    return this.hass.user?.is_admin ?? false;
  }

  private setStatus(s: ConnectionStatus): void {
    if (s === this._status) return;
    this._status = s;
    for (const cb of this.statusListeners) cb(s);
  }

  onStatusChange(cb: (s: ConnectionStatus) => void): () => void {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  subscribeEntities(cb: (e: Record<string, HassEntity>) => void): () => void {
    return haSubscribeEntities(this.hass.connection, (entities: HassEntities) => {
      cb(entities as unknown as Record<string, HassEntity>);
    });
  }

  async callService(
    domain: string,
    service: string,
    data?: Record<string, unknown>,
    target?: ServiceTarget,
  ): Promise<void> {
    await this.hass.callService(domain, service, data, target);
  }

  callWS<T = unknown>(message: { type: string; [key: string]: unknown }): Promise<T> {
    // Reuse HA's live, authenticated websocket — no second connection or token.
    return this.hass.connection.sendMessagePromise<T>(message);
  }

  subscribeEvents<T = unknown>(
    eventType: string,
    cb: (event: { data?: T }) => void,
  ): Promise<() => void> {
    // HA's websocket delivers `{ data, event_type, ... }`; we pass it straight
    // through. Returns the unsubscribe fn the library gives us.
    return this.hass.connection.subscribeEvents(
      (ev: unknown) => cb(ev as { data?: T }),
      eventType,
    );
  }
}
