import type { RoleId } from "@/lib/types";
import type {
  ActivityCategory,
  CategoryId,
  CategoryStatus,
  ExperienceTemplate,
  TemplateId,
  TemplateStatus,
  Venue,
  VenueId
} from "../entities";
import type { PrototypeState } from "../scenarios";
import { categoryById, categoryName, templateById, venueById, venueName } from "./lookups";

/* ------------------------------------------------------------------
   SA-P2C catalog selectors — derived, read-only views on the
   normalized prototype state. Pages import these through
   lib/prototype/repositories.ts.
------------------------------------------------------------------- */

export const CATEGORY_STATUS_LABELS: Record<CategoryStatus, string> = {
  draft: "Draft",
  active: "Active",
  paused: "Paused",
  archived: "Archived"
};

export const TEMPLATE_STATUS_LABELS: Record<TemplateStatus, string> = {
  draft: "Draft",
  ready: "Ready",
  active: "Active",
  paused: "Paused",
  archived: "Archived"
};

/* ------------------------- venue compatibility ------------------------- */

const CAPABILITY_FIELDS: Record<string, (v: Venue) => boolean> = {
  lighting: (v) => v.lighting,
  parking: (v) => v.parking,
  washrooms: (v) => v.washrooms,
  accessibility: (v) => v.accessibility,
  firstAid: (v) => v.firstAid,
  indoor: (v) => v.isIndoor,
  outdoor: (v) => !v.isIndoor
};

export function categoryVenueCompatReasons(cat: ActivityCategory, v: Venue): string[] {
  const reasons: string[] = [];
  if (v.supportedActivities.length && !v.supportedActivities.includes(cat.id))
    reasons.push("Venue does not support this category");
  const vc = cat.venueCompat;
  if (vc) {
    if (vc.indoorOutdoor === "indoor" && !v.isIndoor) reasons.push("Category needs an indoor venue");
    if (vc.indoorOutdoor === "outdoor" && v.isIndoor) reasons.push("Category needs an outdoor venue");
    if (vc.lightingRequired && !v.lighting) reasons.push("Lighting required");
    if (vc.washroomRequired && !v.washrooms) reasons.push("Washrooms required");
    if (vc.accessibilityRequired && !v.accessibility) reasons.push("Accessibility required");
    if (vc.minAreaCapacity && v.safetyCapacity < vc.minAreaCapacity)
      reasons.push(`Safety capacity ${v.safetyCapacity} below required ${vc.minAreaCapacity}`);
    for (const cap of vc.requiredCapabilities ?? []) {
      const check = CAPABILITY_FIELDS[cap];
      if (check && !check(v)) reasons.push(`Capability missing: ${cap}`);
    }
    for (const eq of vc.requiredEquipment ?? []) {
      if (!v.equipmentAvailable.includes(eq)) reasons.push(`Equipment missing: ${eq}`);
    }
  }
  return reasons;
}

export function templateVenueCompatReasons(state: PrototypeState, t: ExperienceTemplate, v: Venue): string[] {
  const cat = categoryById(state, t.categoryId);
  const reasons = cat ? categoryVenueCompatReasons(cat, v) : [];
  const vc = t.venueCompat;
  if (vc) {
    if ((vc.indoorOutdoorNeed === "indoor" && !v.isIndoor) || (vc.indoorOutdoorNeed === "outdoor" && v.isIndoor))
      reasons.push(`Template needs a ${vc.indoorOutdoorNeed} venue`);
    if (vc.requiredVenueVerification === "verified" && v.verificationStatus !== "verified") reasons.push("Venue must be verified");
    if (vc.lighting && !v.lighting) reasons.push("Lighting required");
    if (vc.accessibility && !v.accessibility) reasons.push("Accessibility required");
    if (vc.minAreaCapacity && v.safetyCapacity < vc.minAreaCapacity)
      reasons.push(`Safety capacity ${v.safetyCapacity} below required ${vc.minAreaCapacity}`);
    if (vc.spectatorNeeds && v.spectatorAllowance < vc.spectatorNeeds)
      reasons.push(`Spectator allowance ${v.spectatorAllowance} below required ${vc.spectatorNeeds}`);
    for (const eq of vc.requiredEquipment ?? []) {
      if (!v.equipmentAvailable.includes(eq)) reasons.push(`Equipment missing: ${eq}`);
    }
  }
  return reasons;
}

