import type { PrototypeState } from "../scenarios";
import { SEAT_STATUSES, type SeatStatus } from "../selectors";
import type { CategoryInput, TemplateInput } from "../services/create";

export interface ValidationIssue {
  severity: "error" | "warning" | "info";
  code: string;
  entity: string;
  id?: string;
  message: string;
}

const issue = (
  severity: ValidationIssue["severity"],
  code: string,
  entity: string,
  message: string,
  id?: string
): ValidationIssue => ({ severity, code, entity, message, id });

/** Consistency checks over the normalized central state. Read-only. */
export function validatePrototypeState(state: PrototypeState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const idSets: Array<{ name: string; ids: string[] }> = [
    { name: "franchise", ids: state.franchises.map((x) => x.id) },
    { name: "territory", ids: state.territories.map((x) => x.id) },
    { name: "city", ids: state.cities.map((x) => x.id) },
    { name: "venue", ids: state.venues.map((x) => x.id) },
    { name: "playing area", ids: state.playingAreas.map((x) => x.id) },
    { name: "category", ids: state.categories.map((x) => x.id) },
    { name: "template", ids: state.templates.map((x) => x.id) },
    { name: "session", ids: state.sessions.map((x) => x.id) },
    { name: "booking", ids: state.bookings.map((x) => x.id) },
    { name: "crew", ids: state.crew.map((x) => x.id) },
    { name: "shift", ids: state.shifts.map((x) => x.id) },
    { name: "tournament", ids: state.tournaments.map((x) => x.id) },
    { name: "incident", ids: state.incidents.map((x) => x.id) }
  ];

  /* 1 — duplicate IDs */
  for (const { name, ids } of idSets) {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) {
        issues.push(issue("error", "DUPLICATE_ID", name, `Duplicate ${name} id "${id}".`, id));
      }
      seen.add(id);
    }
  }

  const has = (list: { id: string }[], id: string) => list.some((x) => x.id === id);
  const missing = (entity: string, label: string, ref: string, target: string): boolean => {
    issues.push(issue("error", "MISSING_REFERENCE", entity, `${label} references missing ${target} "${ref}".`, entity));
    return true;
  };

  /* 2 — missing references */
  for (const t of state.territories) if (!has(state.franchises, t.franchiseId)) missing(t.id, "territory", t.franchiseId, "franchise");
  for (const c of state.cities) if (!has(state.territories, c.territoryId)) missing(c.id, "city", c.territoryId, "territory");
  for (const v of state.venues) {
    if (!has(state.territories, v.territoryId)) missing(v.id, "venue", v.territoryId, "territory");
    if (!has(state.cities, v.cityId)) missing(v.id, "venue", v.cityId, "city");
  }
  for (const p of state.playingAreas) if (!has(state.venues, p.venueId)) missing(p.id, "playing area", p.venueId, "venue");
  for (const et of state.templates) if (!has(state.categories, et.categoryId)) missing(et.id, "template", et.categoryId, "category");
  for (const s of state.sessions) {
    if (!has(state.templates, s.templateId)) missing(s.id, "session", s.templateId, "template");
    if (!has(state.categories, s.categoryId)) missing(s.id, "session", s.categoryId, "category");
    if (!has(state.territories, s.territoryId)) missing(s.id, "session", s.territoryId, "territory");
    if (!has(state.cities, s.cityId)) missing(s.id, "session", s.cityId, "city");
    if (!has(state.venues, s.venueId)) missing(s.id, "session", s.venueId, "venue");
    if (!has(state.playingAreas, s.playingAreaId)) missing(s.id, "session", s.playingAreaId, "playing area");
  }
  for (const b of state.bookings) if (!has(state.sessions, b.sessionId)) missing(b.id, "booking", b.sessionId, "session");
  for (const t of state.transactions) {
    if (!has(state.sessions, t.sessionId)) missing(t.id, "transaction", t.sessionId, "session");
    if (!has(state.bookings, t.bookingId)) missing(t.id, "transaction", t.bookingId, "booking");
  }
  for (const cr of state.crew) {
    if (!has(state.territories, cr.territoryId)) missing(cr.id, "crew", cr.territoryId, "territory");
    if (!has(state.venues, cr.venueId)) missing(cr.id, "crew", cr.venueId, "venue");
  }
  for (const sh of state.shifts) {
    if (!has(state.crew, sh.crewId)) missing(sh.id, "shift", sh.crewId, "crew");
    if (!has(state.venues, sh.venueId)) missing(sh.id, "shift", sh.venueId, "venue");
  }
  for (const t of state.tournaments) {
    if (!has(state.sessions, t.linkedSessionId)) missing(t.id, "tournament", t.linkedSessionId, "linked session");
    if (!has(state.territories, t.territoryId)) missing(t.id, "tournament", t.territoryId, "territory");
    if (!has(state.venues, t.venueId)) missing(t.id, "tournament", t.venueId, "venue");
  }
  for (const m of state.tournaments.flatMap((t) => t.brackets)) {
    if (!has(state.tournaments, m.tournamentId)) missing(m.id, "match", m.tournamentId, "tournament");
  }
  for (const i of state.incidents) if (!has(state.sessions, i.sessionId)) missing(i.id, "incident", i.sessionId, "session");

  /* 3 — invalid city ↔ territory relationship */
  for (const c of state.cities) {
    if (!has(state.territories, c.territoryId)) continue;
    const terr = state.territories.find((t) => t.id === c.territoryId);
    if (terr && terr.franchiseId && !has(state.franchises, terr.franchiseId)) {
      issues.push(issue("warning", "ORPHAN_TERRITORY", c.id, `City "${c.name}" sits under territory whose franchise is missing.`, c.id));
    }
  }

  /* 4 — invalid venue ↔ city relationship */
  for (const v of state.venues) {
    const city = state.cities.find((c) => c.id === v.cityId);
    if (city && city.territoryId !== v.territoryId) {
      issues.push(
        issue("error", "VENUE_CITY_MISMATCH", v.id, `Venue "${v.name}" territory (${v.territoryId}) does not match its city's territory (${city.territoryId}).`, v.id)
      );
    }
    for (const cat of v.supportedActivities) {
      if (!has(state.categories, cat)) {
        issues.push(issue("warning", "INVALID_COMPATIBILITY", v.id, `Venue "${v.name}" supports unknown category "${cat}".`, v.id));
      }
    }
  }

  /* 5 — invalid playing-area compatibility */
  for (const p of state.playingAreas) {
    for (const cat of p.activityCompatibility) {
      if (!has(state.categories, cat)) {
        issues.push(issue("warning", "INVALID_COMPATIBILITY", p.id, `Playing area "${p.name}" compatible with unknown category "${cat}".`, p.id));
      }
    }
  }

  /* 6 — booking capacity overflow */
  for (const s of state.sessions) {
    const seats = state.bookings.filter((b) => b.sessionId === s.id && SEAT_STATUSES.has(b.status as SeatStatus)).length;
    if (seats > s.maxParticipants) {
      issues.push(
        issue("error", "CAPACITY_OVERFLOW", s.id, `Session ${s.id} has ${seats} seated bookings against a cap of ${s.maxParticipants}.`, s.id)
      );
    } else if (seats === s.maxParticipants && s.status !== "full") {
      issues.push(issue("info", "CAPACITY_STATUS_STALE", s.id, `Session ${s.id} is at capacity (${seats}/${s.maxParticipants}) but status is "${s.status}".`, s.id));
    }
  }

  /* 7 — orphan transactions */
  for (const t of state.transactions) {
    const booking = state.bookings.find((b) => b.id === t.bookingId);
    if (booking && booking.sessionId !== t.sessionId) {
      issues.push(issue("warning", "ORPHAN_TRANSACTION", t.id, `Transaction session (${t.sessionId}) differs from its booking's session (${booking.sessionId}).`, t.id));
    }
  }

  /* 8 — invalid tournament matches */
  for (const t of state.tournaments) {
    for (const m of t.brackets) {
      if (m.teamA === m.teamB) {
        issues.push(issue("error", "INVALID_MATCH", m.id, `Match ${m.id} has the same team on both sides ("${m.teamA}").`, m.id));
      }
      if (m.status === "completed" && m.winner && m.winner !== m.teamA && m.winner !== m.teamB) {
        issues.push(issue("error", "INVALID_MATCH", m.id, `Match ${m.id} winner "${m.winner}" is not a participating team.`, m.id));
      }
      if (m.status === "completed" && (m.scoreA === undefined || m.scoreB === undefined)) {
        issues.push(issue("warning", "INVALID_MATCH", m.id, `Match ${m.id} completed without a score.`, m.id));
      }
    }
  }

  /* 9 — franchise ↔ territory bidirectional consistency */
  for (const f of state.franchises) {
    for (const tid of f.assignedTerritories) {
      const t = state.territories.find((x) => x.id === tid);
      if (!t) {
        issues.push(issue("error", "MISSING_REFERENCE", f.id, `Franchise "${f.name}" lists territory "${tid}" that does not exist.`, f.id));
      } else if (t.franchiseId !== f.id) {
        issues.push(issue("error", "FRANCHISE_MISMATCH", f.id, `Territory "${t.name}" is listed on franchise "${f.name}" but belongs to franchise "${t.franchiseId}".`, f.id));
      }
    }
  }
  for (const t of state.territories) {
    const f = state.franchises.find((x) => x.id === t.franchiseId);
    if (f && !f.assignedTerritories.includes(t.id)) {
      issues.push(issue("warning", "FRANCHISE_MISMATCH", t.id, `Territory "${t.name}" belongs to franchise "${f.name}" but is not listed in its assigned territories.`, t.id));
    }
  }

  /* 10 — city ↔ territory and city category references */
  for (const c of state.cities) {
    for (const cat of c.supportedCategories) {
      if (!has(state.categories, cat)) {
        issues.push(issue("warning", "INVALID_COMPATIBILITY", c.id, `City "${c.name}" supports unknown category "${cat}".`, c.id));
      }
    }
    if (!c.managerId) {
      issues.push(issue("warning", "MISSING_MANAGER", c.id, `City "${c.name}" has no assigned city manager.`, c.id));
    }
  }

  /* 11 — playing-area compatibility must be supported by the parent venue */
  for (const p of state.playingAreas) {
    const v = state.venues.find((x) => x.id === p.venueId);
    if (!v) continue;
    for (const cat of p.activityCompatibility) {
      if (!v.supportedActivities.includes(cat)) {
        issues.push(
          issue("warning", "COMPATIBILITY_OVERLAP", p.id, `Playing area "${p.name}" supports "${cat}" which the parent venue "${v.name}" does not.`, p.id)
        );
      }
    }
    if (!p.name.trim()) issues.push(issue("error", "MISSING_NAME", p.id, "Playing area has an empty name.", p.id));
  }

  /* 12 — venue activities should stay within its city's supported categories */
  for (const v of state.venues) {
    const city = state.cities.find((c) => c.id === v.cityId);
    if (!city || city.supportedCategories.length === 0) continue;
    for (const cat of v.supportedActivities) {
      if (!city.supportedCategories.includes(cat)) {
        issues.push(
          issue("info", "COMPATIBILITY_OVERLAP", v.id, `Venue "${v.name}" offers "${cat}" which city "${city.name}" does not support.`, v.id)
        );
      }
    }
    if (v.safetyCapacity <= 0) {
      issues.push(issue("error", "INVALID_CAPACITY", v.id, `Venue "${v.name}" has non-positive safety capacity.`, v.id));
    }
    if (!v.emergencyExits.trim()) {
      issues.push(issue("warning", "MISSING_SAFETY", v.id, `Venue "${v.name}" has no recorded emergency exits.`, v.id));
    }
  }

  return issues;
}

