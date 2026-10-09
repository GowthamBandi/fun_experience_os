/**
 * Public, shareable event pages: https://{site}/e/{eventId}.
 *
 * Rendered on the server so WhatsApp / Instagram / Google see the preview
 * tags (crawlers don't run JavaScript). Only what the PULSE app shows
 * before booking: never the street address, participants or commercials.
 * Firebase Hosting rewrites /e/** here and caches the answer for 5 minutes.
 */
import * as functions from "firebase-functions/v1";
import { db } from "../platform/firestore";

type Json = Record<string, unknown>;

/** Same labels and colours as the app (ExperienceCategory). */
const CATEGORIES: Record<string, { label: string; color: string }> = {
  sports: { label: "Sports", color: "#B6F04A" },
  music: { label: "Music", color: "#FF7AB6" },
  trips: { label: "Trips", color: "#3FD8C6" },
  movies: { label: "Movies", color: "#FFB84D" },
  social: { label: "Social", color: "#A58BFF" },
  wellness: { label: "Wellness", color: "#7FD4FF" },
  food: { label: "Food", color: "#FF8A5B" },
  workshops: { label: "Workshops", color: "#F2D24B" },
};

const POLICY: Record<string, string> = {
  flexible: "Flexible — full refund up to 24 hours before",
  moderate: "Moderate — full refund up to 3 days before",
  strict: "Strict — full refund up to 7 days before",
};

const ID = /^[A-Za-z0-9]{10,40}$/;

