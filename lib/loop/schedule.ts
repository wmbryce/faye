const RUN_HOUR = 9; // run at 09:00 local

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
