/**
 * Google Maps links → exact coordinates, so an organizer can pin a venue or
 * a trip pickup point by pasting what Google Maps' "Share" gives them.
 *
 * Share links are short (`https://maps.app.goo.gl/…`) and carry no
 * coordinates; they redirect to a full `google.com/maps/…` URL that does.
 * Phones and the web build can't follow those redirects themselves (CORS),
 * so the server does — only ever to Google hosts, at most a few hops, with
 * a short timeout. It never reads page bodies.
 */
import { callable, obj } from "../platform/callable";
import { requirePhoneUser } from "../platform/actors";
import { consumeLimit } from "../platform/rateLimit";
import { DomainError } from "../platform/errors";

export interface GeoPoint {
  lat: number;
  lng: number;
}

const MAX_HOPS = 5;
const HOP_TIMEOUT_MS = 5000;

/** Hosts we fetch. Anything else is refused (no open proxy / SSRF). */
export function isGoogleMapsHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "maps.app.goo.gl" || h === "goo.gl") return true;
  // google.com, google.co.in, maps.google.com, www.google.co.in, …
  return /^(www\.|maps\.)?google\.(com|co\.[a-z]{2}|[a-z]{2,3})$/.test(h);
}

const valid = (lat: number, lng: number): GeoPoint | null =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0)
    ? { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 }
    : null;

const NUM = String.raw`(-?\d{1,3}(?:\.\d+)?)`;

/**
 * Coordinates written in a Maps URL or typed as "12.9716, 77.5946".
 * Prefers the place's own position (`!3d…!4d…`) over the map view (`@…`),
 * which is only where the screen was centred.
 */
export function parseMapsCoordinates(text: string): GeoPoint | null {
  let s = text.trim();
  try {
    s = decodeURIComponent(s);
  } catch {
    // Not URI-encoded: use as is.
  }
  const tries: RegExp[] = [
    new RegExp(String.raw`!3d${NUM}!4d${NUM}`),
    new RegExp(String.raw`[?&](?:q|query|destination|daddr|ll|center|sll)=(?:loc:)?${NUM}\s*,\s*\+?${NUM}`),
    new RegExp(String.raw`/maps/(?:place|search|dir/[^/]*)/${NUM}\s*,\s*\+?${NUM}`),
    new RegExp(String.raw`@${NUM},${NUM}`),
    new RegExp(String.raw`^${NUM}\s*,\s*${NUM}$`),
  ];
  for (const re of tries) {
    const m = re.exec(s);
    if (!m) continue;
    const p = valid(Number(m[1]), Number(m[2]));
    if (p) return p;
  }
  return null;
}

export type Fetcher = (url: string) => Promise<{ status: number; location: string | null }>;

const defaultFetcher: Fetcher = async (url) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HOP_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (PULSE link check)" },
    });
    await res.body?.cancel();
    return { status: res.status, location: res.headers.get("location") };
  } finally {
    clearTimeout(timer);
  }
};

const notFound = () =>
  new DomainError("NOT_FOUND", "We couldn't find a location in that link.", {
    nextStep: "In Google Maps, drop a pin on the exact spot, tap Share and copy the link.",
  });

export async function resolveMapsLinkCommand(data: unknown, fetcher: Fetcher = defaultFetcher): Promise<GeoPoint> {
  const d = obj(data);
  const raw = typeof d.link === "string" ? d.link.trim() : "";
  if (raw.length < 3 || raw.length > 2000) {
    throw new DomainError("INVALID_INPUT", "Paste a Google Maps link or coordinates.");
  }
  const direct = parseMapsCoordinates(raw);
  if (direct) return direct;

  // The link may sit inside shared text ("Skyline Arena https://maps.app.goo.gl/…").
  const urlMatch = /https?:\/\/\S+/i.exec(raw);
  let url = urlMatch ? urlMatch[0] : raw;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new DomainError("INVALID_INPUT", "That doesn't look like a Google Maps link.");
    }
    if (parsed.protocol !== "https:" || !isGoogleMapsHost(parsed.hostname)) {
      throw new DomainError("INVALID_INPUT", "Only Google Maps links can be used here.");
    }
    const here = parseMapsCoordinates(parsed.toString());
    if (here) return here;
    if (hop === MAX_HOPS) break;
    let res: { status: number; location: string | null };
    try {
      res = await fetcher(parsed.toString());
    } catch {
      throw new DomainError("PRECONDITION", "Google Maps didn’t answer. Try again in a moment.");
    }
    if (res.status < 300 || res.status >= 400 || !res.location) break;
    url = new URL(res.location, parsed).toString();
  }
  throw notFound();
}

export const resolveMapsLink = callable(async (data, context) => {
  const uid = requirePhoneUser(context).uid;
  await consumeLimit("catalogOps", uid);
  return resolveMapsLinkCommand(data);
});