/** "/e/AbC123…" (optionally with a trailing slash) → the id, or null. */
export function eventIdFromPath(path: string): string | null {
  const m = /^\/e\/([^/?#]+)\/?$/.exec(path);
  return m && ID.test(m[1]) ? m[1] : null;
}

export type PageView =
  | { kind: "unavailable" }
  | {
      kind: "open" | "happened";
      id: string;
      title: string;
      tagline: string;
      category: string;
      startsAtMs: number;
      endsAtMs: number;
      venueName: string;
      area: string;
      city: string;
      priceMinor: number;
      spotsLeft: number;
      hostName: string;
      policy: string;
    };

const str = (v: unknown, fallback = ""): string => (typeof v === "string" && v.trim() ? v.trim() : fallback);
const num = (v: unknown, fallback = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const ms = (v: unknown): number | null => {
  if (v && typeof v === "object" && "toMillis" in v && typeof (v as { toMillis: unknown }).toMillis === "function") {
    return (v as { toMillis: () => number }).toMillis();
  }
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  return null;
};

const LISTED = new Set(["published", "booking-closed", "live", "completed"]);

/** Firestore docs → what the page may show. Pure. */
export function buildView(id: string, event: Json | null, experience: Json | null, organizer: Json | null, nowMs: number): PageView {
  if (!event || !LISTED.has(str(event.status))) return { kind: "unavailable" };
  const start = ms(event.startsAt);
  if (start === null) return { kind: "unavailable" };
  const end = ms(event.endsAt) ?? start + 2 * 3600_000;
  const venue = (event.venue ?? {}) as Json;
  const cap = (event.capacity ?? {}) as Json;
  const max = num(cap.maxPhysicalCapacity) - num(cap.blockedSlots);
  const remaining = typeof event.remainingSellableCapacity === "number" ? event.remainingSellableCapacity : max;
  const exp = experience ?? {};
  const happened = str(event.status) === "completed" || end <= nowMs;
  return {
    kind: happened ? "happened" : "open",
    id,
    title: str(event.title, str(exp.title, "An experience on PULSE")),
    tagline: str(exp.tagline),
    category: str(event.category, str(exp.category, "social")),
    startsAtMs: start,
    endsAtMs: end,
    venueName: str(venue.name),
    area: str(venue.area),
    city: str(venue.city),
    priceMinor: Math.max(0, Math.trunc(num(event.priceMinor))),
    spotsLeft: Math.max(0, Math.trunc(remaining)),
    hostName: str(organizer?.name, "a verified PULSE host"),
    policy: POLICY[str(event.cancellationPolicy, str(exp.cancellationPolicy, "strict"))] ?? POLICY.strict,
  };
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** JSON inside <script>: also neutralise "</script>" and line separators. */
function jsonForScript(v: unknown): string {
  // Backslash built from its code so no tool or editor rewrites the escape.
  const esc = (code: number) => String.fromCharCode(92) + "u" + code.toString(16).padStart(4, "0");
  return JSON.stringify(v)
    .replace(/</g, esc(0x3c))
    .replace(new RegExp(String.fromCharCode(0x2028), "g"), esc(0x2028))
    .replace(new RegExp(String.fromCharCode(0x2029), "g"), esc(0x2029));
}

const IST = "Asia/Kolkata";
const when = (t: number) =>
  new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: IST })
    .format(new Date(t))
    .replace(/\b(am|pm)\b/g, (m) => m.toUpperCase());
const price = (minor: number) => (minor === 0 ? "Free" : `₹${(minor / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);

export interface Site {
  /** "https://experience-os-staging.web.app" */
  origin: string;
  /** Where "Get PULSE" goes when the app isn't installed. */
  storeUrl: string;
  androidPackage: string;
}

export function renderEventPage(view: PageView, site: Site): { status: number; html: string } {
  const e = escapeHtml;
  if (view.kind === "unavailable") {
    return {
      status: 404,
      html: page(site, {
        title: "This experience isn’t available · PULSE",
        description: "It may have been cancelled or isn’t listed yet. See what else is on near you on PULSE.",
        url: site.origin,
        image: `${site.origin}/og/social.png`,
        body: `<main class="empty"><p class="eyebrow">PULSE</p><h1>This experience isn’t available</h1>
<p class="muted">It may have been cancelled or isn’t listed yet.</p>
<a class="cta" href="${e(site.storeUrl)}">See what’s on near you</a></main>`,
      }),
    };
  }
  const cat = CATEGORIES[view.category] ?? CATEGORIES.social;
  const url = `${site.origin}/e/${view.id}`;
  const place = [view.area, view.city].filter(Boolean).join(", ");
  const spots = view.spotsLeft === 0 ? "Sold out" : view.spotsLeft === 1 ? "1 spot left" : `${view.spotsLeft} spots left`;
  const facts = [when(view.startsAtMs), place, price(view.priceMinor), view.kind === "open" ? spots : ""].filter(Boolean);
  const description = view.kind === "happened"
    ? `This one has happened — see what’s on next in ${view.city || "your city"} on PULSE.`
    : `${facts.join(" · ")}. Hosted by ${view.hostName}.`;
  const intent = `intent://${new URL(site.origin).host}/e/${view.id}#Intent;scheme=https;package=${site.androidPackage};S.browser_fallback_url=${encodeURIComponent(site.storeUrl)};end`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: view.title,
    description: view.tagline || description,
    startDate: new Date(view.startsAtMs).toISOString(),
    endDate: new Date(view.endsAtMs).toISOString(),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: { "@type": "Place", name: view.venueName || place, address: { "@type": "PostalAddress", addressLocality: view.city, addressRegion: view.area, addressCountry: "IN" } },
    organizer: { "@type": "Organization", name: view.hostName },
    offers: { "@type": "Offer", price: (view.priceMinor / 100).toFixed(2), priceCurrency: "INR", availability: view.spotsLeft > 0 ? "https://schema.org/InStock" : "https://schema.org/SoldOut", url },
    image: `${site.origin}/og/${view.category}.png`,
  };
  const body = `<header class="cover" style="--c:${cat.color}">
  <a class="brand" href="${e(site.origin)}" aria-label="PULSE">PULSE</a>
  <span class="chip">${e(cat.label)}</span>
</header>
<main>
  <h1>${e(view.title)}</h1>
  ${view.tagline ? `<p class="tagline">${e(view.tagline)}</p>` : ""}
  <p class="host">Hosted by <strong>${e(view.hostName)}</strong> <span class="verified">✓ Verified</span></p>
  ${view.kind === "happened" ? `<p class="notice">This one has happened. Find what’s on next in the app.</p>` : ""}
  <dl class="facts">
    <div><dt>When</dt><dd>${e(when(view.startsAtMs))}</dd></div>
    <div><dt>Where</dt><dd>${e(view.venueName)}${view.venueName && place ? "<br>" : ""}${e(place)}</dd></div>
    <div><dt>Price</dt><dd>${e(price(view.priceMinor))}</dd></div>
    ${view.kind === "open" ? `<div><dt>Spots</dt><dd>${e(spots)}</dd></div>` : ""}
  </dl>
  <p class="policy">${e(view.policy)}</p>
  <div class="actions">
    <a class="cta" href="${e(intent)}">${view.kind === "open" ? "Join on PULSE" : "Open PULSE"}</a>
    <a class="ghost" href="${e(site.storeUrl)}">Get the app</a>
  </div>
  <p class="privacy">You join under an alias. Your number is never shown to anyone.</p>
</main>
<script type="application/ld+json">${jsonForScript(jsonLd)}</script>`;
  return {
    status: 200,
    html: page(site, {
      title: `${view.title} · ${when(view.startsAtMs)}`,
      description,
      url,
      image: `${site.origin}/og/${view.category}.png`,
      body,
    }),
  };
}

function page(site: Site, p: { title: string; description: string; url: string; image: string; body: string }): string {
  const e = escapeHtml;
  return `<!doctype html>
<html lang="en-IN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(p.title)}</title>
<meta name="description" content="${e(p.description)}">
<link rel="canonical" href="${e(p.url)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="PULSE">
<meta property="og:title" content="${e(p.title)}"><meta property="og:description" content="${e(p.description)}">
<meta property="og:url" content="${e(p.url)}"><meta property="og:image" content="${e(p.image)}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0B0A12">
<link rel="icon" href="${e(site.origin)}/favicon.png">
<style>
:root{--ink:#0B0A12;--surface:#15131f;--text:#f3f1fa;--muted:#a9a5bb;--line:#2a2738;--volt:#D9FF3F;--violet:#8E72FF}
*{box-sizing:border-box}html,body{margin:0;background:var(--ink);color:var(--text);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.cover{position:relative;height:200px;background:radial-gradient(120% 120% at 0% 0%,var(--violet) 0,transparent 55%),radial-gradient(120% 120% at 100% 100%,var(--c) 0,transparent 55%),var(--surface);padding:18px 16px;display:flex;justify-content:space-between;align-items:flex-start}
.brand{color:var(--text);font-weight:800;letter-spacing:4px;text-decoration:none}
.chip{background:rgba(11,10,18,.7);color:var(--volt);font-weight:700;font-size:13px;letter-spacing:.08em;text-transform:uppercase;padding:6px 12px;border-radius:999px}
main{max-width:640px;margin:0 auto;padding:20px 16px 48px}
h1{font-size:clamp(28px,7vw,40px);line-height:1.1;margin:4px 0 8px}
.tagline{color:var(--muted);margin:0 0 12px}.host{margin:0 0 16px}.verified{color:var(--volt);font-size:14px}
.notice{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.facts{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:16px 0}
.facts div{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:12px 14px}
dt{color:var(--muted);font-size:12px;letter-spacing:.08em;text-transform:uppercase}dd{margin:4px 0 0;font-weight:700}
.policy{color:var(--muted);font-size:14px}
.actions{display:grid;gap:10px;margin:24px 0 12px}
.cta{display:block;text-align:center;background:var(--volt);color:#14160B;font-weight:800;text-decoration:none;padding:16px;border-radius:999px}
.ghost{display:block;text-align:center;color:var(--text);text-decoration:none;padding:12px;border:1px solid var(--line);border-radius:999px}
.privacy{color:var(--muted);font-size:13px;text-align:center}
.empty{text-align:center;padding-top:80px}.eyebrow{color:var(--violet);font-weight:800;letter-spacing:.2em}.muted{color:var(--muted)}
</style></head><body>${p.body}</body></html>`;
}

const PACKAGE = "app.pulse.experience";

/** GET /e/{id} (via the Hosting rewrite). Public; no App Check. */
export const eventPage = functions.region("asia-south1").https.onRequest(async (req, res) => {
  const host = String(req.get("x-forwarded-host") ?? req.get("host") ?? "");
  const origin = `https://${/^[a-z0-9.-]+$/i.test(host) ? host : "experience-os-staging.web.app"}`;
  const site: Site = {
    origin,
    storeUrl: process.env.PULSE_STORE_URL ?? `https://play.google.com/store/apps/details?id=${PACKAGE}`,
    androidPackage: PACKAGE,
  };
  const id = eventIdFromPath(req.path);
  let view: PageView = { kind: "unavailable" };
  if (id) {
    const event = (await db().collection("events").doc(id).get()).data() ?? null;
    if (event) {
      const [exp, org] = await Promise.all([
        typeof event.experienceId === "string" ? db().collection("experiences").doc(event.experienceId).get() : null,
        typeof event.orgId === "string" ? db().collection("publicOrganizers").doc(event.orgId).get() : null,
      ]);
      view = buildView(id, event as Json, (exp?.data() as Json) ?? null, (org?.data() as Json) ?? null, Date.now());
    }
  }
  const { status, html } = renderEventPage(view, site);
  res.set("Cache-Control", "public, max-age=300, s-maxage=300");
  res.set("X-Content-Type-Options", "nosniff");
  res.status(status).type("html").send(html);
});