export interface VenueCompatResult {
  venueId: VenueId;
  venueName: string;
  territoryId: string;
  cityId: string;
  compatible: boolean;
  reasons: string[];
}

export function categoryCompatibleVenues(state: PrototypeState, categoryId: CategoryId): VenueCompatResult[] {
  const cat = categoryById(state, categoryId);
  if (!cat) return [];
  return state.venues.map((v) => ({
    venueId: v.id,
    venueName: v.name,
    territoryId: v.territoryId,
    cityId: v.cityId,
    compatible: categoryVenueCompatReasons(cat, v).length === 0,
    reasons: categoryVenueCompatReasons(cat, v)
  }));
}

export function templateCompatibleVenues(state: PrototypeState, templateId: TemplateId): VenueCompatResult[] {
  const t = templateById(state, templateId);
  if (!t) return [];
  return state.venues.map((v) => {
    const reasons = templateVenueCompatReasons(state, t, v);
    return {
      venueId: v.id,
      venueName: v.name,
      territoryId: v.territoryId,
      cityId: v.cityId,
      compatible: reasons.length === 0,
      reasons
    };
  });
}

export const compatibleVenues = (state: PrototypeState, templateId: TemplateId): VenueCompatResult[] =>
  templateCompatibleVenues(state, templateId).filter((r) => r.compatible);

export const compatibleVenuesForCategory = (state: PrototypeState, categoryId: CategoryId): VenueCompatResult[] =>
  categoryCompatibleVenues(state, categoryId).filter((r) => r.compatible);

/* ------------------------------ readiness ------------------------------ */

export interface TemplateIssue {
  level: "error" | "warn";
  field: string;
  message: string;
}

export function templateReadiness(state: PrototypeState, t: ExperienceTemplate): { issues: TemplateIssue[]; ready: boolean; schedulable: boolean } {
  const issues: TemplateIssue[] = [];
  const cat = categoryById(state, t.categoryId);

  const push = (level: TemplateIssue["level"], field: string, message: string) => issues.push({ level, field, message });

  if (!t.name?.trim()) push("error", "name", "Template name is required");
  else if (state.templates.some((x) => x.id !== t.id && x.name.toLowerCase() === t.name.toLowerCase()))
    push("error", "name", "Duplicate template name");

  if (!cat) push("error", "category", "Category is missing");
  else if (cat.status === "paused") push("error", "category", "Category is paused — activation blocked");
  else if (cat.status === "archived") push("error", "category", "Category is archived — activation blocked");

  if (t.ageMin >= t.ageMax) push("error", "age", "Age range invalid (min must be below max)");
  if (t.ageMin < 0) push("error", "age", "Age min cannot be negative");

  if (t.minParticipants > t.maxParticipants) push("error", "capacity", "Capacity equation invalid: min exceeds max");
  if (t.targetParticipants < t.minParticipants || t.targetParticipants > t.maxParticipants)
    push("error", "capacity", "Target participants outside [min, max] range");
  if (t.maxParticipants <= 0) push("error", "capacity", "Max participants must be positive");
  if (t.teamSize <= 0 || t.teamSize > t.maxParticipants) push("error", "team", "Team size must be between 1 and max participants");
  if (t.numTeams < 1) push("error", "team", "At least one team required");

  if (t.duration <= 0) push("error", "timing", "Duration must be positive");
  if (t.bookingOpenDays <= 0) push("error", "timing", "Booking window must be at least 1 day");
  if (t.bookingCloseHours <= 0) push("error", "timing", "Booking close must be before start");
  if (t.revealHoursBefore > t.bookingCloseHours)
    push("warn", "timing", "Reveal happens before booking closes — participants would see details before committing");
  if (t.revealHoursBefore <= 0) push("error", "timing", "Reveal time must be set");

  if (t.basePrice <= 0) push("error", "pricing", "Base price must be positive");
  if (t.venueCost < 0 || t.equipmentCost < 0) push("error", "pricing", "Costs cannot be negative");
  if (t.basePrice * t.minParticipants < t.venueCost + t.equipmentCost + (t.staffingCost ?? 0))
    push("error", "pricing", "Break-even infeasible at minimum capacity");

  if (!t.requiredRoles.length) push("error", "staffing", "No staffing roles defined");
  if (t.coordinatorsCount < 1) push("error", "staffing", "At least one coordinator required");

  if (templateById(state, t.id) && compatibleVenues(state, t.id).length === 0)
    push("error", "venue", "No compatible venues found for this template");

  if (!t.safetyLevel) push("warn", "safety", "Safety level not rated");
  if (t.weatherDependency) push("warn", "safety", "Weather dependency set — confirm weather risk plan");

  if (t.legalReviewStatus === "pending") push("warn", "policy", "Legal review pending (prototype placeholder)");
  if (!t.dataRetentionPlaceholder) push("warn", "policy", "Data retention placeholder not set");
  if (!t.prizeVerificationRequired && t.isTournament) push("warn", "policy", "Tournament without prize verification");

  if (t.anonymousJoinedCount && t.showJoinedCountBeforeReveal)
    push("warn", "privacy", "Anonymous joined count cannot show before reveal");

  if (t.status === "active") {
    const criticals = issues.filter((i) => i.level === "error");
    if (criticals.length) push("warn", "status", "Active template has unresolved critical issues");
  }

  const ready = !issues.some((i) => i.level === "error");
  return { issues, ready, schedulable: t.status === "active" && ready };
}

