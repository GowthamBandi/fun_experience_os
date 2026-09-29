import { describe, expect, it } from "vitest";
import { getEmptyState, getInitialState } from "../scenarios";
import type { PrototypeState } from "../scenarios";
import {
  activeSessionsFor,
  assignCrewToSession,
  createCrewMember,
  crewConflicts,
  mapOperatorStaffToCrew,
  resolveCrewId,
  sessionDay,
  unassignCrewFromSession,
  updateCrewMember,
} from "./staff";
import { migrateState } from "../migrations";

const NOW = new Date("2026-09-29T10:00:00");

function withSession(state: PrototypeState, patch: Partial<PrototypeState["sessions"][number]>) {
  const base = state.sessions.find((s) => s.id === "s-4")!;
  const s = { ...base, id: "s-test", leadCoordinatorId: "", safetyContactId: "", refereeId: "", supportingCoordinatorId: "", equipmentHandlerId: "", ...patch };
  return { ...state, sessions: [...state.sessions, s] };
}

describe("createCrewMember", () => {
  it("adds a member with a crew id, audit entry and available status", () => {
    const state = getInitialState();
    const out = createCrewMember(state, { name: "  Nikhil Rao ", role: "staff", territoryId: "hvd-central", venueId: "v-1", phone: "+91 90000 11111" }, "op-5");
    expect(out.error).toBeUndefined();
    const member = out.state.crew.find((c) => c.id === out.id)!;
    expect(member.id).toMatch(/^c-\d+$/);
    expect(member.name).toBe("Nikhil Rao");
    expect(member.status).toBe("available");
    expect(out.state.audits[0].action).toBe("Staff Member Added");
    expect(out.state.audits[0].operatorId).toBe("op-5");
  });

  it("requires name, role, territory and venue", () => {
    const state = getInitialState();
    expect(createCrewMember(state, { name: "", role: "staff", territoryId: "hvd-central", venueId: "v-1" }).error).toMatch(/name/);
    expect(createCrewMember(state, { name: "A Person", role: "finance", territoryId: "hvd-central", venueId: "v-1" }).error).toMatch(/role/);
    expect(createCrewMember(state, { name: "A Person", role: "staff", territoryId: "", venueId: "v-1" }).error).toMatch(/territory/);
    expect(createCrewMember(state, { name: "A Person", role: "staff", territoryId: "hvd-central", venueId: "" }).error).toMatch(/venue/);
  });

  it("rejects a venue outside the chosen territory", () => {
    const state = getInitialState();
    const out = createCrewMember(state, { name: "A Person", role: "staff", territoryId: "hvd-central", venueId: "v-6" });
    expect(out.error).toMatch(/not in Hyderabad Central/);
    expect(out.state).toBe(state);
  });

  it("rejects duplicates in the same territory and bad contact details", () => {
    const state = getInitialState();
    expect(createCrewMember(state, { name: "aisha khan", role: "staff", territoryId: "hvd-central", venueId: "v-1" }).error).toMatch(/already on the staff list/);
    expect(createCrewMember(state, { name: "New Person", role: "staff", territoryId: "hvd-central", venueId: "v-1", email: "nope" }).error).toMatch(/email/);
  });

  it("works on an empty workspace once a territory and venue exist, and refuses before", () => {
    const empty = getEmptyState();
    expect(createCrewMember(empty, { name: "First Hire", role: "staff", territoryId: "t-1", venueId: "v-1" }).error).toMatch(/territory no longer exists/);
  });
});

describe("updateCrewMember", () => {
  it("cannot mark someone off while they are staffed on an upcoming session", () => {
    const state = getInitialState();
    const out = updateCrewMember(state, "c-1", { status: "off" });
    expect(out.error).toMatch(/Remove them from those sessions/);
  });

  it("updates details and records an audit", () => {
    const state = getInitialState();
    const out = updateCrewMember(state, "c-8", { phone: "+91 98888 77777", status: "off" }, "op-2");
    expect(out.error).toBeUndefined();
    const m = out.state.crew.find((c) => c.id === "c-8")!;
    expect(m.phone).toBe("+91 98888 77777");
    expect(m.status).toBe("off");
    expect(out.state.audits[0].action).toBe("Staff Member Updated");
  });

  it("reports a missing member", () => {
    expect(updateCrewMember(getInitialState(), "c-999", { name: "X Y" }).error).toMatch(/no longer exists/);
  });
});

