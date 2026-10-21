// Minimal Home Assistant shapes we actually use. Kept small on purpose.

export interface HassEntityAttributes {
  friendly_name?: string;
  icon?: string;
  device_class?: string;
  supported_features?: number;
  // light
  brightness?: number; // 0–255
  color_temp_kelvin?: number;
  rgb_color?: [number, number, number];
  effect_list?: string[];
  // media_player
  media_title?: string;
  media_artist?: string;
  entity_picture?: string;
  volume_level?: number;
  group_members?: string[];
  source?: string;
  source_list?: string[];
  // weather
  temperature?: number;
  // allow anything else without losing type-safety on the known fields
  [key: string]: unknown;
}

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: HassEntityAttributes;
  last_changed?: string;
  last_updated?: string;
}

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

export interface ServiceTarget {
  entity_id?: string | string[];
  area_id?: string | string[];
  device_id?: string | string[];
}

/**
 * The single interface the whole app talks to. A mock implementation (dev/tests)
 * and a real implementation (inside Home Assistant) both satisfy it, so no app
 * code ever needs to know which one it is using.
 */
export interface HaConnection {
  /** Live connection status, as a readable value that updates. */
  readonly status: () => ConnectionStatus;
  /** Subscribe to the full entity collection; callback fires on every change. Returns an unsubscribe fn. */
  subscribeEntities(cb: (entities: Record<string, HassEntity>) => void): () => void;
  /** Call a Home Assistant service (e.g. light.toggle). */
  callService(
    domain: string,
    service: string,
    data?: Record<string, unknown>,
    target?: ServiceTarget,
  ): Promise<void>;
  /**
   * Send a raw websocket command and resolve its result. Used for the
   * area/device/entity registries, `get_states`, Music Assistant browse and
   * `frontend/get_user_data` / `frontend/set_user_data`. Rejects on error.
   */
  callWS<T = unknown>(message: { type: string; [key: string]: unknown }): Promise<T>;
  /** Register a listener for status changes. Returns an unsubscribe fn. */
  onStatusChange(cb: (status: ConnectionStatus) => void): () => void;
  /** Whether the current HA user is an admin (gates the Settings gear). */
  isAdmin(): boolean;
  /**
   * Subscribe to a Home Assistant bus event (e.g. `wall_panel_updated`), used
   * for live cross-device config sync. Optional: the mock and old transports may
   * not implement it. Resolves to an unsubscribe fn.
   */
  subscribeEvents?<T = unknown>(
    eventType: string,
    cb: (event: { data?: T }) => void,
  ): Promise<() => void>;
}

// --- Registry shapes (Home Assistant websocket) ---

export interface AreaRegistryEntry {
  area_id: string;
  name: string;
  icon?: string | null;
}

export interface EntityRegistryEntry {
  entity_id: string;
  area_id?: string | null;
  device_id?: string | null;
  platform?: string;
  name?: string | null;
  original_name?: string | null;
  hidden_by?: string | null;
  disabled_by?: string | null;
  entity_category?: string | null;
}

export interface DeviceRegistryEntry {
  id: string;
  area_id?: string | null;
  name?: string | null;
  name_by_user?: string | null;
}
