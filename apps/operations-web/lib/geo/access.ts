import type { RoleId } from "@/lib/types";

/**
 * Role simulation matrix (Part 15) — every geo action is gated through this
 * single table so the demo behaves consistently across all 14 pages.
 * Frontend prototype only; never a production authorization layer.
 */
export type GeoAction =
  | "create-franchise"
  | "manage-franchise"
  | "create-territory"
  | "manage-territory"
  | "create-city"
  | "manage-city"
  | "create-venue"
  | "manage-venue"
  | "create-playing-area"
  | "manage-playing-area"
  | "manage-catalog"
  | "activate-template"
  | "change-template-status"
  | "change-category-status"
  | "catalog-pricing"
  | "catalog-safety"
  | "catalog-preview"
  | "catalog-versions"
  | "see-commercial"
  | "see-safety"
  | "see-contacts"
  | "annotate"
  | "reset-demo";

const ALLOW: Record<GeoAction, RoleId[]> = {
  // Franchise — only platform owners and super admins shape the platform
  "create-franchise": ["platform-owner", "super-admin"],
  "manage-franchise": ["platform-owner", "super-admin"],
  // Territory — regional partners shape the regions they are assigned to
  "create-territory": ["platform-owner", "super-admin", "regional-partner"],
  "manage-territory": ["platform-owner", "super-admin", "regional-partner"],
  // City — city managers run the cities they are assigned to
  "create-city": ["platform-owner", "super-admin", "regional-partner", "city-manager"],
  "manage-city": ["platform-owner", "super-admin", "regional-partner", "city-manager"],
  // Venue — city managers and ops managers run venues day to day
  "create-venue": ["platform-owner", "super-admin", "regional-partner", "city-manager"],
  "manage-venue": ["platform-owner", "super-admin", "regional-partner", "city-manager", "ops-manager"],
  // Playing area — venue managers own the floors of their venue
  "create-playing-area": ["platform-owner", "super-admin", "regional-partner", "city-manager", "ops-manager", "venue-manager"],
  "manage-playing-area": ["platform-owner", "super-admin", "regional-partner", "city-manager", "ops-manager", "venue-manager"],
  // Catalog (Part 14) — platform shapes the catalog; regions only view their compatibility
  "manage-catalog": ["platform-owner", "super-admin"],
  "activate-template": ["platform-owner", "super-admin"],
  "change-template-status": ["platform-owner", "super-admin"],
  "change-category-status": ["platform-owner", "super-admin"],
  "catalog-pricing": ["platform-owner", "super-admin", "regional-partner", "city-manager", "ops-manager", "venue-manager", "finance", "analyst"],
  "catalog-safety": ["platform-owner", "super-admin", "regional-partner", "city-manager", "ops-manager", "venue-manager", "safety", "analyst"],
  "catalog-preview": ["platform-owner", "super-admin", "regional-partner", "city-manager", "ops-manager", "venue-manager", "marketing", "analyst"],
  "catalog-versions": ["platform-owner", "super-admin", "regional-partner", "ops-manager", "analyst"],
  // Visibility lanes — finance sees money, safety sees safety, nobody sees everything
  "see-commercial": ["platform-owner", "super-admin", "regional-partner", "city-manager", "ops-manager", "venue-manager", "finance", "analyst"],
  "see-safety": ["platform-owner", "super-admin", "regional-partner", "city-manager", "ops-manager", "venue-manager", "coordinator", "staff", "safety", "analyst"],
  "see-contacts": ["platform-owner", "super-admin", "regional-partner", "city-manager", "ops-manager", "venue-manager", "coordinator", "staff", "safety", "finance", "analyst"],
  annotate: ["platform-owner", "super-admin", "regional-partner", "city-manager", "ops-manager", "venue-manager", "safety"],
  "reset-demo": ["platform-owner", "super-admin"],
};

export const geoCan = (roleId: RoleId, action: GeoAction): boolean => ALLOW[action].includes(roleId);