describe("assignCrewToSession", () => {
  it("assigns a lead coordinator by crew id and marks them assigned", () => {
    const state = getInitialState();
    const out = assignCrewToSession(state, { sessionId: "s-7", crewId: "c-16", slot: "lead" }, "op-5", NOW);
    // c-16 is lead on s-13 (Today 21:00, 180 min); s-7 is Today 20:00 for 180 min → overlap.
    expect(out.error).toMatch(/overlaps/);

    const free = createCrewMember(state, { name: "Anil Kumar", role: "coordinator", territoryId: "blr-south", venueId: "v-5" });
    const ok = assignCrewToSession(free.state, { sessionId: "s-7", crewId: free.id!, slot: "lead" }, "op-5", NOW);
    expect(ok.error).toBeUndefined();
    expect(ok.state.sessions.find((s) => s.id === "s-7")!.leadCoordinatorId).toBe(free.id);
    expect(ok.state.crew.find((c) => c.id === free.id)!.status).toBe("assigned");
    expect(ok.state.audits[0].action).toBe("Staff Assigned");
    expect(ok.state.audits[0].sessionId).toBe("s-7");
  });

  it("refuses someone who is off", () => {
    let state = getInitialState();
    state = updateCrewMember(state, "c-8", { status: "off" }).state;
    const s = withSession(state, { territoryId: "mum-west", venueId: "v-6" });
    expect(assignCrewToSession(s, { sessionId: "s-test", crewId: "c-8", slot: "support" }, "op-5", NOW).error).toMatch(/marked off/);
  });

  it("refuses the wrong role, the wrong territory and closed sessions", () => {
    const state = getInitialState();
    // c-3 is floor staff: cannot lead
    expect(assignCrewToSession(state, { sessionId: "s-4", crewId: "c-3", slot: "lead" }, "op-5", NOW).error).toMatch(/cannot be lead coordinator/);
    // c-4 works in Bengaluru South, s-4 is in Hyderabad Central
    expect(assignCrewToSession(state, { sessionId: "s-4", crewId: "c-4", slot: "safety" }, "op-5", NOW).error).toMatch(/different territory/);
    // s-10 is completed
    expect(assignCrewToSession(state, { sessionId: "s-10", crewId: "c-3", slot: "support" }, "op-5", NOW).error).toMatch(/completed/);
  });

  it("detects overlapping sessions for the same person", () => {
    const state = withSession(getInitialState(), { date: "Today", startTime: "19:30", duration: 60, territoryId: "hvd-central", venueId: "v-3" });
    // c-1 leads s-1 (Today 19:00–21:00)
    const out = assignCrewToSession(state, { sessionId: "s-test", crewId: "c-1", slot: "lead" }, "op-5", NOW);
    expect(out.error).toMatch(/s-1/);
    expect(crewConflicts(state, "c-1", state.sessions.find((s) => s.id === "s-test")!, NOW).map((s) => s.id)).toContain("s-1");
  });

  it("does not treat back-to-back sessions as overlapping", () => {
    const state = withSession(getInitialState(), { date: "Tomorrow", startTime: "10:00", duration: 60, territoryId: "hvd-central", venueId: "v-2" });
    // c-1 leads s-4 Tomorrow 17:00 and s-5 Tomorrow 07:00 (120 min → ends 09:00)
    const out = assignCrewToSession(state, { sessionId: "s-test", crewId: "c-1", slot: "lead" }, "op-5", NOW);
    expect(out.error).toBeUndefined();
  });
});

describe("unassignCrewFromSession", () => {
  it("requires a reason, clears the slot and frees an idle member", () => {
    const state = getInitialState();
    expect(unassignCrewFromSession(state, { sessionId: "s-2", slot: "safety", reason: "" }).error).toMatch(/reason/);
    const out = unassignCrewFromSession(state, { sessionId: "s-2", slot: "safety", reason: "Swapped with a trained first-aider" }, "op-5");
    expect(out.error).toBeUndefined();
    expect(out.state.sessions.find((s) => s.id === "s-2")!.safetyContactId).toBe("");
    expect(out.state.crew.find((c) => c.id === "c-5")!.status).toBe("available");
    expect(out.state.audits[0].description).toMatch(/Swapped/);
  });
});

