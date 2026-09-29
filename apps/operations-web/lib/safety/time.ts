/** Time helpers shared by the Safety and Tournaments modules. Times display in IST, like the console header. */

const TZ = "Asia/Kolkata";

export function toMillis(value?: string): number {
  if (!value) return NaN;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : NaN;
}

/** "29 Sep, 14:05" for ISO values; legacy free-text labels ("Today, 19:24") are shown as they are. */
export function formatWhen(value?: string): string {
  if (!value) return "—";
  const t = toMillis(value);
  if (!Number.isFinite(t)) return value;
  return new Date(t).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ });
}

export function formatDay(value?: string): string {
  if (!value) return "—";
  const t = toMillis(value);
  if (!Number.isFinite(t)) return value;
  return new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: TZ });
}

/** Compact duration: 45m, 3h 10m, 2d 4h. */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(Math.abs(minutes)));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
}

/** "12m ago" for ISO values; free text is returned unchanged. */
export function formatAgo(value?: string, now: number = Date.now()): string {
  const t = toMillis(value);
  if (!Number.isFinite(t)) return value ?? "—";
  const mins = (now - t) / 60000;
  if (mins < 1) return "just now";
  return `${formatDuration(mins)} ago`;
}

/** Value for a `<input type="datetime-local">` from a Date. */
export function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Value for a `<input type="date">` from a Date. */
export function toDateInput(d: Date): string {
  return toLocalInput(d).slice(0, 10);
}
