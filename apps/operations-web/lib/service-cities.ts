/**
 * The cities PULSE serves (`appConfig/cities`, written by setServiceCities in
 * firebase/functions/src/platform/serviceCities.ts). The app's city pickers
 * show only active cities, and the server refuses event venues and trip
 * starting cities outside them. The server owns the canonical city key
 * (old names like "Bangalore" are the same city as "Bengaluru"); here we only
 * catch obvious mistakes before sending.
 */

export interface ServiceCityRow {
  /** Server cityKey; absent for a city added in this session. */
  key: string | null;
  name: string;
  state: string;
  active: boolean;
  lat: number | null;
  lng: number | null;
}

export interface NewCityInput {
  name: string;
  state: string;
  lat: string;
  lng: string;
}

export const MAX_SERVICE_CITIES = 200;
const NAME = /^[\p{L}][\p{L}\p{M} .'-]*$/u;

const clean = (s: string) => s.trim().replace(/\s+/g, " ");
const loose = (s: string) => clean(s).toLowerCase();

const coordOf = (v: unknown, limit: number): number | null =>
  typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= limit ? v : null;

/** The stored document → rows (tolerates partial or hand-edited documents). */
export function readServiceCities(data: Record<string, unknown> | null | undefined): ServiceCityRow[] {
  const list = Array.isArray(data?.cities) ? (data!.cities as unknown[]) : [];
  return list.flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const c = x as Record<string, unknown>;
    if (typeof c.name !== "string" || !c.name.trim()) return [];
    const lat = coordOf(c.lat, 90);
    const lng = coordOf(c.lng, 180);
    return [{
      key: typeof c.key === "string" && c.key ? c.key : null,
      name: c.name,
      state: typeof c.state === "string" ? c.state : "",
      active: c.active !== false,
      lat: lat !== null && lng !== null ? lat : null,
      lng: lat !== null && lng !== null ? lng : null,
    }];
  });
}

/** "" → null; otherwise a number within ±limit, or NaN when it isn't one. */
export function parseCoord(text: string, limit: number): number | null {
  const t = text.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : Number.NaN;
}

/** Why the "Add city" form can't add this city yet, or null when it can. */
export function newCityProblem(rows: readonly ServiceCityRow[], input: NewCityInput): string | null {
  const name = clean(input.name);
  const state = clean(input.state);
  if (name.length < 2 || name.length > 60) return "City name must be 2–60 characters.";
  if (!NAME.test(name)) return "City name can only have letters, spaces, dots, apostrophes and hyphens.";
  if (state.length < 2 || state.length > 60) return "State must be 2–60 characters.";
  if (!NAME.test(state)) return "State can only have letters, spaces, dots, apostrophes and hyphens.";
  if (rows.some((r) => loose(r.name) === loose(name))) return `${name} is already on the list.`;
  if (rows.length >= MAX_SERVICE_CITIES) return `At most ${MAX_SERVICE_CITIES} cities.`;
  const lat = parseCoord(input.lat, 90);
  const lng = parseCoord(input.lng, 180);
  if ((lat === null) !== (lng === null)) return "Give both latitude and longitude, or neither.";
  if (Number.isNaN(lat) || Number.isNaN(lng)) return "Latitude must be between -90 and 90, longitude between -180 and 180.";
  return null;
}

/** Adds a city (active) at the end. Call only when newCityProblem is null. */
export function addCity(rows: readonly ServiceCityRow[], input: NewCityInput): ServiceCityRow[] {
  return [...rows, {
    key: null,
    name: clean(input.name),
    state: clean(input.state),
    active: true,
    lat: parseCoord(input.lat, 90),
    lng: parseCoord(input.lng, 180),
  }];
}

export const setActive = (rows: readonly ServiceCityRow[], index: number, active: boolean): ServiceCityRow[] =>
  rows.map((r, i) => (i === index ? { ...r, active } : r));

export const removeCity = (rows: readonly ServiceCityRow[], index: number): ServiceCityRow[] =>
  rows.filter((_, i) => i !== index);

/** What setServiceCities takes for each city (the server derives the key). */
export function toPayload(rows: readonly ServiceCityRow[]) {
  return rows.map((r) => ({
    name: r.name,
    state: r.state,
    active: r.active,
    ...(r.lat !== null && r.lng !== null ? { lat: r.lat, lng: r.lng } : {}),
  }));
}

export function sameCities(a: readonly ServiceCityRow[], b: readonly ServiceCityRow[]): boolean {
  return JSON.stringify(toPayload(a)) === JSON.stringify(toPayload(b));
}

/** Why the list can't be saved yet, or null. */
export function saveProblem(rows: readonly ServiceCityRow[], saved: readonly ServiceCityRow[], reason: string, exists: boolean): string | null {
  if (rows.length === 0) return "Keep at least one city. To pause a city, switch it off instead.";
  if (exists && sameCities(rows, saved)) return "No changes yet.";
  if (reason.trim().length < 3) return "Add a reason for the audit trail.";
  return null;
}

export const activeCount = (rows: readonly ServiceCityRow[]) => rows.filter((r) => r.active).length;
