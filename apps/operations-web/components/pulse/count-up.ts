export type Countable = { prefix: string; target: number; decimals: number; grouped: boolean; suffix: string };

// "₹1,84,320", "87%", "1.6%", "412" are countable; "—", "14/16", "₹1.84L" round-trips only if it reformats identically.
export function parseCountable(value: string): Countable | null {
  const m = /^([^\d-]*)(-?\d[\d,]*(?:\.\d+)?)(\D*)$/.exec(value.trim());
  if (!m) return null;
  const [, prefix, raw, suffix] = m;
  const target = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(target)) return null;
  const c: Countable = { prefix, target, decimals: raw.includes(".") ? raw.split(".")[1].length : 0, grouped: raw.includes(","), suffix };
  return formatCountable(c, target) === value.trim() ? c : null;
}

export function formatCountable(c: Countable, n: number): string {
  const body = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: c.decimals,
    maximumFractionDigits: c.decimals,
    useGrouping: c.grouped,
  }).format(n);
  return `${c.prefix}${body}${c.suffix}`;
}
