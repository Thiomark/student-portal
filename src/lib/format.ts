// Dates are shown in the school's timezone, never the server's.

export function formatDate(value: Date | string | null | undefined, timeZone: string): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeZone }).format(date);
}

export function formatDateTime(value: Date | string | null | undefined, timeZone: string): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short", timeZone }).format(date);
}

export function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency }).format(cents / 100);
}

export function fullName(p: { firstName: string; lastName: string; preferredName?: string | null }): string {
  return `${p.preferredName || p.firstName} ${p.lastName}`;
}

// Converts a <input type="datetime-local"> value, entered in the school's
// timezone, to a UTC Date.
export function localInputToDate(value: string, timeZone: string): Date {
  const asUtc = new Date(`${value}:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(asUtc);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const zoned = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return new Date(asUtc.getTime() - (zoned - asUtc.getTime()));
}

export function toLocalInput(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

// Today's date (YYYY-MM-DD) in the school's timezone.
export function schoolToday(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

// Adds days to a YYYY-MM-DD date.
export function shiftDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
