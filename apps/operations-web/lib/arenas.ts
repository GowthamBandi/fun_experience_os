/**
 * Pure helpers for the Arenas page (no Firebase imports).
 *
 * Backend facts (firebase/functions/src): the only arena fields any code reads
 * are `status`, `capacity` (a number) and `version` (catalog/events.ts assertArena,
 * governance/service.ts changeMarketplaceEntityStatus, which also writes
 * `statusReason`). No callable creates arenas and the Firestore rules deny client
 * writes, so every other display field is read defensively (the flat ADR-0003 docs carry `location`, `displayValue` and `summary`) and shows "—" when absent.
 *
 * assertArena only accepts an arena whose status is "approved" or "active" when an
 * event is saved. Setting "paused" or "blocked" therefore stops organizers picking
 * the arena for new or edited events (the intent) and does not touch existing events;
 * "active" restores it. "under-review" and "resolved" are never offered.
 */

import type { BadgeTone } from "@/components/pulse/Badge";
import { CONFIRM_PHRASES } from "./console/actions";
import { toDate } from "./console/records";
import { entityVersion, orgStatusBadge, type StatusAction } from "./organizers";

type Raw = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : []);
const first = (d: Raw, ...keys: string[]): string | null => {
  for (const k of keys) {
    const v = str(d[k]);
    if (v) return v;
  }
  return null;
};

export type ArenaFilter = "all" | "active" | "approved" | "review" | "paused" | "blocked";

export const ARENA_FILTERS: Array<{ id: ArenaFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "approved", label: "Approved" },
  { id: "review", label: "Under review" },
  { id: "paused", label: "Paused" },
  { id: "blocked", label: "Blocked" },
];

export interface ArenaCard {
  id: string;
  name: string;
  city: string | null;
  address: string | null;
  /** null when the doc has no numeric capacity. */
  capacity: number | null;
  /** The flat display text (ADR-0003 `displayValue`, e.g. "8,000 capacity"); never parsed into a number. */
  capacityText: string | null;
  summary: string | null;
  status: string | null;
  statusReason: string | null;
  version: number;
  ownerId: string | null;
  sports: string[];
  updatedAt: Date | null;
}

export function toArena(id: string, d: Raw): ArenaCard {
  const sports = strings(d.sports).length ? strings(d.sports) : strings(d.categories);
  return {
    id,
    name: first(d, "name", "title") ?? "—",
    city: first(d, "city", "location"),
    address: first(d, "address", "location"),
    capacity: num(d.capacity),
    capacityText: str(d.displayValue),
    summary: str(d.summary),
    status: str(d.status),
    statusReason: str(d.statusReason),
    version: entityVersion(d.version),
    ownerId: first(d, "orgId", "ownerId", "organizerId"),
    sports,
    updatedAt: toDate(d.updatedAt),
  };
}

export function arenaStatusBadge(status: unknown): { label: string; tone: BadgeTone } {
  if (str(status) === "approved") return { label: "Approved", tone: "violet" };
  return orgStatusBadge(status);
}

const bucket = (s: string | null): Exclude<ArenaFilter, "all"> | null =>
  s === "active" || s === "approved" || s === "paused" || s === "blocked" ? s : s === "under-review" ? "review" : null;

export function arenaCounts(cards: ArenaCard[]): Record<ArenaFilter, number> {
  const counts: Record<ArenaFilter, number> = { all: cards.length, active: 0, approved: 0, review: 0, paused: 0, blocked: 0 };
  for (const c of cards) {
    const b = bucket(c.status);
    if (b) counts[b]++;
  }
  return counts;
}

export function filterArenas(cards: ArenaCard[], filter: ArenaFilter, search: string): ArenaCard[] {
  const q = search.trim().toLowerCase();
  return cards.filter((c) => {
    if (filter !== "all" && bucket(c.status) !== filter) return false;
    if (!q) return true;
    return [c.name, c.city, c.address, c.summary, c.id, ...c.sports].some((v) => v && v.toLowerCase().includes(q));
  });
}

/** Usable arenas first (active, approved), then review, paused, blocked; alphabetical inside each group. */
export function sortArenas(cards: ArenaCard[]): ArenaCard[] {
  const rank = (s: string | null) => ({ active: 0, approved: 1, "under-review": 2, paused: 3, blocked: 4 })[s ?? ""] ?? 5;
  return [...cards].sort((a, b) => rank(a.status) - rank(b.status) || a.name.localeCompare(b.name, "en-IN"));
}

const PAUSE: StatusAction = {
  status: "paused",
  label: "Pause",
  phrase: null,
  consequence: "Organizers can't pick this arena for new or edited events until it is reactivated. Events already scheduled here are not changed.",
  tone: "danger",
};
const BLOCK: StatusAction = {
  status: "blocked",
  label: "Block",
  phrase: CONFIRM_PHRASES.blockEntity,
  consequence: "Blocks this arena in the marketplace: organizers can't pick it for new or edited events and it is hidden from the public. Events already scheduled here are not changed.",
  tone: "danger",
};
const activate = (label: string, extra = ""): StatusAction => ({
  status: "active",
  label,
  phrase: null,
  consequence: `Sets the arena to active so organizers can pick it for events again.${extra}`,
  tone: "volt",
});

/** The status changes offered from the current status (the server accepts any; no-ops are hidden). */
export function arenaStatusActions(status: unknown): StatusAction[] {
  switch (status) {
    case "active": return [PAUSE, BLOCK];
    case "approved": return [PAUSE, BLOCK];
    case "paused": return [activate("Reactivate"), BLOCK];
    case "blocked": return [activate("Reactivate")];
    case "under-review": return [activate("Approve", " This activates the arena; the verification case in Approvals stays open — decide it there."), BLOCK];
    default: return [activate("Activate"), PAUSE, BLOCK];
  }
}