export const validationSummary = (issues: ValidationIssue[]) => ({
  errors: issues.filter((i) => i.severity === "error").length,
  warnings: issues.filter((i) => i.severity === "warning").length,
  info: issues.filter((i) => i.severity === "info").length
});

/* ------------------------------------------------------------------
   SA-P2C form-level validators (Part 12).
   Critical ("error") issues block activation; warnings never block a
   draft. Used by the category/template wizards' readiness gates.
------------------------------------------------------------------- */

export interface FormValidation {
  issues: ValidationIssue[];
  ready: boolean;
}

const norm = (s?: string) => (s ?? "").trim().toLowerCase();

export function validateCategoryForm(input: CategoryInput, state: PrototypeState): FormValidation {
  const issues: ValidationIssue[] = [];
  const add = (severity: ValidationIssue["severity"], code: string, message: string) =>
    issues.push(issue(severity, code, "category", message, input.id));

  if (norm(input.name).length < 2) add("error", "MISSING_NAME", "Category name is required.");
  else if (state.categories.some((c) => c.id !== input.id && norm(c.name) === norm(input.name)))
    add("error", "DUPLICATE_NAME", `Category "${input.name}" already exists.`);

  const code = norm(input.shortCode);
  if (code && state.categories.some((c) => c.id !== input.id && norm(c.shortCode) === code))
    add("error", "DUPLICATE_CODE", `Short code "${input.shortCode}" is already in use.`);
  if (!code) add("warning", "MISSING_CODE", "No short code set — defaults to name prefix.");

  if (input.defaultAgeMin < 0) add("error", "AGE_RANGE", "Age min cannot be negative.");
  if (input.defaultAgeMin >= input.defaultAgeMax) add("error", "AGE_RANGE", "Age range invalid (min must be below max).");

  const { defaultParticipantsMin: min, defaultTargetParticipants: target, defaultParticipantsMax: max } = input;
  if (min > max) add("error", "CAPACITY_EQUATION", "Capacity equation invalid: min exceeds max.");
  if (target != null && (target < min || target > max))
    add("error", "CAPACITY_EQUATION", "Target participants outside [min, max] range.");
  if (max <= 0) add("error", "CAPACITY_EQUATION", "Max participants must be positive.");
  if ((input.defaultTeamSize ?? 1) > max) add("warning", "TEAM_SIZE", "Default team size exceeds max participants.");

  if (input.defaultDuration <= 0) add("error", "TIMING", "Default duration must be positive.");

  const vc = input.venueCompat;
  if (vc?.minAreaCapacity != null && vc.minAreaCapacity <= 0)
    add("warning", "VENUE_COMPAT", "Minimum venue capacity must be positive.");

  if (input.riskLevel === "high" && !input.safetyContactRequired)
    add("warning", "RISK", "High-risk category without a safety contact requirement.");

  if (input.weatherDependency && !input.participantRequirements?.includes("weather-consent"))
    add("info", "RISK", "Weather-dependent category should capture participant weather consent.");

  return { issues, ready: !issues.some((i) => i.severity === "error") };
}

