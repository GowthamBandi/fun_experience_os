import { describe, expect, it } from "vitest";
import { getInitialState } from "../scenarios";
import { decideGovernanceCase, setGovernanceEntityStatus, submitGovernanceIntake } from "./commands";
import type { PrototypeState } from "../scenarios";

const actor = { id: "op-1", name: "Aditya Rao", roleId: "platform-owner" };
const doc = (s: PrototypeState, collection: string, id: string) => s.governance.find((d) => d.collection === collection && d.id === id)!;
const audits = (s: PrototypeState) => s.governance.filter((d) => d.collection === "auditEvents");

describe("decideGovernanceCase", () => {
  it("approves a case, activates its target, bumps versions and writes one audit", () => {
    const s0 = getInitialState();
    const before = audits(s0).length;
    const out = decideGovernanceCase(s0, { caseId: "case-organizer-sridhar", expectedVersion: 0, outcome: "approved", note: "" }, actor);
    expect(out.error).toBeUndefined();
    expect(doc(out.state, "governanceCases", "case-organizer-sridhar").data.status).toBe("approved");
    expect(doc(out.state, "governanceCases", "case-organizer-sridhar").version).toBe(1);
    expect(doc(out.state, "organizers", "organizer-sridhar").data.status).toBe("active");
    expect(audits(out.state).length).toBe(before + 1);
    expect(audits(out.state)[0].data.actorName).toBe("Aditya Rao");
  });

  it("requires a reason for rejection", () => {
    const out = decideGovernanceCase(getInitialState(), { caseId: "case-organizer-sridhar", expectedVersion: 0, outcome: "rejected", note: "no" }, actor);
    expect(out.error).toMatch(/at least 10 characters/);
  });

  it("refuses stale versions and finalized cases", () => {
    const s0 = getInitialState();
    expect(decideGovernanceCase(s0, { caseId: "case-organizer-sridhar", expectedVersion: 3, outcome: "approved", note: "" }, actor).error).toMatch(/changed this case/);
    const approved = decideGovernanceCase(s0, { caseId: "case-organizer-sridhar", expectedVersion: 0, outcome: "approved", note: "" }, actor).state;
    expect(decideGovernanceCase(approved, { caseId: "case-organizer-sridhar", expectedVersion: 1, outcome: "rejected", note: "changed our mind here" }, actor).error).toMatch(/cannot be decided again/);
  });

  it("blocks a settlement release while the organizer has an open risk alert", () => {
    const s0 = getInitialState();
    // Point the VibeLive settlement case at the Neon settlement, whose organizer has an open alert.
    const s1: PrototypeState = {
      ...s0,
      governance: s0.governance.map((d) => (d.id === "case-settlement-vibelive" ? { ...d, data: { ...d.data, targetId: "settlement-neon" } } : d)),
    };
    const out = decideGovernanceCase(s1, { caseId: "case-settlement-vibelive", expectedVersion: 0, outcome: "approved", note: "" }, actor);
    expect(out.error).toMatch(/open risk alert/);
    const clean = decideGovernanceCase(s0, { caseId: "case-settlement-vibelive", expectedVersion: 0, outcome: "approved", note: "" }, actor);
    expect(clean.error).toBeUndefined();
    expect(doc(clean.state, "settlementControls", "settlement-vibelive-w39").data.status).toBe("approved-for-release");
  });
});

describe("setGovernanceEntityStatus", () => {
  it("follows the transition table", () => {
    const s0 = getInitialState();
    const paused = setGovernanceEntityStatus(s0, { entityType: "organizer", entityId: "organizer-vibelive", expectedVersion: 0, status: "paused", reason: "Complaint spike under review" }, actor);
    expect(paused.error).toBeUndefined();
    expect(doc(paused.state, "organizers", "organizer-vibelive").data.status).toBe("paused");
    const bad = setGovernanceEntityStatus(s0, { entityType: "organizer", entityId: "organizer-vibelive", expectedVersion: 0, status: "resolved", reason: "Not a valid status here" }, actor);
    expect(bad.error).toMatch(/cannot be set to resolved/);
    const same = setGovernanceEntityStatus(s0, { entityType: "organizer", entityId: "organizer-vibelive", expectedVersion: 0, status: "active", reason: "Already active anyway" }, actor);
    expect(same.error).toMatch(/already active/);
  });
});

describe("submitGovernanceIntake", () => {
  it("creates the entity and a pending review case", () => {
    const out = submitGovernanceIntake(getInitialState(), { kind: "organizer", name: "Coastal Events", location: "Kakinada", contactEmail: "hi@coastal.in", commissionPercent: 11 }, actor);
    expect(out.error).toBeUndefined();
    const org = out.state.governance.find((d) => d.id === out.id)!;
    expect(org.collection).toBe("organizers");
    expect(org.data.commissionBps).toBe(1100);
    const kase = out.state.governance.find((d) => d.collection === "governanceCases" && d.data.targetId === out.id)!;
    expect(kase.data.status).toBe("pending");
    expect(kase.data.kind).toBe("organizer-kyc");
  });

  it("validates input", () => {
    expect(submitGovernanceIntake(getInitialState(), { kind: "organizer", name: "X" }, actor).error).toMatch(/at least 3/);
    expect(submitGovernanceIntake(getInitialState(), { kind: "organizer", name: "Valid name", contactEmail: "nope" }, actor).error).toMatch(/valid contact email/);
  });
});
