/** Map links for venues and trip pickup/drop points (exact pins set by organizers in the app). */

export interface Spot {
  lat: number;
  lng: number;
  /** True when the organizer pinned it; false when the app guessed it from the address. */
  pinned: boolean;
}

const coord = (v: unknown, limit: number): number | null =>
  typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= limit ? v : null;

/** `{ lat, lng, pinned? }` → a spot, or null when there is no usable position. */
export function spotOf(v: unknown): Spot | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const lat = coord(r.lat, 90);
  const lng = coord(r.lng, 180);
  if (lat === null || lng === null) return null;
  return { lat, lng, pinned: r.pinned === true };
}

/** Google Maps showing the spot. */
export function mapsUrl(s: { lat: number; lng: number }): string {
  return `https://www.google.com/maps/search/?api=1&query=${s.lat.toFixed(6)},${s.lng.toFixed(6)}`;
}
