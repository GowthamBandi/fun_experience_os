import { describe, expect, it } from "vitest";
import { getEmptyState, getInitialState } from "../scenarios";
import { createCity, createFranchise, createPlayingArea, createTerritory, createVenue } from "./create";
import { changeFranchiseStatus, changePlayingAreaStatus, changeTerritoryStatus, changeVenueStatus, updateVenue } from "./geo";
import { changeCategoryStatus, changeTemplateStatus, createActivityCategory, duplicateExperienceTemplate } from "./catalog";
import { selectNextSetupAction, selectSetupJourney } from "../selectors/setup";
import { geoCan, GEO_ACTIONS } from "@/lib/geo/access";
import { canAccess } from "@/lib/nav";
import { ALL_ROLES } from "@/lib/nav";

const franchise = {
  name: "Deccan Play Co",
  type: "regional",
  isInternal: false,
  legalEntity: "Deccan Play LLP",
  assignedTerritories: [],
  franchiseHead: "Asha Varma",
  revenueShare: 20,
  startDate: "2026-10-01",
  status: "active" as const,
  contactDetails: "ops@deccanplay.in",
  notes: "",
};

describe("setup from an empty workspace", () => {
  it("walks franchise → territory → city → venue → playing area with the next step guiding each stage", () => {
    let state = getEmptyState();
    expect(selectNextSetupAction(state).actionKey).toBe("create-franchise");

    const f = createFranchise(state, franchise, "op-1");
    expect(f.error).toBeUndefined();
    state = f.state;
    expect(selectNextSetupAction(state).actionKey).toBe("add-territory");

    const t = createTerritory(state, { franchiseId: f.id!, name: "Pune West", type: "urban", state: "Maharashtra", region: "West", managerId: "op-4", status: "active", timezone: "IST (UTC+5:30)", currency: "INR (₹)", contactInfo: "", notes: "" }, "op-1");
    expect(t.error).toBeUndefined();
    state = t.state;
    expect(state.franchises[0].assignedTerritories).toContain(t.id);

    const c = createCity(state, { territoryId: t.id!, name: "Pune", state: "Maharashtra", launchDate: "2026-10-10", managerId: "", supportedCategories: [], status: "draft", notes: "" }, "op-1");
    expect(c.error).toBeUndefined();
    state = c.state;

    const v = createVenue(state, {
      territoryId: t.id!, cityId: c.id!, name: "Baner Sports Hub", address: "12 Baner Road", contactPerson: "", contactNumber: "", type: "arena", operatingHours: "06:00 - 23:00",
      supportedActivities: [], safetyCapacity: 80, staffCapacity: 6, spectatorAllowance: 20, equipmentAvailable: [], accessibility: true, parking: true, washrooms: true, lighting: true,
      isIndoor: true, weatherDependent: false, costPerSlot: 1500, revenueModel: "fixed", cancellationTerms: "", emergencyExits: "2", firstAid: true, safetyContact: "", incidentNotes: "",
      verificationStatus: "pending", status: "ready",
    }, "op-1");
    expect(v.error).toBeUndefined();
    state = v.state;

    const tooBig = createPlayingArea(state, { venueId: v.id!, name: "Court 1", activityCompatibility: ["cat-x"], maxCapacity: 500, staffCapacity: 1, spectatorCapacity: 0, equipment: [], operatingHours: "", status: "active", restrictions: "" });
    expect(tooBig.error).toMatch(/safe capacity/);
    const pa = createPlayingArea(state, { venueId: v.id!, name: "Court 1", activityCompatibility: ["cat-x"], maxCapacity: 8, staffCapacity: 1, spectatorCapacity: 0, equipment: [], operatingHours: "", status: "active", restrictions: "" }, "op-1");
    expect(pa.error).toBeUndefined();
    state = pa.state;
    expect(selectNextSetupAction(state).actionKey).toBe("add-category");
    expect(selectSetupJourney(state).filter((s) => s.status === "complete").map((s) => s.key)).toEqual(["franchise", "territory", "city", "venue", "playing-area"]);
  });

  it("refuses duplicates and dangling parents with readable messages", () => {
    const state = getInitialState();
    expect(createFranchise(state, { ...franchise, name: "Apex Gaming & Sports Central" }).error).toMatch(/already exists/);
    expect(createTerritory(state, { franchiseId: "f-404", name: "Nowhere", type: "urban", state: "X", region: "", managerId: "", status: "draft", timezone: "IST", currency: "INR", contactInfo: "", notes: "" }).error).toMatch(/franchise/);
    expect(createFranchise(state, { ...franchise, revenueShare: 140 }).error).toMatch(/between 0% and 100%/);
  });
});

