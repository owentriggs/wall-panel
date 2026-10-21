/**
 * Calendar events via Home Assistant's `calendar.get_events` action.
 *
 * We call it over the websocket with `return_response: true` and read the
 * result's `response`, which is keyed by calendar entity id → `{ events: [...] }`.
 * (Verified against the official docs; the service replaced the deprecated
 * `calendar.list_events`.) Timed events carry ISO date-times; all-day events
 * carry date-only strings — we detect those and flag them.
 */
import type { HaConnection } from "./types";

export interface CalEvent {
  cal: string; // source calendar entity id
  summary: string;
  start: number; // epoch ms (local)
  end: number; // epoch ms (local)
  allDay: boolean;
  location?: string;
  description?: string;
}

/** Raw event shape returned by calendar.get_events. */
interface RawEvent {
  summary?: string;
  start?: string;
  end?: string;
  location?: string;
  description?: string;
}
type GetEventsResponse = Record<string, { events?: RawEvent[] } | undefined>;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function parseTime(s: string | undefined): { ms: number; allDay: boolean } {
  if (!s) return { ms: NaN, allDay: false };
  if (DATE_ONLY.test(s)) {
    // All-day: parse as local midnight (not UTC) so the day lands correctly.
    const [y, m, d] = s.split("-").map(Number);
    return { ms: new Date(y!, (m ?? 1) - 1, d ?? 1).getTime(), allDay: true };
  }
  // HA may return "2026-10-18T19:00:00+01:00" or "2026-10-18 19:00:00".
  return { ms: new Date(s.replace(" ", "T")).getTime(), allDay: false };
}

/**
 * Fetch events for the given calendars between two instants. Returns a flat,
 * time-sorted list tagged with its source calendar. Rejects on transport error;
 * a calendar that returns nothing simply contributes no events.
 */
export async function getCalendarEvents(
  conn: HaConnection,
  entityIds: string[],
  start: Date,
  end: Date,
): Promise<CalEvent[]> {
  if (!entityIds.length) return [];
  const res = await conn.callWS<{ response?: GetEventsResponse } | GetEventsResponse>({
    type: "call_service",
    domain: "calendar",
    service: "get_events",
    service_data: { start_date_time: start.toISOString(), end_date_time: end.toISOString() },
    target: { entity_id: entityIds },
    return_response: true,
  });
  // The websocket wraps service responses in `{ context, response }`; some
  // transports hand back the response object directly. Accept either.
  const resp = (res && typeof res === "object" && "response" in res ? res.response : res) as GetEventsResponse | undefined;
  if (!resp) return [];

  const out: CalEvent[] = [];
  for (const [cal, bucket] of Object.entries(resp)) {
    for (const ev of bucket?.events ?? []) {
      const s = parseTime(ev.start);
      const e = parseTime(ev.end);
      if (Number.isNaN(s.ms)) continue;
      out.push({
        cal,
        summary: ev.summary?.trim() || "(No title)",
        start: s.ms,
        end: Number.isNaN(e.ms) ? s.ms : e.ms,
        allDay: s.allDay,
        ...(ev.location ? { location: ev.location } : {}),
        ...(ev.description ? { description: ev.description } : {}),
      });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}
