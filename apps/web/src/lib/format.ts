export function formatTs(ts: number): string {
  return new Date(ts * 1000).toLocaleString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }) + " UTC";
}

/** "2026-07-19" → "Jul 19, 2026" (unambiguous, year always shown). */
export function formatDay(day: string): string {
  return new Date(day + "T00:00:00Z").toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** "2026-07-19" → "Jul 19" for compact axes where the year is given by context. */
export function formatDayShort(day: string): string {
  return new Date(day + "T00:00:00Z").toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
}

export function shorten(addr: string, n = 4): string {
  if (!addr) return "";
  return `${addr.slice(0, 2 + n)}…${addr.slice(-n)}`;
}

export function formatHexShort(hex: string, n = 8): string {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  return h.slice(0, n);
}
