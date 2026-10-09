import { collection, doc, endAt, getDoc, getDocs, limit, orderBy, query, startAt, where, type DocumentData, type Firestore, type QueryConstraint } from "firebase/firestore";
import { maskPhone, normalizePhone } from "@/lib/format";
import type { NavItem } from "@/lib/nav";

export type QueryKind = "phone" | "reference" | "id" | "text";

export type SearchHitKind = "organizer" | "event" | "experience" | "booking" | "customer";

export interface SearchHit {
  kind: SearchHitKind;
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

export interface SearchDeps {
  db: Firestore;
}

const REFERENCE = /^PLS-[A-Z2-9]{6}$/i;
const DOC_ID = /^[A-Za-z0-9_-]{20,40}$/;
const PHONE_CHARS = /^\+?[\d\s().-]+$/;

export function classifyQuery(q: string): { kind: QueryKind; value: string } {
  const raw = q.trim();
  if (PHONE_CHARS.test(raw)) {
    const phone = normalizePhone(raw);
    if (phone) return { kind: "phone", value: phone };
  }
  if (REFERENCE.test(raw)) return { kind: "reference", value: raw.toUpperCase() };
  if (DOC_ID.test(raw)) return { kind: "id", value: raw };
  return { kind: "text", value: raw.toLowerCase() };
}

/** Pages whose label or keywords contain every word of `q`; label matches first. */
export function pageMatches(q: string, items: NavItem[]): NavItem[] {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return items;
  const hits = (text: string) => words.every((w) => text.includes(w));
  const byLabel = items.filter((n) => hits(n.label.toLowerCase()));
  const byKeyword = items.filter((n) => !byLabel.includes(n) && hits(`${n.label} ${n.keywords}`.toLowerCase()));
  return [...byLabel, ...byKeyword];
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const join = (...parts: Array<string | null>) => parts.filter(Boolean).join(" · ") || "—";

function istDate(v: unknown): string | null {
  const d = v && typeof (v as { toDate?: unknown }).toDate === "function" ? (v as { toDate: () => Date }).toDate() : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(d);
}

const toHit: Record<SearchHitKind, (id: string, d: DocumentData) => SearchHit> = {
  organizer: (id, d) => ({ kind: "organizer", id, title: str(d.name) ?? "—", subtitle: join("Organizer", str(d.handle) && `@${str(d.handle)}`, str(d.city)), href: `/partners/${id}` }),
  event: (id, d) => ({ kind: "event", id, title: str(d.title) ?? "—", subtitle: join(str(d.organizerName), istDate(d.startsAt), str(d.status)), href: `/events/${id}` }),
  experience: (id, d) => ({ kind: "experience", id, title: str(d.title) ?? "—", subtitle: join("Experience", str(d.category), str(d.status)), href: `/events?experience=${id}` }),
  booking: (id, d) => ({
    kind: "booking",
    id,
    title: str(d.reference) ?? id,
    subtitle: join(str(d.alias), typeof d.spots === "number" ? `${d.spots} ${d.spots === 1 ? "spot" : "spots"}` : null, str(d.status)),
    href: str(d.eventId) ? `/events/${str(d.eventId)}?booking=${id}` : `/events?booking=${id}`,
  }),
  customer: (id, d) => ({ kind: "customer", id, title: str(d.displayName) ?? maskPhone(str(d.phone)), subtitle: join(str(d.scope) === "platform" ? "Operator" : "Customer", maskPhone(str(d.phone))), href: `/customers/${id}` }),
};

// Firestore prefix ranges are case-sensitive: try the typed form, Sentence case and Title Case.
function prefixVariants(raw: string): string[] {
  const lower = raw.trim().toLowerCase();
  const sentence = lower.charAt(0).toUpperCase() + lower.slice(1);
  const title = lower.replace(/(^|\s)(\S)/g, (_, s: string, c: string) => s + c.toUpperCase());
  return Array.from(new Set([raw.trim(), sentence, title]));
}

/** Live entity search for the command palette. Each read is capped at 5 documents. */
export async function searchEntities(q: string, deps: SearchDeps): Promise<SearchHit[]> {
  const { kind, value } = classifyQuery(q);
  const { db } = deps;
  if (kind === "text" && value.length < 2) return [];

  const list = (kindOf: SearchHitKind, path: string, ...constraints: QueryConstraint[]) =>
    getDocs(query(collection(db, path), ...constraints, limit(5))).then((s) => s.docs.map((d) => toHit[kindOf](d.id, d.data())));
  const one = (kindOf: SearchHitKind, path: string) =>
    getDoc(doc(db, path, value)).then((d) => (d.exists() ? [toHit[kindOf](d.id, d.data())] : []));

  let reads: Array<Promise<SearchHit[]>>;
  if (kind === "phone") reads = [list("customer", "users", where("phone", "==", value))];
  else if (kind === "reference") reads = [list("booking", "bookings", where("reference", "==", value))];
  else if (kind === "id") {
    reads = [one("organizer", "organizers"), one("event", "events"), one("experience", "experiences"), one("customer", "users"), one("booking", "bookings")];
  } else {
    reads = prefixVariants(q).flatMap((p) => [
      list("organizer", "publicOrganizers", orderBy("name"), startAt(p), endAt(p + "")),
      list("event", "events", orderBy("title"), startAt(p), endAt(p + "")),
    ]);
  }

  const settled = await Promise.allSettled(reads);
  const ok = settled.filter((r): r is PromiseFulfilledResult<SearchHit[]> => r.status === "fulfilled");
  if (ok.length === 0) {
    const first = settled[0];
    throw first?.status === "rejected" && first.reason instanceof Error ? first.reason : new Error("Search is unavailable right now.");
  }
  const seen = new Set<string>();
  return ok.flatMap((r) => r.value).filter((h) => {
    const key = `${h.kind}:${h.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
