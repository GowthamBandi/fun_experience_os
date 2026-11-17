/** Support SLA (Consumer Protection (E-Commerce) Rules 2020: resolve within a month). */

export function millis(t: unknown): number | null {
  if (t && typeof t === "object") {
    const o = t as { toMillis?: () => number; seconds?: number; _seconds?: number };
    if (typeof o.toMillis === "function") return o.toMillis();
    if (typeof o.seconds === "number") return o.seconds * 1000;
    if (typeof o._seconds === "number") return o._seconds * 1000;
  }
  return null;
}

/** Past its resolve-by date and still not resolved. */
export function isOverdue(r: { status: string; resolveBy: unknown }, now = Date.now()): boolean {
  const by = millis(r.resolveBy);
  return r.status !== "resolved" && by !== null && by < now;
}