export const templateIsSchedulable = (state: PrototypeState, t: ExperienceTemplate): boolean => templateReadiness(state, t).schedulable;

export function unschedulableTemplates(state: PrototypeState): { template: ExperienceTemplate; reason: string }[] {
  return state.templates
    .filter((t) => t.status === "draft" || t.status === "ready" || t.status === "paused")
    .map((t) => ({
      template: t,
      reason:
        t.status === "paused"
          ? "Paused by operator"
          : t.status === "ready"
            ? "Ready but not activated"
            : templateReadiness(state, t).issues.filter((i) => i.level === "error").length
              ? "Draft with unresolved issues"
              : "Draft — not activated"
    }));
}

export const neverScheduledTemplates = (state: PrototypeState): ExperienceTemplate[] =>
  state.templates.filter((t) => !state.sessions.some((s) => s.templateId === t.id));

/* ------------------------------ economics ------------------------------ */

export interface TemplateEconomics {
  basePrice: number;
  taxAmount: number;
  platformFee: number;
  venueCost: number;
  equipmentCost: number;
  staffingCost: number;
  fixedCosts: number;
  revenueAtTarget: number;
  revenueAtMin: number;
  breakEvenParticipants: number;
  netAtTarget: number;
  netAtMin: number;
  marginPct: number;
}

export function templateEconomics(state: PrototypeState, templateId: TemplateId): TemplateEconomics {
  const t = templateById(state, templateId);
  const basePrice = t?.basePrice ?? 0;
  const venueCost = t?.venueCost ?? 0;
  const equipmentCost = t?.equipmentCost ?? 0;
  const staffingCost = t?.staffingCost ?? 0;
  const fixedCosts = venueCost + equipmentCost + staffingCost;
  const target = t?.targetParticipants ?? 0;
  const min = t?.minParticipants ?? 0;
  const revenueAtTarget = basePrice * target;
  const revenueAtMin = basePrice * min;
  const marginPct = revenueAtTarget > 0 ? Math.round(((revenueAtTarget - fixedCosts) / revenueAtTarget) * 100) : 0;
  return {
    basePrice,
    taxAmount: t?.taxAmount ?? 0,
    platformFee: t?.platformFee ?? 0,
    venueCost,
    equipmentCost,
    staffingCost,
    fixedCosts,
    revenueAtTarget,
    revenueAtMin,
    breakEvenParticipants: basePrice > 0 ? Math.ceil(fixedCosts / basePrice) : 0,
    netAtTarget: revenueAtTarget - fixedCosts,
    netAtMin: revenueAtMin - fixedCosts,
    marginPct
  };
}

/* ------------------------------ category views ------------------------------ */

export interface CategoryView {
  id: CategoryId;
  name: string;
  shortCode: string;
  status: CategoryStatus;
  icon: string;
  riskLevel: string;
  templates: number;
  activeTemplates: number;
  draftTemplates: number;
  readyTemplates: number;
  pausedTemplates: number;
  compatibleVenues: number;
  totalVenues: number;
  territories: number;
  scheduledSessions: number;
  updatedAt: string;
}