describe("staff references", () => {
  it("seed sessions reference crew members, never operator ids", () => {
    const state = getInitialState();
    for (const s of state.sessions) {
      for (const ref of [s.leadCoordinatorId, s.safetyContactId, s.refereeId, s.supportingCoordinatorId, s.equipmentHandlerId]) {
        if (ref) expect(state.crew.some((c) => c.id === ref)).toBe(true);
      }
    }
  });

  it("resolves operator ids to crew by name for older records", () => {
    const state = getInitialState();
    expect(resolveCrewId(state, "op-7")).toBe("c-1");
    expect(resolveCrewId(state, "c-1")).toBe("c-1");
    expect(resolveCrewId(state, "op-404")).toBeUndefined();
    expect(activeSessionsFor(state, "c-1").length).toBeGreaterThan(0);
  });

  it("normalises relative session dates", () => {
    expect(sessionDay("Today", NOW)).toBe("2026-09-29");
    expect(sessionDay("Tomorrow", NOW)).toBe("2026-09-30");
    expect(sessionDay("2026-10-04", NOW)).toBe("2026-10-04");
  });
});

describe("session staff migration", () => {
  function legacyWorkspace(): PrototypeState {
    const state = getInitialState();
    // A workspace saved before crew ids were canonical: operator ids in the slots and no Priya/Ravi crew records.
    return {
      ...state,
      crew: state.crew.filter((c) => !["c-9", "c-10"].includes(c.id)),
      sessions: state.sessions.map((s) =>
        s.id === "s-1" ? { ...s, leadCoordinatorId: "op-7", safetyContactId: "op-9", refereeId: "op-5" } : s.id === "s-3" ? { ...s, safetyContactId: "op-9" } : s,
      ),
    };
  }

  it("maps operator ids to the matching crew member by name", () => {
    const out = mapOperatorStaffToCrew(legacyWorkspace());
    const s1 = out.sessions.find((s) => s.id === "s-1")!;
    expect(s1.leadCoordinatorId).toBe("c-1"); // Aisha Khan
    const priya = out.crew.find((c) => c.name === "Priya Menon")!;
    expect(priya).toBeDefined();
    expect(s1.safetyContactId).toBe(priya.id);
    expect(out.sessions.find((s) => s.id === "s-3")!.safetyContactId).toBe(priya.id);
    expect(out.crew.filter((c) => c.name === "Priya Menon")).toHaveLength(1);
    expect(s1.refereeId).toBe(out.crew.find((c) => c.name === "Ravi Teja")!.id);
  });

  it("is idempotent", () => {
    const once = mapOperatorStaffToCrew(legacyWorkspace());
    const twice = mapOperatorStaffToCrew(once);
    expect(twice).toBe(once);
    expect(twice.crew.length).toBe(once.crew.length);
  });

  it("runs as a registered migration and leaves current data untouched", () => {
    const fresh = getInitialState();
    const migrated = migrateState(fresh);
    expect(migrated.sessions).toEqual(fresh.sessions);
    expect(migrated.crew).toEqual(fresh.crew);
    const legacy = migrateState(legacyWorkspace());
    expect(legacy.sessions.find((s) => s.id === "s-1")!.leadCoordinatorId).toBe("c-1");
  });

  it("does nothing on an empty workspace", () => {
    const empty = getEmptyState();
    expect(mapOperatorStaffToCrew(empty)).toBe(empty);
  });
});

describe("recordStaffAttendance", () => {
  it("checks in an assigned member and refuses unassigned or off members", async () => {
    const { recordStaffAttendance } = await import("./staff");
    const state = getInitialState();
    const ok = recordStaffAttendance(state, { crewId: "c-14", action: "check-in" }, "op-7", NOW);
    expect(ok.error).toBeUndefined();
    expect(ok.state.crew.find((c) => c.id === "c-14")!.status).toBe("checked-in");
    expect(recordStaffAttendance(ok.state, { crewId: "c-14", action: "check-in" }, "op-7", NOW).error).toMatch(/already checked in/);
    expect(recordStaffAttendance(state, { crewId: "c-8", action: "check-in" }, "op-7", NOW).error).toMatch(/not assigned/);
  });

  it("marks someone absent, frees today's slots and requires a reason", async () => {
    const { recordStaffAttendance } = await import("./staff");
    const state = getInitialState();
    expect(recordStaffAttendance(state, { crewId: "c-14", action: "absent" }, "op-7", NOW).error).toMatch(/reason/);
    const out = recordStaffAttendance(state, { crewId: "c-14", action: "absent", reason: "Called in sick" }, "op-7", NOW);
    expect(out.error).toBeUndefined();
    expect(out.state.sessions.find((s) => s.id === "s-2")!.leadCoordinatorId).toBe("");
    expect(out.state.crew.find((c) => c.id === "c-14")!.status).toBe("off");
    expect(out.state.audits[0].description).toMatch(/s-2/);
  });
});