export function validateTemplateForm(input: TemplateInput, state: PrototypeState): FormValidation {
  const issues: ValidationIssue[] = [];
  const add = (severity: ValidationIssue["severity"], code: string, message: string) =>
    issues.push(issue(severity, code, "template", message, input.id));

  if (norm(input.name).length < 2) add("error", "MISSING_NAME", "Template name is required.");
  else if (state.templates.some((t) => t.id !== input.id && norm(t.name) === norm(input.name)))
    add("error", "DUPLICATE_NAME", `Template "${input.name}" already exists.`);

  const cat = state.categories.find((c) => c.id === input.categoryId);
  if (!cat) add("error", "CATEGORY_DEPENDENCY", "Template must belong to a category.");
  else if (cat.status === "paused") add("error", "CATEGORY_DEPENDENCY", "Category is paused — activation blocked.");
  else if (cat.status === "archived") add("error", "CATEGORY_DEPENDENCY", "Category is archived — activation blocked.");

  if (input.ageMin < 0) add("error", "AGE_RANGE", "Age min cannot be negative.");
  if (input.ageMin >= input.ageMax) add("error", "AGE_RANGE", "Age range invalid (min must be below max).");

  const { minParticipants: min, targetParticipants: target, maxParticipants: max } = input;
  if (min > max) add("error", "CAPACITY_EQUATION", "Capacity equation invalid: min exceeds max.");
  if (target < min || target > max) add("error", "CAPACITY_EQUATION", "Target participants outside [min, max] range.");
  if (max <= 0) add("error", "CAPACITY_EQUATION", "Max participants must be positive.");
  if (input.teamSize <= 0 || input.teamSize > max) add("error", "TEAM_SIZE", "Team size must be between 1 and max participants.");
  if (input.numTeams < 1) add("error", "TEAM_SIZE", "At least one team required.");
  if (input.numTeams * input.teamSize !== max)
    add("warning", "CAPACITY_EQUATION", `Capacity equation unbalanced: max ${max} ≠ ${input.numTeams} teams × ${input.teamSize}.`);
  if (input.spectatorAllowance + input.compSlots + input.blockedSlots > max)
    add("warning", "CAPACITY_EQUATION", "Spectator/complimentary/blocked slots exceed max participants.");

  if (input.duration <= 0) add("error", "TIMING", "Duration must be positive.");
  if (input.bookingOpenDays <= 0) add("error", "TIMING", "Booking window must be at least 1 day.");
  if (input.bookingCloseHours <= 0) add("error", "TIMING", "Booking close must be before start.");
  if (input.revealHoursBefore <= 0) add("error", "TIMING", "Reveal time must be set.");
  if (input.revealHoursBefore > input.bookingCloseHours)
    add("warning", "TIMING_ORDER", "Reveal happens before booking closes — details visible before committing.");
  if (input.checkInWindow > input.duration)
    add("warning", "TIMING_ORDER", "Check-in window exceeds session duration.");
  if (input.revealHoursBefore * 60 < input.revealTimeMinsBefore)
    add("warning", "TIMING_ORDER", "Reveal (minutes-before) exceeds the reveal-hours-before window.");
  if (input.lateArrivalMins + input.completionBufferMins > input.duration)
    add("info", "TIMING_ORDER", "Late-arrival + buffer can exceed duration.");

  if (input.basePrice <= 0) add("error", "PRICING", "Base price must be positive.");
  if (input.venueCost < 0 || input.equipmentCost < 0 || (input.staffingCost ?? 0) < 0)
    add("error", "PRICING", "Costs cannot be negative.");
  if (input.basePrice * input.minParticipants < input.venueCost + input.equipmentCost + (input.staffingCost ?? 0))
    add("error", "BREAK_EVEN", "Break-even infeasible at minimum capacity.");
  if (input.basePrice * input.maxParticipants < input.venueCost + input.equipmentCost + (input.staffingCost ?? 0))
    add("error", "BREAK_EVEN", "Break-even infeasible even at maximum capacity.");

  if (!input.requiredRoles.length) add("error", "STAFFING", "No staffing roles defined.");
  if (input.coordinatorsCount < 1) add("error", "STAFFING", "At least one coordinator required.");
  if (input.refereeRequired && !input.requiredRoles.includes("referee"))
    add("warning", "STAFFING", "Referee required but not in the staffing plan.");
  if ((input.weatherDependency || input.safetyLevel === "high") && !input.safetyContactRequired)
    add("warning", "SAFETY", "Weather/risk exposure without a safety contact requirement.");

  const vc = input.venueCompat;
  if (vc?.minAreaCapacity != null && vc.minAreaCapacity <= 0)
    add("warning", "VENUE_COMPAT", "Minimum venue capacity must be positive.");
  if (vc?.indoorOutdoorNeed === "outdoor" && input.weatherDependency)
    add("info", "VENUE_COMPAT", "Outdoor template with weather dependency — confirm weather risk plan.");

  if (!input.tempIdFormat.trim()) add("warning", "REVEAL_PRIVACY", "No temp ID format set for reveal.");
  if (!input.aliasStyle.trim()) add("warning", "REVEAL_PRIVACY", "No alias style set for reveal.");
  const revealed = input.infoRevealed.map(norm).filter(Boolean);
  const neverRevealed = input.infoNeverRevealed.map(norm).filter(Boolean);
  if (revealed.length && neverRevealed.some((n) => revealed.includes(n)))
    add("error", "REVEAL_PRIVACY", "An item is listed as both revealed and never revealed.");
  if (!input.infoRevealed.length) add("warning", "REVEAL_PRIVACY", "Nothing is set to reveal at reveal time.");
  if (input.anonymousJoinedCount && input.showJoinedCountBeforeReveal)
    add("warning", "REVEAL_PRIVACY", "Anonymous joined count cannot show before reveal.");

  if (!input.dataRetentionPlaceholder?.trim())
    add("warning", "LEGAL_ACCOUNTING", "Data retention placeholder not set.");
  if (input.legalReviewStatus === "pending")
    add("info", "LEGAL_ACCOUNTING", "Legal review pending (prototype placeholder).");

  return { issues, ready: !issues.some((i) => i.severity === "error") };
}

export * from "./bookingValidation";