export function categoryViews(state: PrototypeState): CategoryView[] {
  return state.categories.map((c) => {
    const catTemplates = state.templates.filter((t) => t.categoryId === c.id);
    const compat = categoryCompatibleVenues(state, c.id);
    const territories = new Set(compat.filter((r) => r.compatible).map((r) => r.territoryId)).size;
    const sessionCount = state.sessions.filter((s) => s.categoryId === c.id).length;
    return {
      id: c.id,
      name: c.name,
      shortCode: c.shortCode ?? c.id.replace(/^cat-/, "").toUpperCase(),
      status: c.status ?? "active",
      icon: c.icon,
      riskLevel: c.riskLevel,
      templates: catTemplates.length,
      activeTemplates: catTemplates.filter((t) => t.status === "active").length,
      draftTemplates: catTemplates.filter((t) => t.status === "draft").length,
      readyTemplates: catTemplates.filter((t) => t.status === "ready").length,
      pausedTemplates: catTemplates.filter((t) => t.status === "paused").length,
      compatibleVenues: compat.filter((r) => r.compatible).length,
      totalVenues: compat.length,
      territories,
      scheduledSessions: sessionCount,
      updatedAt: c.updatedAt ?? "—"
    };
  });
}

export function categoryByIdView(state: PrototypeState, id: CategoryId): CategoryView | undefined {
  return categoryViews(state).find((c) => c.id === id);
}

export function categoryStatusCounts(state: PrototypeState): Record<CategoryStatus, number> & { total: number } {
  const counts = { draft: 0, active: 0, paused: 0, archived: 0 } as Record<CategoryStatus, number>;
  for (const c of state.categories) counts[c.status ?? "active"] += 1;
  return { ...counts, total: state.categories.length };
}

/* ------------------------------ template views ------------------------------ */

export interface TemplateView {
  id: TemplateId;
  name: string;
  categoryId: CategoryId;
  categoryName: string;
  status: TemplateStatus;
  format: string;
  entryType: string;
  basePrice: number;
  minParticipants: number;
  targetParticipants: number;
  maxParticipants: number;
  scheduledCount: number;
  scheduledTerritories: number;
  compatibleVenues: number;
  totalVenues: number;
  marginPct: number;
  schedulable: boolean;
  issues: number;
  updatedAt: string;
}

export function templateViews(state: PrototypeState): TemplateView[] {
  return state.templates.map((t) => {
    const sessions = state.sessions.filter((s) => s.templateId === t.id);
    const compat = templateCompatibleVenues(state, t.id);
    const eco = templateEconomics(state, t.id);
    const read = templateReadiness(state, t);
    return {
      id: t.id,
      name: t.name,
      categoryId: t.categoryId,
      categoryName: categoryName(state, t.categoryId),
      status: t.status,
      format: t.format,
      entryType: t.entryType ?? "individual",
      basePrice: t.basePrice,
      minParticipants: t.minParticipants,
      targetParticipants: t.targetParticipants,
      maxParticipants: t.maxParticipants,
      scheduledCount: sessions.length,
      scheduledTerritories: new Set(sessions.map((s) => s.territoryId)).size,
      compatibleVenues: compat.filter((r) => r.compatible).length,
      totalVenues: compat.length,
      marginPct: eco.marginPct,
      schedulable: read.schedulable,
      issues: read.issues.length,
      updatedAt: t.updatedAt ?? "—"
    };
  });
}

export function templateByIdView(state: PrototypeState, id: TemplateId): TemplateView | undefined {
  return templateViews(state).find((t) => t.id === id);
}

export function templateStatusCounts(state: PrototypeState): Record<TemplateStatus, number> & { total: number } {
  const counts = { draft: 0, ready: 0, active: 0, paused: 0, archived: 0 } as Record<TemplateStatus, number>;
  for (const t of state.templates) counts[t.status] += 1;
  return { ...counts, total: state.templates.length };
}

/** Role-aware template visibility: venue/city scoped roles only see compatible templates in their territory. */
export function visibleTemplates(state: PrototypeState, roleId: RoleId, territoryId?: string): ExperienceTemplate[] {
  const scoped = roleId === "venue-manager" || roleId === "city-manager" || roleId === "regional-partner";
  if (!scoped) return state.templates;
  return state.templates.filter((t) => {
    const compat = templateCompatibleVenues(state, t.id);
    return compat.some((r) => r.compatible && (!territoryId || r.territoryId === territoryId));
  });
}

/* ------------------------------ catalog warnings ------------------------------ */

export interface CatalogWarning {
  level: "error" | "warn";
  scope: "category" | "template";
  entityId: string;
  name: string;
  message: string;
}