describe("status changes", () => {
  it("require a reason when taking something out of service", () => {
    const state = getInitialState();
    expect(changeTerritoryStatus(state, "mum-west", "paused", "op-1").error).toMatch(/reason/);
    const ok = changeTerritoryStatus(state, "mum-west", "paused", "op-1", "Monsoon flooding on access roads");
    expect(ok.error).toBeUndefined();
    expect(ok.state.audits[0].description).toMatch(/Monsoon/);
    expect(ok.state.audits[0].operatorId).toBe("op-1");
  });

  it("pausing a franchise pauses its active territories and resuming restores them", () => {
    const paused = changeFranchiseStatus(getInitialState(), "f-1", "inactive", "op-1", "Contract renewal pending");
    expect(paused.state.territories.filter((t) => t.franchiseId === "f-1").every((t) => t.status === "paused")).toBe(true);
    expect(changeTerritoryStatus(paused.state, "hvd-central", "active", "op-1").error).toMatch(/Resume the franchise first/);
    const resumed = changeFranchiseStatus(paused.state, "f-1", "active", "op-1");
    expect(resumed.state.territories.filter((t) => t.franchiseId === "f-1").every((t) => t.status === "active")).toBe(true);
  });

  it("will not close a venue or playing area that still has upcoming sessions", () => {
    const state = getInitialState();
    expect(changeVenueStatus(state, "v-1", "closed", "op-1", "Lease ended at month end").error).toMatch(/upcoming session/);
    expect(changePlayingAreaStatus(state, "pa-1", "closed", "op-1", "Floor resurfacing").error).toMatch(/upcoming session/);
    expect(changeVenueStatus(state, "v-1", "maintenance", "op-1", "Roof leak repair").error).toBeUndefined();
  });

  it("will not shrink a venue's safe capacity below a playing area's capacity", () => {
    expect(updateVenue(getInitialState(), "v-3", { safetyCapacity: 4 }).error).toMatch(/Pitch 1/);
  });
});

describe("catalog rules", () => {
  it("categories and experiences need reasons to pause or archive, and archive is blocked while in use", () => {
    const state = getInitialState();
    expect(changeCategoryStatus(state, "cat-cricket", "paused").error).toMatch(/reason/);
    expect(changeCategoryStatus(state, "cat-cricket", "archived", "op-1", "Retiring cricket").error).toMatch(/active experience/);
    expect(changeTemplateStatus(state, "et-1", "paused", "op-1").error).toMatch(/reason/);
    const paused = changeTemplateStatus(state, "et-1", "paused", "op-1", "Referee shortage this month");
    expect(paused.error).toBeUndefined();
    const v = paused.state.templateVersions.filter((x) => x.templateId === "et-1").pop()!;
    expect(v.reason).toBe("Referee shortage this month");
    expect(v.newStatus).toBe("paused");
    expect(changeTemplateStatus(state, "et-1", "archived", "op-1", "Replaced by v2").error).toMatch(/upcoming session/);
  });

  it("duplicates into a uniquely named draft", () => {
    const a = duplicateExperienceTemplate(getInitialState(), "et-1", "op-1");
    const b = duplicateExperienceTemplate(a.state, "et-1", "op-1");
    const names = b.state.templates.filter((t) => t.id === a.id || t.id === b.id).map((t) => t.name);
    expect(new Set(names).size).toBe(2);
    expect(b.state.templates.find((t) => t.id === b.id)!.status).toBe("draft");
  });

  it("validates new categories", () => {
    const state = getInitialState();
    const base = state.categories[0];
    const { id: _id, ...rest } = base;
    void _id;
    expect(createActivityCategory(state, { ...rest, name: "Box Cricket" }).error).toMatch(/already exists/);
    expect(createActivityCategory(state, { ...rest, name: "Pickleball", shortCode: "PICKLE", defaultParticipantsMin: 10, defaultParticipantsMax: 4 }).error).toMatch(/Minimum participants/);
    const ok = createActivityCategory(state, { ...rest, name: "Pickleball", shortCode: "PICKLE" }, "op-1");
    expect(ok.error).toBeUndefined();
    expect(ok.state.categories.find((c) => c.id === ok.id)!.status).toBe("active");
  });
});

describe("action permissions", () => {
  it("never grant an action to a role that cannot open the page exposing it", () => {
    for (const [action, def] of Object.entries(GEO_ACTIONS)) {
      for (const role of ALL_ROLES) {
        if (geoCan(role, action as keyof typeof GEO_ACTIONS)) expect(canAccess(def.route, role)).toBe(true);
      }
    }
  });

  it("setup owns franchises, territories, cities and locations", () => {
    for (const p of ["/franchises/new", "/territories/t-1", "/cities", "/locations/venues/v-1"]) {
      expect(canAccess(p, "venue-manager")).toBe(true);
      expect(canAccess(p, "finance")).toBe(false);
    }
  });
});
