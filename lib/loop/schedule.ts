const RUN_HOUR = 9; // run at 09:00 local

/**
 * Returns the calendar date (YYYY-MM-DD) of the day before `now` in the given IANA timezone.
 * Used to derive a stable "yesterday" for the artist's local clock — the daily cron runs at
 * 09:00 local, and we want yesterday's metrics in that same local sense.
 */
export function yesterdayInTimezone(now: Date, timezone: string): string {
  // Get the calendar date in the artist's tz, then subtract one day.
  // `sv-SE` produces YYYY-MM-DD which is convenient.
  const localTodayISO = now.toLocaleDateString("sv-SE", { timeZone: timezone });
  const [y, m, d] = localTodayISO.split("-").map(Number);
  const utcMidnight = new Date(Date.UTC(y, m - 1, d));
  utcMidnight.setUTCDate(utcMidnight.getUTCDate() - 1);
  return utcMidnight.toISOString().slice(0, 10);
}

/**
 * Returns the current hour (0-23) in the given IANA timezone, computed from `now`.
 * Pure: deterministic for the same (now, timezone) pair.
 */
export function localHour(now: Date, timezone: string): number {
  // `en-US` + `hour12: false` returns "0" through "23"; some locales use "24" for midnight.
  const fmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: timezone });
  const parts = fmt.formatToParts(now);
  const hourPart = parts.find((p) => p.type === "hour")?.value ?? "0";
  const hour = parseInt(hourPart, 10);
  return hour === 24 ? 0 : hour;
}

export function shouldRunNow(now: Date, timezone: string): boolean {
  return localHour(now, timezone) === RUN_HOUR;
}
