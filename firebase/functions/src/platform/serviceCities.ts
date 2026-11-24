/**
 * The cities PULSE serves, set from the super admin.
 * `appConfig/cities` = { cities: [{ key, name, state, active, lat?, lng? }], updatedAt, updatedBy }
 * (public read through the appConfig rule; written only here, audited).
 *  - key: cityKey(name), what events are matched on ("Bangalore" → "bengaluru").
 *  - active: false keeps the city on the list but stops new listings there and
 *    hides it from the app's city picker.
 *
 * Enforcement (assertServedCity): an event venue and a trip's starting city
 * must be an active service city when they are sent for review, and a live
 * event can't go back for review in a city PULSE doesn't serve. Until the
 * admin saves the list for the first time (no document), every city is allowed.
 */
import type { Transaction } from "firebase-admin/firestore";
import { callable, obj, str } from "./callable";
import { requireAdmin } from "./auth";
import { db, serverNow } from "./firestore";
import { writeAudit } from "./audit";
import { DomainError, precondition } from "./errors";
import { cityKey } from "../catalog/cityKey";

export const SERVICE_CITIES_DOC = "appConfig/cities";
export const MAX_SERVICE_CITIES = 200;

export interface ServiceCity {
  key: string;
  name: string;
  state: string;
  active: boolean;
  lat?: number;
  lng?: number;
}

/** Letters (any script), spaces and . ' - only: "Navi Mumbai", "Thiruvananthapuram". */
const NAME = /^[\p{L}][\p{L}\p{M} .'-]*$/u;

function place(value: unknown, label: string): string {
  const s = str(value, label, 2, 60).replace(/\s+/g, " ");
  if (!NAME.test(s)) throw new DomainError("INVALID_INPUT", `${label} “${s}” can only have letters, spaces, dots, apostrophes and hyphens.`);
  return s;
}

function coord(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new DomainError("INVALID_INPUT", `${label} must be a number between ${min} and ${max}.`);
  }
  return Math.round(value * 1e6) / 1e6;
}

/** Validates the console's list. Duplicate cities (same cityKey) are refused, never silently merged. */
export function parseServiceCities(value: unknown): ServiceCity[] {
  if (!Array.isArray(value)) throw new DomainError("INVALID_INPUT", "Cities must be a list.");
  if (value.length < 1) throw new DomainError("INVALID_INPUT", "Add at least one city. To pause a city, switch it off instead.");
  if (value.length > MAX_SERVICE_CITIES) throw new DomainError("INVALID_INPUT", `At most ${MAX_SERVICE_CITIES} cities.`);
  const seen = new Map<string, string>();
  return value.map((raw, i) => {
    const c = obj(raw);
    const n = i + 1;
    const name = place(c.name, `City #${n}`);
    const key = cityKey(name);
    if (key.length < 2) throw new DomainError("INVALID_INPUT", `City #${n} “${name}” needs an English name (letters a–z).`);
    const dup = seen.get(key);
    if (dup) throw new DomainError("INVALID_INPUT", `“${name}” and “${dup}” are the same city. Keep one.`);
    seen.set(key, name);
    const state = place(c.state, `State of ${name}`);
    if (c.active !== undefined && typeof c.active !== "boolean") {
      throw new DomainError("INVALID_INPUT", `Active for ${name} must be true or false.`);
    }
    const city: ServiceCity = { key, name, state, active: c.active !== false };
    const hasLat = c.lat !== undefined && c.lat !== null;
    const hasLng = c.lng !== undefined && c.lng !== null;
    if (hasLat !== hasLng) throw new DomainError("INVALID_INPUT", `${name}: give both latitude and longitude, or neither.`);
    if (hasLat) {
      city.lat = coord(c.lat, `${name} latitude`, -90, 90);
      city.lng = coord(c.lng, `${name} longitude`, -180, 180);
    }
    return city;
  });
}

export const setServiceCities = callable(async (data, context) => {
  const admin = requireAdmin(context, "app.config");
  const d = obj(data);
  const cities = parseServiceCities(d.cities);
  const reason = str(d.reason, "Reason", 3, 200);
  const ref = db().doc(SERVICE_CITIES_DOC);
  const before = await ref.get();
  const summary = (list: ServiceCity[]) => ({
    count: list.length,
    active: list.filter((c) => c.active).map((c) => c.key),
    inactive: list.filter((c) => !c.active).map((c) => c.key),
  });
  const batch = db().batch();
  batch.set(ref, { cities, updatedAt: serverNow(), updatedBy: admin.uid });
  writeAudit(batch, {
    action: "platform.service-cities-set", actorUid: admin.uid, actorRole: `platform:${admin.roleId}`,
    resourceType: "appConfig", resourceId: "cities",
    before: before.exists ? summary(readCities(before.data())) : null,
    after: summary(cities), reason, source: "operations-console",
  });
  await batch.commit();
  return { cities };
});

/** The stored list, tolerating hand-edited or partial documents. */
export function readCities(data: Record<string, unknown> | undefined): ServiceCity[] {
  const list = Array.isArray(data?.cities) ? (data!.cities as unknown[]) : [];
  return list.flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const c = x as Record<string, unknown>;
    if (typeof c.name !== "string") return [];
    return [{
      key: typeof c.key === "string" && c.key ? c.key : cityKey(c.name),
      name: c.name,
      state: typeof c.state === "string" ? c.state : "",
      active: c.active !== false,
    }];
  });
}

export const notServedMessage = (city: string) =>
  `PULSE isn't available in ${city.trim()} yet. Choose one of the cities PULSE serves.`;

/**
 * Refuses a city that isn't an active service city. No `appConfig/cities`
 * document yet → everything is allowed (staging keeps working until the
 * admin sets the list).
 */
export async function assertServedCity(tx: Transaction, city: string): Promise<void> {
  const snap = await tx.get(db().doc(SERVICE_CITIES_DOC));
  if (!snap.exists) return;
  const key = cityKey(city);
  if (readCities(snap.data()).some((c) => c.active && c.key === key)) return;
  throw precondition(notServedMessage(city), undefined, { cityKey: key });
}
