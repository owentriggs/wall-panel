import type {
  ConnectionStatus,
  HaConnection,
  HassEntity,
  ServiceTarget,
} from "./types";
import { seedEntities, seedRegistry, mockCalendar } from "../mock/seed";
import { mockBrowse } from "./mock-ma";

/**
 * In-memory mock of Home Assistant used by `npm run dev` and (later) Playwright.
 * It satisfies the SAME HaConnection interface as the real connection, so the
 * app runs identically against it. It understands just enough services to make
 * the spike interactive (toggle + brightness).
 */
export class MockConnection implements HaConnection {
  private entities = seedEntities();
  private registry = seedRegistry();
  private userData: Record<string, unknown> = {};
  /** In-memory stand-in for the `wall_panel` shared integration store. */
  private sharedConfig: unknown = null;
  private entityListeners = new Set<(e: Record<string, HassEntity>) => void>();
  private statusListeners = new Set<(s: ConnectionStatus) => void>();
  private _status: ConnectionStatus = "connecting";

  constructor() {
    // Simulate a brief connect, like the real thing.
    setTimeout(() => this.setStatus("connected"), 150);
  }

  status(): ConnectionStatus {
    return this._status;
  }

  isAdmin(): boolean {
    return true; // dev/mock: always admin so Settings is reachable
  }

  private setStatus(s: ConnectionStatus): void {
    this._status = s;
    for (const cb of this.statusListeners) cb(s);
  }

  onStatusChange(cb: (s: ConnectionStatus) => void): () => void {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  subscribeEntities(cb: (e: Record<string, HassEntity>) => void): () => void {
    this.entityListeners.add(cb);
    // Deliver current state immediately, as HA does.
    cb({ ...this.entities });
    return () => this.entityListeners.delete(cb);
  }

  private emit(): void {
    const snapshot = { ...this.entities };
    for (const cb of this.entityListeners) cb(snapshot);
  }

  private patch(id: string, next: Partial<HassEntity>): void {
    const prev = this.entities[id];
    if (!prev) return;
    this.entities[id] = {
      ...prev,
      ...next,
      attributes: { ...prev.attributes, ...(next.attributes ?? {}) },
      last_updated: new Date().toISOString(),
    };
  }

  private targetIds(data: Record<string, unknown>, target?: ServiceTarget): string[] {
    const raw = target?.entity_id ?? (data["entity_id"] as string | string[] | undefined);
    if (!raw) return [];
    return Array.isArray(raw) ? raw : [raw];
  }

  async callService(
    domain: string,
    service: string,
    data: Record<string, unknown> = {},
    target?: ServiceTarget,
  ): Promise<void> {
    const ids = this.targetIds(data, target);

    if (domain === "light") {
      for (const id of ids) {
        const cur = this.entities[id];
        if (!cur || cur.state === "unavailable") continue;
        if (service === "turn_on") {
          const pct = data["brightness_pct"] as number | undefined;
          const brightness = pct != null ? Math.round((pct / 100) * 255) : (data["brightness"] as number | undefined) ?? cur.attributes.brightness ?? 255;
          const kelvin = data["color_temp_kelvin"] as number | undefined;
          this.patch(id, { state: "on", attributes: { brightness, ...(kelvin != null ? { color_temp_kelvin: kelvin } : {}) } });
        } else if (service === "turn_off") {
          this.patch(id, { state: "off" });
        } else if (service === "toggle") {
          const on = cur.state === "on";
          this.patch(id, on ? { state: "off" } : { state: "on", attributes: { brightness: cur.attributes.brightness ?? 255 } });
        }
      }
      this.emit();
      return;
    }

    if (domain === "scene" && service === "turn_on") {
      for (const id of ids) this.patch(id, { state: new Date().toISOString() });
      this.emit();
      return;
    }

    if (domain === "script") {
      // Briefly flip "on" to simulate a run, then back to "off".
      for (const id of ids) this.patch(id, { state: "on" });
      this.emit();
      setTimeout(() => {
        for (const id of ids) this.patch(id, { state: "off" });
        this.emit();
      }, 1200);
      return;
    }

    if (domain === "media_player") {
      for (const id of ids) {
        const cur = this.entities[id];
        const vol = (cur?.attributes.volume_level as number | undefined) ?? 0.2;
        if (service === "volume_set" && typeof data["volume_level"] === "number") {
          this.patch(id, { attributes: { volume_level: data["volume_level"] as number } });
        } else if (service === "volume_up") {
          this.patch(id, { attributes: { volume_level: Math.min(1, vol + 0.05) } });
        } else if (service === "volume_down") {
          this.patch(id, { attributes: { volume_level: Math.max(0, vol - 0.05) } });
        } else if (service === "volume_mute") {
          this.patch(id, { attributes: { is_volume_muted: !!data["is_volume_muted"] } });
        } else if (service === "turn_on") {
          this.patch(id, { state: "on" });
        } else if (service === "turn_off") {
          this.patch(id, { state: "off" });
        } else if (service === "media_play_pause" || service === "play_pause") {
          this.patch(id, { state: cur?.state === "playing" ? "paused" : "playing" });
        } else if (service === "media_play") {
          this.patch(id, { state: "playing" });
        } else if (service === "media_pause") {
          this.patch(id, { state: "paused" });
        }
      }
      this.emit();
      return;
    }

    if (domain === "remote") {
      for (const id of ids) {
        if (service === "turn_on") {
          const activity = data["activity"] as string | undefined;
          this.patch(id, { state: "on", ...(activity ? { attributes: { current_activity: activity } } : {}) });
        } else if (service === "turn_off") {
          this.patch(id, { state: "off" });
        }
        // send_command: no observable state in the mock (real devices react).
      }
      this.emit();
      return;
    }

    // Unknown service in the mock: no-op (real HA would handle it).
  }

  async callWS<T = unknown>(message: { type: string; [key: string]: unknown }): Promise<T> {
    switch (message.type) {
      case "config/area_registry/list":
        return this.registry.areas as unknown as T;
      case "config/entity_registry/list":
        return this.registry.entities as unknown as T;
      case "config/device_registry/list":
        return this.registry.devices as unknown as T;
      case "get_states":
        return Object.values(this.entities) as unknown as T;
      case "wall_panel/get":
        // Mock the shared household store so dev exercises the preferred path.
        return { value: this.sharedConfig } as unknown as T;
      case "wall_panel/set":
        this.sharedConfig = message["value"];
        return { ok: true } as unknown as T;
      case "frontend/get_user_data":
        return { value: this.userData[message["key"] as string] ?? null } as unknown as T;
      case "frontend/set_user_data":
        this.userData[message["key"] as string] = message["value"];
        return undefined as unknown as T;
      case "call_service":
        // Only calendar.get_events (return_response) is exercised via the mock.
        if (message["domain"] === "calendar" && message["service"] === "get_events") {
          const target = message["target"] as { entity_id?: string | string[] } | undefined;
          const raw = target?.entity_id ?? [];
          const idList = Array.isArray(raw) ? raw : [raw];
          const sd = message["service_data"] as { start_date_time?: string; end_date_time?: string } | undefined;
          return { response: mockCalendar(idList, sd?.start_date_time, sd?.end_date_time) } as unknown as T;
        }
        return undefined as unknown as T;
      default:
        return mockBrowse(message) as T;
    }
  }
}
