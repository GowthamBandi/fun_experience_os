export const inr = (n: number): string =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

export const pct = (n: number): string => `${Math.round(n)}%`;

export const fillRate = (booked: number, capacity: number): number =>
  Math.round((booked / Math.max(capacity, 1)) * 100);

export const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

export const cn = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter(Boolean).join(" ");

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const trim = (s: string) => s.replace(/\.0+$|(\.\d*?)0+$/, "$1");

export const inrMinor = (minor: number | null | undefined): string =>
  finite(minor) ? inr(Math.round(minor) / 100) : "—";

export function inrCompact(minor: number | null | undefined): string {
  if (!finite(minor)) return "—";
  const r = minor / 100;
  const a = Math.abs(r);
  if (a >= 1e7) return `₹${trim((r / 1e7).toFixed(a >= 1e8 ? 1 : 2))}Cr`;
  if (a >= 1e5) return `₹${trim((r / 1e5).toFixed(2))}L`;
  if (a >= 1e3) return `₹${trim((r / 1e3).toFixed(1))}k`;
  return `₹${Math.round(r)}`;
}

export function countCompact(n: number | null | undefined): string {
  if (!finite(n)) return "—";
  if (Math.abs(n) >= 1e5) return `${trim((n / 1e5).toFixed(1))}L`;
  if (Math.abs(n) >= 1e3) return `${trim((n / 1e3).toFixed(1))}k`;
  return String(Math.round(n));
}

export function deltaPct(current: number | null, previous: number | null): { label: string; tone: "up" | "down" | "flat" | "new" | "none" } {
  if (!finite(current) || !finite(previous)) return { label: "", tone: "none" };
  if (previous === 0) return current === 0 ? { label: "0%", tone: "flat" } : { label: "new", tone: "new" };
  const p = Math.round(((current - previous) / previous) * 100);
  if (p === 0) return { label: "0%", tone: "flat" };
  return p > 0 ? { label: `▲ ${p}%`, tone: "up" } : { label: `▼ ${Math.abs(p)}%`, tone: "down" };
}

export function relTime(date: Date | null, now: Date): string {
  if (!date || Number.isNaN(date.getTime())) return "—";
  const s = Math.round((now.getTime() - date.getTime()) / 1000);
  if (s < 0) {
    const m = Math.round(-s / 60);
    return m < 60 ? `in ${Math.max(m, 1)} min` : `in ${Math.round(m / 60)} h`;
  }
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 172800) return "yesterday";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(date);
}

export function normalizePhone(input: string): string | null {
  let d = input.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? `+91${d}` : null;
}

export function maskPhone(e164: string | null | undefined): string {
  if (!e164) return "—";
  const m = /^\+91(\d{2})\d{5}(\d{3})$/.exec(e164);
  return m ? `+91 ${m[1]}•••••${m[2]}` : `${e164.slice(0, 4)}•••••`;
}
