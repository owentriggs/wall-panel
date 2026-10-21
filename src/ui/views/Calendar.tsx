import type { JSX } from "preact";
import { useEffect, useState } from "preact/hooks";
import { Icon } from "../Icon";
import { hhmm } from "../format";
import { useStore, getCalendar, loadCalendar, setCalWeek, calendarIds } from "../../state/store";
import type { CalEvent } from "../../ha/calendar";

const DOW_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DOW_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_MS = 86_400_000;

/** Monday 00:00 of the week `offset` weeks from now (local) — mirrors the store. */
function mondayOf(offset: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow + offset * 7);
  return d;
}

interface DayCell {
  date: Date;
  isToday: boolean;
  events: CalEvent[];
}

/**
 * Bento calendar: a large focused-day tile (default today), a tappable week
 * glance to switch days, and an "Up next" agenda. Events are monochrome — no
 * per-calendar colour (kept deliberately flat and legible on a wall panel).
 */
export function Calendar(): JSX.Element {
  useStore();
  const cal = getCalendar();
  const ids = calendarIds();
  // Which weekday is expanded in the big tile. Starts on today (Mon = 0).
  const [focus, setFocus] = useState(() => (new Date().getDay() + 6) % 7);

  useEffect(() => {
    loadCalendar();
  }, []);

  const monday = mondayOf(cal.week);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIdx = Math.round((today.getTime() - monday.getTime()) / DAY_MS);
  const defaultFocus = todayIdx >= 0 && todayIdx <= 6 ? todayIdx : 0;

  // Re-centre on today (or the week's first day) whenever the week changes.
  useEffect(() => {
    setFocus(defaultFocus);
  }, [cal.week]);

  const days: DayCell[] = Array.from({ length: 7 }, (_, i) => {
    const start = new Date(monday);
    start.setDate(monday.getDate() + i);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);
    const s = start.getTime();
    const e = end.getTime();
    const events = cal.events
      .filter((ev) => ev.start < e && ev.end > s)
      .sort((a, b) => (a.allDay === b.allDay ? a.start - b.start : a.allDay ? -1 : 1));
    return { date: start, isToday: start.getTime() === today.getTime(), events };
  });

  const rangeLabel =
    monday.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) +
    " – " +
    days[6]!.date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const weekLabel = cal.week === 0 ? "This week" : cal.week === 1 ? "Next week" : cal.week === -1 ? "Last week" : rangeLabel;

  if (ids.length === 0) {
    return (
      <div class="cal">
        <CalHead weekLabel={weekLabel} rangeLabel={rangeLabel} week={cal.week} />
        <section class="card cal-empty">
          <div class="bigmsg"><Icon n="calendar" /><p>No calendars yet. Add a calendar integration in Home Assistant, then choose it in Settings → Calendar.</p></div>
        </section>
      </div>
    );
  }
  if (cal.status === "error") {
    return (
      <div class="cal">
        <CalHead weekLabel={weekLabel} rangeLabel={rangeLabel} week={cal.week} />
        <section class="card cal-empty">
          <div class="bigmsg"><Icon n="alert" /><p>Couldn’t load calendar events.</p></div>
        </section>
      </div>
    );
  }

  const fIdx = focus >= 0 && focus <= 6 ? focus : defaultFocus;
  const fday = days[fIdx]!;

  // "Up next": events still to come in the viewed week — from now for the
  // current week, from the week start for others. Flat, time-sorted agenda.
  const fromTs = cal.week === 0 ? Date.now() : monday.getTime();
  const upNext = cal.events.filter((ev) => ev.end > fromTs).sort((a, b) => a.start - b.start);

  return (
    <div class="cal">
      <CalHead weekLabel={weekLabel} rangeLabel={rangeLabel} week={cal.week} />
      <div class="cal-bento" aria-busy={cal.status === "loading"}>
        {/* Focused day — the big tile */}
        <section class={"card cal-focus" + (fday.isToday ? " today" : "")}>
          <header class="cal-focus-h">
            <div>
              <span class="cal-focus-dow">{fday.isToday ? "Today" : DOW_LONG[(fday.date.getDay() + 6) % 7]}</span>
              <h3>{fday.date.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}</h3>
            </div>
            <span class="cal-focus-n mono">{fday.events.length}</span>
          </header>
          <div class="cal-focus-evs">
            {fday.events.length === 0 ? (
              <div class="cal-blank">Nothing planned</div>
            ) : (
              <>
                {fday.events.slice(0, 6).map((ev, i) => (
                  <div key={i} class="cal-ev">
                    <span class="cal-ev-t mono">{ev.allDay ? "All day" : hhmm(ev.start)}</span>
                    <span class="cal-ev-s">{ev.summary}</span>
                  </div>
                ))}
                {fday.events.length > 6 && <div class="cal-more">+{fday.events.length - 6} more</div>}
              </>
            )}
          </div>
        </section>

        {/* Week glance — tap a day to focus it */}
        <section class="card cal-glance" role="tablist" aria-label="Days this week">
          {days.map((d, i) => (
            <button
              key={d.date.getTime()}
              role="tab"
              aria-selected={i === fIdx}
              class={"cal-grow" + (i === fIdx ? " sel" : "") + (d.isToday ? " today" : "")}
              onClick={() => setFocus(i)}
            >
              <span class="cal-grow-dow">{DOW_SHORT[(d.date.getDay() + 6) % 7]}</span>
              <span class="cal-grow-n mono">{d.date.getDate()}</span>
              <span class="cal-grow-c">{d.events.length || ""}</span>
            </button>
          ))}
        </section>

        {/* Up next — agenda */}
        <section class="card cal-agenda">
          <span class="cal-cap">Up next</span>
          {upNext.length === 0 ? (
            <div class="cal-blank sm">Nothing coming up</div>
          ) : (
            <div class="cal-ag-list">
              {upNext.slice(0, 5).map((ev, i) => (
                <div key={i} class="cal-ag">
                  <span class="cal-ag-day">{DOW_SHORT[(new Date(ev.start).getDay() + 6) % 7]}</span>
                  <span class="cal-ag-t mono">{ev.allDay ? "All day" : hhmm(ev.start)}</span>
                  <span class="cal-ag-s">{ev.summary}</span>
                </div>
              ))}
              {upNext.length > 5 && <div class="cal-more">+{upNext.length - 5} more</div>}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function CalHead({ weekLabel, rangeLabel, week }: { weekLabel: string; rangeLabel: string; week: number }): JSX.Element {
  return (
    <header class="cal-head">
      <div class="grow">
        <h2>{weekLabel}</h2>
        <p class="muted">{rangeLabel}</p>
      </div>
      {week !== 0 && <button class="btn" onClick={() => setCalWeek(0)}>Today</button>}
      <button class="round" onClick={() => setCalWeek(week - 1)} aria-label="Previous week"><Icon n="chevleft" /></button>
      <button class="round" onClick={() => setCalWeek(week + 1)} aria-label="Next week"><Icon n="chevright" /></button>
    </header>
  );
}
