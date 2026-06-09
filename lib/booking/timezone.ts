/**
 * Time-zone helpers for the booking system.
 *
 * Availability windows are configured as wall-clock times ("09:00"–"17:00") in
 * the booking page's IANA time zone (e.g. America/New_York). Historically the
 * slot generator treated those strings as UTC, so 9 AM–5 PM Eastern was emitted
 * as 09:00–17:00 UTC and displayed to visitors as 5 AM–12:30 PM. These helpers
 * convert between a page-timezone wall clock and the correct UTC instant using
 * the platform Intl database (DST-aware, no external dependency).
 */

interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  second: number;
}

/** The calendar/clock parts of an instant as observed in `timeZone`. */
export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(instant)) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  let hour = parseInt(map.hour, 10);
  if (hour === 24) hour = 0; // some engines emit '24' for midnight
  return {
    year: parseInt(map.year, 10),
    month: parseInt(map.month, 10),
    day: parseInt(map.day, 10),
    hour,
    minute: parseInt(map.minute, 10),
    second: parseInt(map.second, 10),
  };
}

/** Offset in ms to ADD to a UTC instant to get the wall clock in `timeZone`. */
function tzOffsetMs(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUTC - instant.getTime();
}

/**
 * The UTC instant for a wall-clock time on `dateStr` (YYYY-MM-DD) in `timeZone`.
 * e.g. ('2026-07-15', 9, 0, 'America/New_York') -> 2026-07-15T13:00:00Z (EDT).
 */
export function zonedWallTimeToUtc(
  dateStr: string,
  hours: number,
  minutes: number,
  timeZone: string,
): Date {
  const y = parseInt(dateStr.slice(0, 4), 10);
  const mo = parseInt(dateStr.slice(5, 7), 10);
  const d = parseInt(dateStr.slice(8, 10), 10);
  // First approximation: treat the wall time as if it were already UTC.
  const guess = new Date(Date.UTC(y, mo - 1, d, hours, minutes, 0, 0));
  // Correct by the zone offset at that instant, then re-check once for the rare
  // case where the correction itself crosses a DST boundary.
  const off1 = tzOffsetMs(guess, timeZone);
  const corrected = new Date(guess.getTime() - off1);
  const off2 = tzOffsetMs(corrected, timeZone);
  if (off2 !== off1) return new Date(guess.getTime() - off2);
  return corrected;
}

/** Wall-clock minutes-of-day (0..1439) of `instant` in `timeZone`. */
export function zonedMinutesOfDay(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  return p.hour * 60 + p.minute;
}

/** Calendar date (YYYY-MM-DD) of `instant` as observed in `timeZone`. */
export function zonedDateStr(instant: Date, timeZone: string): string {
  const p = zonedParts(instant, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Day of week (0=Sun..6=Sat) of `instant` as observed in `timeZone`. */
export function zonedDayOfWeek(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  // Weekday of a calendar date is tz-independent once we have Y/M/D.
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
}