export function catalogWarnings(state: PrototypeState): CatalogWarning[] {
  const warnings: CatalogWarning[] = [];
  for (const c of state.categories) {
    const templates = state.templates.filter((t) => t.categoryId === c.id);
    if (templates.length === 0) warnings.push({ level: "warn", scope: "category", entityId: c.id, name: c.name, message: "No templates defined" });
    if (categoryCompatibleVenues(state, c.id).filter((r) => r.compatible).length === 0)
      warnings.push({ level: "error", scope: "category", entityId: c.id, name: c.name, message: "No compatible venues" });
    if (c.status === "paused" && templates.some((t) => t.status === "active"))
      warnings.push({ level: "error", scope: "category", entityId: c.id, name: c.name, message: "Paused category has active templates" });
  }
  for (const t of state.templates) {
    const read = templateReadiness(state, t);
    if (t.status === "active" && !read.schedulable)
      warnings.push({ level: "error", scope: "template", entityId: t.id, name: t.name, message: "Active but not schedulable" });
    if (t.status === "active" && !state.sessions.some((s) => s.templateId === t.id))
      warnings.push({ level: "warn", scope: "template", entityId: t.id, name: t.name, message: "Activated but never scheduled" });
    if (t.status === "draft" && !read.ready && read.issues.filter((i) => i.level === "error").length > 3)
      warnings.push({ level: "warn", scope: "template", entityId: t.id, name: t.name, message: "Draft has multiple unresolved errors" });
  }
  return warnings;
}

/* ------------------------------ customer preview ------------------------------ */

export interface CustomerPreview {
  name: string;
  shortDesc: string;
  fullDesc: string;
  promise: string;
  format: string;
  entryType: string;
  competitiveLevel: string;
  basePrice: number;
  promoEligible: boolean;
  minParticipants: number;
  maxParticipants: number;
  duration: number;
  tempIdFormat: string;
  aliasStyle: string;
  anonymousJoinedCount: boolean;
  showJoinedCountBeforeReveal: boolean;
  preRevealPreview: string;
  postRevealPreview: string;
  infoRevealed: string[];
  infoNeverRevealed: string[];
  privacyLockedUntil: string;
}

export function customerPreview(state: PrototypeState, templateId: TemplateId): CustomerPreview {
  const t = templateById(state, templateId);
  if (!t)
    return {
      name: "Unknown", shortDesc: "", fullDesc: "", promise: "", format: "mixed", entryType: "individual",
      competitiveLevel: "—", basePrice: 0, promoEligible: false, minParticipants: 0, maxParticipants: 0,
      duration: 0, tempIdFormat: "", aliasStyle: "", anonymousJoinedCount: false, showJoinedCountBeforeReveal: false,
      preRevealPreview: "", postRevealPreview: "", infoRevealed: [], infoNeverRevealed: [], privacyLockedUntil: "—"
    };
  return {
    name: t.name,
    shortDesc: t.shortDesc,
    fullDesc: t.fullDesc,
    promise: t.promise,
    format: t.format,
    entryType: t.entryType ?? "individual",
    competitiveLevel: t.competitiveLevel ?? "—",
    basePrice: t.basePrice,
    promoEligible: t.promoEligible,
    minParticipants: t.minParticipants,
    maxParticipants: t.maxParticipants,
    duration: t.duration,
    tempIdFormat: t.tempIdFormat,
    aliasStyle: t.aliasStyle,
    anonymousJoinedCount: t.anonymousJoinedCount,
    showJoinedCountBeforeReveal: t.showJoinedCountBeforeReveal ?? false,
    preRevealPreview: t.preRevealPreview ?? "Joined count hidden until reveal",
    postRevealPreview: t.postRevealPreview ?? "Full details visible after reveal",
    infoRevealed: t.infoRevealed,
    infoNeverRevealed: t.infoNeverRevealed,
    privacyLockedUntil: `Reveal ${t.revealHoursBefore}h before start`
  };
}

/* ------------------------------ versions ------------------------------ */

export function templateVersions(state: PrototypeState, templateId: TemplateId) {
  return state.templateVersions.filter((v) => v.templateId === templateId).sort((a, b) => b.version - a.version);
}

