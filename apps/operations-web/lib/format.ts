export const inr = (n: number): string =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

/** A whole count in en-IN grouping ("1,84,320"); "—" when missing. */
export const countFull = (n: number | null | undefined): string => (typeof n !== "number" || !Number.isFinite(n) ? "—" : new Intl.NumberFormat("en-IN").format(n));

/** How a capped read is ordered: newest first, oldest (longest-waiting) first, or no meaningful order. */
export type ListOrder = "newest" | "oldest" | null;

/** The truncated-list note: "the newest N", "the N longest-waiting", or "the first N" for an unordered read. */
export const truncatedCopy = (shown: number, order: ListOrder, noun = "records"): string =>
  order === "oldest" ? `Showing the ${countFull(shown)} longest-waiting ${noun}.` : `Showing the ${order === "newest" ? "newest" : "first"} ${countFull(shown)} ${noun}.`;

export const pct = (n: number): string => `${Math.round(n)}%`;

export const fillRate = (booked: number, capacity: number): number =>
  Math.round((booked / Math.max(capacity, 1)) * 100);

export const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

export const cn = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter(Boolean).join(" ");

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const trim = (s: string) => s.replace(/\.0+$|(\.\d*?)0+$/, "$1");

const MINUS = "−";

type Unit = { div: number; suffix: string; digits: number };

/** Scales `a` (≥ 0) to the largest unit it reaches, re-checking after rounding so 999.6 reads "1k", not "1000". */
function scaled(a: number, units: Unit[]): string {
  let i = 0;
  while (i + 1 < units.length && a >= units[i + 1].div) i++;
  for (;;) {
    const u = units[i];
    const fixed = (a / u.div).toFixed(u.digits);
    const next = units[i + 1];
    if (next && Number(fixed) * u.div >= next.div) {
      i++;
      continue;
    }
    return `${u.digits ? trim(fixed) : fixed}${u.suffix}`;
  }
}

const signed = (negative: boolean, body: string) => (negative && !/^\D*0$/.test(body) ? `${MINUS}${body}` : body);

const inrPaise = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Paise as en-IN rupees, exact: "₹1,84,320", "₹449.50"; negatives read "−₹950". Paise show only when non-zero. */
export const inrMinor = (minor: number | null | undefined): string => {
  if (!finite(minor)) return "—";
  const abs = Math.abs(Math.round(minor));
  return signed(minor < 0, abs % 100 ? inrPaise.format(abs / 100) : inr(abs / 100));
};

const INR_UNITS = (a: number): Unit[] => [
  { div: 1, suffix: "", digits: 0 },
  { div: 1e3, suffix: "k", digits: 1 },
  { div: 1e5, suffix: "L", digits: 2 },
  { div: 1e7, suffix: "Cr", digits: a >= 1e8 ? 1 : 2 },
];

export function inrCompact(minor: number | null | undefined): string {
  if (!finite(minor)) return "—";
  const a = Math.abs(minor / 100);
  return signed(minor < 0, `₹${scaled(a, INR_UNITS(a))}`);
}

const COUNT_UNITS: Unit[] = [
  { div: 1, suffix: "", digits: 0 },
  { div: 1e3, suffix: "k", digits: 1 },
  { div: 1e5, suffix: "L", digits: 1 },
  { div: 1e7, suffix: "Cr", digits: 1 },
];

export function countCompact(n: number | null | undefined): string {
  if (!finite(n)) return "—";
  return signed(n < 0, scaled(Math.abs(n), COUNT_UNITS));
}

export function deltaPct(current: number | null, previous: number | null): { label: string; tone: "up" | "down" | "flat" | "new" | "none" } {
  if (!finite(current) || !finite(previous)) return { label: "", tone: "none" };
  if (previous === 0) return current === 0 ? { label: "0%", tone: "flat" } : { label: "new", tone: "new" };
  const p = Math.round(((current - previous) / Math.abs(previous)) * 100);
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
