/**
 * Console identity types: roles, operators and the territory scope shown in
 * the shell. Domain entities (sessions, bookings, venues, …) live in
 * lib/prototype/entities.ts — this file intentionally holds nothing else.
 */

export type TerritoryId = string;

export type RoleId =
  | "platform-owner"
  | "super-admin"
  | "regional-partner"
  | "city-manager"
  | "ops-manager"
  | "venue-manager"
  | "coordinator"
  | "staff"
  | "support"
  | "safety"
  | "finance"
  | "marketing"
  | "analyst";

/** The territory the console is currently scoped to. `id` is "" when the workspace has no territories. */
export interface Territory {
  id: TerritoryId;
  name: string;
  code: string;
}

export interface Role {
  id: RoleId;
  name: string;
  kind: "chain" | "functional";
  scope: string;
  lane?: string;
}

export interface Operator {
  id: string;
  name: string;
  title: string;
  role: RoleId;
  territoryId: TerritoryId;
  initials: string;
}