export function operatorName(state: PrototypeState, operatorId: string): string {
  void state;
  const known: Record<string, string> = {
    "op-1": "Aditya Rao", "op-2": "Meera Krishnan", "op-3": "Dev Patel", "op-4": "Noor Fatima",
    "op-5": "Ravi Teja", "op-6": "Sanjay Verma", "op-7": "Aisha Khan", "op-9": "Priya Menon",
    "op-10": "Ishaan Gupta", "op-12": "Zara Ahmed", "op-13": "Vikram Joshi"
  };
  return known[operatorId] ?? operatorId;
}

export { categoryName, venueName, templateById, categoryById };

/* ------------------------------ SA-P2I Catalog Usability Selectors ------------------------------ */

export interface CatalogReadinessItem {
  id: string;
  label: string;
  category: "basics" | "group" | "time" | "price" | "staff" | "location" | "reveal" | "results" | "safety";
  status: "complete" | "needs-attention" | "blocked";
  missingText?: string;
  actionLabel?: string;
  actionHref?: string;
}

export function selectExperienceReadiness(t: ExperienceTemplate, state: PrototypeState) {
  const items: CatalogReadinessItem[] = [];
  const cat = categoryById(state, t.categoryId);

  // 1. Basics & Category
  if (!cat) {
    items.push({
      id: "category",
      label: "Active Category Selected",
      category: "basics",
      status: "blocked",
      missingText: "No active activity category selected for this experience.",
      actionLabel: "Choose Category",
      actionHref: `/catalog/experiences/${t.id}/edit`
    });
  } else {
    items.push({
      id: "category",
      label: `Category: ${cat.name}`,
      category: "basics",
      status: "complete"
    });
  }

  if (!t.name?.trim()) {
    items.push({
      id: "name",
      label: "Experience Name",
      category: "basics",
      status: "blocked",
      missingText: "Experience name is missing.",
      actionLabel: "Set Name",
      actionHref: `/catalog/experiences/${t.id}/edit`
    });
  } else {
    items.push({
      id: "name",
      label: "Experience Name Configured",
      category: "basics",
      status: "complete"
    });
  }

  // 2. Group Size
  if (t.minParticipants <= 0 || t.maxParticipants <= 0 || t.minParticipants > t.maxParticipants) {
    items.push({
      id: "group-size",
      label: "Group Size Bounds",
      category: "group",
      status: "blocked",
      missingText: "Capacity limits invalid (min must be positive and <= max).",
      actionLabel: "Fix Capacity",
      actionHref: `/catalog/experiences/${t.id}/edit`
    });
  } else if (t.targetParticipants < t.minParticipants || t.targetParticipants > t.maxParticipants) {
    items.push({
      id: "group-size",
      label: "Target Group Size",
      category: "group",
      status: "needs-attention",
      missingText: `Target participants (${t.targetParticipants}) outside min-max range [${t.minParticipants}, ${t.maxParticipants}].`,
      actionLabel: "Adjust Target",
      actionHref: `/catalog/experiences/${t.id}/edit`
    });
  } else {
    items.push({
      id: "group-size",
      label: `Group Size: ${t.minParticipants}-${t.maxParticipants} participants`,
      category: "group",
      status: "complete"
    });
  }

  // 3. Time & Duration
  if (t.duration <= 0) {
    items.push({
      id: "duration",
      label: "Default Duration",
      category: "time",
      status: "blocked",
      missingText: "Session duration must be specified.",
      actionLabel: "Set Duration",
      actionHref: `/catalog/experiences/${t.id}/edit`
    });
  } else {
    items.push({
      id: "duration",
      label: `Duration: ${t.duration} minutes`,
      category: "time",
      status: "complete"
    });
  }

  // 4. Default Price
  if (t.basePrice < 0) {
    items.push({
      id: "price",
      label: "Default Price",
      category: "price",
      status: "blocked",
      missingText: "Default price cannot be negative.",
      actionLabel: "Set Price",
      actionHref: `/catalog/experiences/${t.id}/edit`
    });
  } else {
    items.push({
      id: "price",
      label: `Default Price: ₹${t.basePrice}`,
      category: "price",
      status: "complete"
    });
  }

  // 5. Staff Requirements
  if (!t.requiredRoles || t.requiredRoles.length === 0) {
    items.push({
      id: "staff",
      label: "Staff Roles Defined",
      category: "staff",
      status: "needs-attention",
      missingText: "No specific staff roles defined for event execution.",
      actionLabel: "Assign Roles",
      actionHref: `/catalog/experiences/${t.id}/edit`
    });
  } else {
    items.push({
      id: "staff",
      label: `Staff Roles: ${t.requiredRoles.join(", ")}`,
      category: "staff",
      status: "complete"
    });
  }

  // 6. Venue Compatibility
  const compatVenues = compatibleVenues(state, t.id);
  if (compatVenues.length === 0) {
    items.push({
      id: "location",
      label: "Where It Can Run",
      category: "location",
      status: "needs-attention",
      missingText: "No current playing area or venue matches this Experience requirements.",
      actionLabel: "Review Playing Areas",
      actionHref: "/locations/playing-areas"
    });
  } else {
    items.push({
      id: "location",
      label: `Compatible Locations: ${compatVenues.length} venue(s)`,
      category: "location",
      status: "complete"
    });
  }

  // 7. Results & Format
  const isSport = cat ? (cat.visualTreatment === "sport" || cat.riskLevel === "high" || t.isTournament) : true;
  items.push({
    id: "results",
    label: `Result Type: ${isSport ? "Score & Team Outcome" : "Participant Completion"}`,
    category: "results",
    status: "complete"
  });

  const hasBlocked = items.some((i) => i.status === "blocked");
  const hasWarn = items.some((i) => i.status === "needs-attention");

  let status: "complete" | "needs-attention" | "blocked" = "complete";
  if (hasBlocked) status = "blocked";
  else if (hasWarn || t.status === "draft") status = "needs-attention";

  let nextActionLabel = "Schedule Event";
  let nextActionHref = `/missions/new?experienceId=${t.id}`;

  if (hasBlocked) {
    nextActionLabel = "Fix Readiness Blocker";
    nextActionHref = `/catalog/experiences/${t.id}`;
  } else if (t.status === "draft") {
    nextActionLabel = "Publish Experience";
    nextActionHref = `/catalog/experiences/${t.id}`;
  }

  return {
    status,
    items,
    blockedCount: items.filter((i) => i.status === "blocked").length,
    needsAttentionCount: items.filter((i) => i.status === "needs-attention").length,
    completeCount: items.filter((i) => i.status === "complete").length,
    isSport,
    nextActionLabel,
    nextActionHref,
    schedulable: !hasBlocked && t.status === "active"
  };
}

