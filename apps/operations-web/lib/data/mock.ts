import type { Operator, Role, Territory, TerritoryId } from "@/lib/types";

/* ------------------------------------------------------------------
   REFERENCE & AUTH TABLES (not entity data)
   Entity data lives in the normalized prototype store
   (lib/prototype/seed.ts + lib/prototype/repositories.ts).
   This module only holds identity/reference tables: operators,
   roles, and the legacy territory meta resolver used by the shell.
------------------------------------------------------------------- */

export const TERRITORIES: Territory[] = [
  { id: "hvd-central", name: "Hyderabad Central", code: "HYD", time: "19:42", venues: 9, tonight: 14, fill: 82 },
  { id: "blr-south", name: "Bengaluru South", code: "BLR", time: "19:42", venues: 7, tonight: 11, fill: 74 },
  { id: "mum-west", name: "Mumbai West", code: "BOM", time: "19:42", venues: 6, tonight: 9, fill: 68 },
];

export const ROLES: Role[] = [
  { id: "platform-owner", name: "Platform Owner", kind: "chain", scope: "Platform" },
  { id: "super-admin", name: "Super Admin", kind: "chain", scope: "Platform" },
  { id: "regional-partner", name: "Regional Franchise Partner", kind: "chain", scope: "Region" },
  { id: "city-manager", name: "City Manager", kind: "chain", scope: "City" },
  { id: "ops-manager", name: "Operations Manager", kind: "chain", scope: "City" },
  { id: "venue-manager", name: "Venue Manager", kind: "chain", scope: "Venue" },
  { id: "coordinator", name: "Event Coordinator", kind: "chain", scope: "Session" },
  { id: "staff", name: "Staff", kind: "chain", scope: "Task" },
  { id: "support", name: "Customer Support", kind: "functional", scope: "City", lane: "Support" },
  { id: "safety", name: "Safety & Moderation Officer", kind: "functional", scope: "City", lane: "Safety" },
  { id: "finance", name: "Finance Manager", kind: "functional", scope: "Franchise", lane: "Finance" },
  { id: "marketing", name: "Marketing Manager", kind: "functional", scope: "City", lane: "Marketing" },
  { id: "analyst", name: "Analyst", kind: "functional", scope: "Franchise", lane: "Analytics" },
];

export const OPERATORS: Operator[] = [
  { id: "op-1", name: "Aditya Rao", title: "Platform Owner", role: "platform-owner", territoryId: "hvd-central", initials: "AR" },
  { id: "op-2", name: "Meera Krishnan", title: "Super Admin", role: "super-admin", territoryId: "hvd-central", initials: "MK" },
  { id: "op-3", name: "Dev Patel", title: "Regional Franchise Partner", role: "regional-partner", territoryId: "hvd-central", initials: "DP" },
  { id: "op-4", name: "Noor Fatima", title: "City Manager — Hyderabad Central", role: "city-manager", territoryId: "hvd-central", initials: "NF" },
  { id: "op-5", name: "Ravi Teja", title: "Operations Manager", role: "ops-manager", territoryId: "hvd-central", initials: "RT" },
  { id: "op-6", name: "Sanjay Verma", title: "Venue Manager", role: "venue-manager", territoryId: "hvd-central", initials: "SV" },
  { id: "op-7", name: "Aisha Khan", title: "Event Coordinator", role: "coordinator", territoryId: "hvd-central", initials: "AK" },
  { id: "op-8", name: "Karan Shetty", title: "Customer Support", role: "support", territoryId: "hvd-central", initials: "KS" },
  { id: "op-9", name: "Priya Menon", title: "Safety & Moderation Officer", role: "safety", territoryId: "hvd-central", initials: "PM" },
  { id: "op-10", name: "Ishaan Gupta", title: "Finance Manager", role: "finance", territoryId: "hvd-central", initials: "IG" },
  { id: "op-11", name: "Kabir Rao", title: "Floor Staff", role: "staff", territoryId: "hvd-central", initials: "KR" },
  { id: "op-12", name: "Zara Ahmed", title: "Marketing Manager", role: "marketing", territoryId: "hvd-central", initials: "ZA" },
  { id: "op-13", name: "Vikram Joshi", title: "Analyst", role: "analyst", territoryId: "hvd-central", initials: "VJ" },
];

export const territoryById = (id: TerritoryId): Territory =>
  TERRITORIES.find((t) => t.id === id) ?? TERRITORIES[0];

export const operatorName = (id: string): string =>
  OPERATORS.find((o) => o.id === id)?.name ?? id;
