import { describe, it, expect } from "vitest";
import type { RoleId } from "@/lib/types";
import { ALL_ROLES } from "@/lib/nav";
import {
  SAFETY_PERMISSIONS,
  canPerformSafetyAction,
  authorizeSafetyAction,
  safetyDenialReason,
  safetyGate,
  type SafetyAction,
} from "./access";
import { TOURNAMENT_PERMISSIONS, canPerformTournamentAction, authorizeTournamentAction } from "@/lib/tournaments/access";
import { getInitialState } from "@/lib/prototype/scenarios/initial";

const ACTIONS = Object.keys(SAFETY_PERMISSIONS) as SafetyAction[];

describe("Trust & Safety permission matrix", () => {
  it("only references real role ids", () => {
    for (const roles of [...Object.values(SAFETY_PERMISSIONS), ...Object.values(TOURNAMENT_PERMISSIONS)]) {
      for (const r of roles) expect(ALL_ROLES).toContain(r);
    }
  });

  it("gives Platform Owner and Super Admin every safety and tournament permission", () => {
    for (const role of ["platform-owner", "super-admin"] as RoleId[]) {
      for (const a of ACTIONS) expect(canPerformSafetyAction(role, a)).toBe(true);
      for (const a of Object.keys(TOURNAMENT_PERMISSIONS)) expect(canPerformTournamentAction(role, a as keyof typeof TOURNAMENT_PERMISSIONS)).toBe(true);
    }
  });

  it("lets the Safety & Moderation Officer run incidents, disputes and moderation, but not approve permanent bans", () => {
    const allowed: SafetyAction[] = [
      "incident.report", "incident.acknowledge", "incident.triage", "incident.assign", "incident.escalate", "incident.investigate",
      "incident.resolve", "incident.close", "incident.evidence", "incident.follow-up",
      "dispute.submit", "dispute.assign", "dispute.request-evidence", "dispute.decide", "dispute.close",
      "moderation.open-case", "moderation.propose", "moderation.approve", "moderation.reject", "moderation.revoke",
      "refund-exception.recommend",
    ];
    for (const a of allowed) expect(canPerformSafetyAction("safety", a)).toBe(true);
    expect(canPerformSafetyAction("safety", "moderation.approve-ban")).toBe(false);
    expect(canPerformSafetyAction("safety", "moderation.revoke-ban")).toBe(false);
    expect(canPerformSafetyAction("safety", "refund-exception.decide")).toBe(false);
  });

  it("limits chain first responders to report, acknowledge, triage and evidence", () => {
    for (const role of ["ops-manager", "city-manager", "coordinator"] as RoleId[]) {
      for (const a of ["incident.report", "incident.acknowledge", "incident.triage", "incident.evidence"] as SafetyAction[]) {
        expect(canPerformSafetyAction(role, a)).toBe(true);
      }
      for (const a of ["incident.close", "incident.resolve", "dispute.decide", "moderation.approve"] as SafetyAction[]) {
        expect(canPerformSafetyAction(role, a)).toBe(false);
      }
    }
  });

  it("lets Support report incidents and log disputes only", () => {
    const granted = ACTIONS.filter((a) => canPerformSafetyAction("support", a));
    expect(granted.sort()).toEqual(["dispute.submit", "incident.report"]);
  });

  it("lets Finance decide refund exceptions and nothing else in safety", () => {
    const granted = ACTIONS.filter((a) => canPerformSafetyAction("finance", a));
    expect(granted).toEqual(["refund-exception.decide"]);
  });

  it("explains denials in plain English naming the roles that can act", () => {
    expect(safetyDenialReason("moderation.approve-ban")).toBe("Only a Platform Owner or Super Admin can approve permanent platform bans.");
  });

  it("resolves the actor from the workspace and applies territory scope to chain roles", () => {
    const state = getInitialState();
    // op-5 Ravi Teja, ops-manager, hvd-central
    expect(authorizeSafetyAction(state, "op-5", "incident.triage", { territoryId: "hvd-central" }).ok).toBe(true);
    const outside = authorizeSafetyAction(state, "op-5", "incident.triage", { territoryId: "blr-south" });
    expect(outside.ok).toBe(false);
    // op-9 Priya Menon, safety: platform-wide
    expect(authorizeSafetyAction(state, "op-9", "incident.close", { territoryId: "blr-south" }).ok).toBe(true);
    expect(authorizeSafetyAction(state, "nobody", "incident.report").ok).toBe(false);
    const suspended = { ...state, operators: state.operators.map((o) => (o.id === "op-9" ? { ...o, status: "suspended" as const } : o)) };
    expect(authorizeSafetyAction(suspended, "op-9", "incident.report").ok).toBe(false);
  });

  it("UI gate mirrors the service check", () => {
    expect(safetyGate("coordinator", "incident.triage", { operatorTerritoryId: "hvd-central", recordTerritoryId: "mum-west" }).allowed).toBe(false);
    expect(safetyGate("safety", "incident.triage", { operatorTerritoryId: "hvd-central", recordTerritoryId: "mum-west" }).allowed).toBe(true);
    expect(safetyGate("finance", "incident.triage").reason).toMatch(/Only a/);
  });

  it("tournament actions: staff can record scores but not verify; coordinators cannot disqualify", () => {
    expect(canPerformTournamentAction("staff", "match.result")).toBe(true);
    expect(canPerformTournamentAction("staff", "match.verify")).toBe(false);
    expect(canPerformTournamentAction("coordinator", "match.verify")).toBe(true);
    expect(canPerformTournamentAction("coordinator", "team.disqualify")).toBe(false);
    const state = getInitialState();
    expect(authorizeTournamentAction(state, "op-7", "match.run", "blr-south").ok).toBe(false);
    expect(authorizeTournamentAction(state, "op-2", "match.run", "blr-south").ok).toBe(true);
  });
});