export function selectCatalogHealth(state: PrototypeState) {
  const categories = state.categories ?? [];
  const templates = state.templates ?? [];
  const sessions = state.sessions ?? [];

  const draftExperiences = templates.filter((t) => t.status === "draft");
  const activeExperiences = templates.filter((t) => t.status === "active");
  
  const readinessList = templates.map((t) => ({
    template: t,
    readiness: selectExperienceReadiness(t, state)
  }));

  const readyToSchedule = readinessList.filter((r) => r.readiness.schedulable || (r.template.status === "active" && r.readiness.status !== "blocked"));
  const blockedExperiences = readinessList.filter((r) => r.readiness.status === "blocked");

  const now = new Date();
  const scheduledThisWeek = sessions.filter((s) => s.status !== "cancelled").length;

  let overallHealth: "complete" | "needs-attention" | "incomplete" = "complete";
  if (categories.length === 0 || templates.length === 0) {
    overallHealth = "incomplete";
  } else if (blockedExperiences.length > 0 || draftExperiences.length > 0) {
    overallHealth = "needs-attention";
  }

  return {
    status: overallHealth,
    categoryCount: categories.length,
    experienceCount: templates.length,
    draftCount: draftExperiences.length,
    activeCount: activeExperiences.length,
    readyToScheduleCount: readyToSchedule.length,
    blockedCount: blockedExperiences.length,
    scheduledThisWeekCount: scheduledThisWeek,
  };
}

export function selectCategoryHealth(cat: ActivityCategory, state: PrototypeState) {
  const catTemplates = state.templates.filter((t) => t.categoryId === cat.id);
  const activeCount = catTemplates.filter((t) => t.status === "active").length;
  const draftCount = catTemplates.filter((t) => t.status === "draft").length;

  let status: "complete" | "needs-attention" | "incomplete" = "complete";
  if (catTemplates.length === 0) {
    status = "incomplete";
  } else if (activeCount === 0) {
    status = "needs-attention";
  }

  return {
    status,
    totalExperiences: catTemplates.length,
    activeExperiences: activeCount,
    draftExperiences: draftCount,
  };
}

