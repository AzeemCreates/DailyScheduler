import { config } from "./config.js";

const DEFAULT_DURATION_MINUTES = 30;

const TIME_RANGE_RE = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|—|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;
const SINGLE_TIME_RE = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;

function to24Hour(hour, period) {
  const h = hour % 12;
  return period === "pm" ? h + 12 : h;
}

/** Convert a (year, month, day, hour, minute) civil time in `timeZone` to the equivalent UTC Date. */
function zonedTimeToUtc(year, month, day, hour, minute, timeZone) {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(guess).map((p) => [p.type, p.value]));
  const hh = parts.hour === "24" ? 0 : Number(parts.hour);
  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    hh,
    Number(parts.minute),
    Number(parts.second)
  );
  return new Date(guess.getTime() - (asIfUtc - guess.getTime()));
}

/**
 * Parse a free-form time string into 24-hour start/end components.
 * Supports "9pm", "9:00 PM - 9:45 PM", "9-9:45pm", "21:00-21:45".
 * A single time (no range) gets a DEFAULT_DURATION_MINUTES block.
 * Returns null if the string doesn't contain a recognizable time.
 */
function parseTimeString(str) {
  const rangeMatch = str.match(TIME_RANGE_RE);
  if (rangeMatch) {
    const sh = Number(rangeMatch[1]);
    const sm = rangeMatch[2] ? Number(rangeMatch[2]) : 0;
    let sp = rangeMatch[3] ? rangeMatch[3].toLowerCase() : null;
    const eh = Number(rangeMatch[4]);
    const em = rangeMatch[5] ? Number(rangeMatch[5]) : 0;
    let ep = rangeMatch[6] ? rangeMatch[6].toLowerCase() : null;

    if (!sp && !ep) {
      if (sh > 23 || eh > 23) return null;
      return { hour24Start: sh, minuteStart: sm, hour24End: eh, minuteEnd: em };
    }
    if (sh > 12 || eh > 12) return null;
    if (!sp) sp = ep;
    if (!ep) ep = sp;

    let hour24Start = to24Hour(sh, sp);
    let hour24End = to24Hour(eh, ep);
    const startMin = hour24Start * 60 + sm;
    let endMin = hour24End * 60 + em;

    // Inherited period put the end before the start (e.g. "11am-1" → flip to 1pm).
    if (endMin <= startMin && rangeMatch[6] === undefined) {
      const flippedPeriod = sp === "am" ? "pm" : "am";
      const flippedHour24End = to24Hour(eh, flippedPeriod);
      const flippedEndMin = flippedHour24End * 60 + em;
      if (flippedEndMin > startMin) {
        hour24End = flippedHour24End;
        endMin = flippedEndMin;
      }
    }
    return { hour24Start, minuteStart: sm, hour24End, minuteEnd: em };
  }

  const singleMatch = str.match(SINGLE_TIME_RE);
  if (singleMatch) {
    const h = Number(singleMatch[1]);
    const m = singleMatch[2] ? Number(singleMatch[2]) : 0;
    const p = singleMatch[3] ? singleMatch[3].toLowerCase() : null;
    const hour24Start = p ? to24Hour(h, p) : h;
    if (hour24Start > 23) return null;
    const endTotalMin = hour24Start * 60 + m + DEFAULT_DURATION_MINUTES;
    return {
      hour24Start,
      minuteStart: m,
      hour24End: Math.floor(endTotalMin / 60) % 24,
      minuteEnd: endTotalMin % 60,
    };
  }

  return null;
}

/**
 * Detect and parse a "Title: ... / Time: ..." quick-add message — a
 * deterministic alternative to asking the planner model to invent a
 * schedule, so a specific event you name is never mis-parsed.
 * Returns { title, start, end } (start/end are Date objects) or null if the
 * message doesn't contain both a title and a parseable time.
 */
export function parseQuickEvent(text, { planDateISO }) {
  const titleMatch = text.match(/title\s*:\s*(.+?)(?=(?:,\s*)?time\s*:|\n|\||$)/is);
  const timeMatch = text.match(/time\s*:\s*(.+?)(?=\n|\||$)/is);
  if (!titleMatch || !timeMatch) return null;

  const title = titleMatch[1].trim();
  const timeStr = timeMatch[1].trim();
  if (!title || !timeStr) return null;

  const parsed = parseTimeString(timeStr);
  if (!parsed) return null;

  const [year, month, day] = planDateISO.split("-").map(Number);
  const start = zonedTimeToUtc(year, month, day, parsed.hour24Start, parsed.minuteStart, config.timezone);
  let end = zonedTimeToUtc(year, month, day, parsed.hour24End, parsed.minuteEnd, config.timezone);
  if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000); // crosses midnight

  return { title, start, end };
}
