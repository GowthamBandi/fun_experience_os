import { describe, expect, it } from "vitest";
import {
  EMPTY_AUDIT_VIEW,
  applyAuditView,
  auditFieldFacets,
  auditRoleFacets,
  auditRoleLabel,
  auditTone,
  filterHolds,
  formatDuration,
  groupAuditByDay,
  holdCounts,
  humanize,
  istDayKey,
  istDayLabel,
  jobCards,
  jobHealth,
  jobInfo,
  operatorConsequence,
  planOperatorChange,
  sortHolds,
  sortPolicies,
  toHoldRow,
  toOperatorRow,
  toPolicyCard,
} from "@/lib/control";
import { adaptAudit, adaptJobRun, adaptLegalHold, adaptOperator, adaptGeneric } from "@/lib/console/records";

const at = (iso: string) => new Date(iso);
const event = (id: string, iso: string | null, data: Record<string, unknown> = {}) =>
  adaptAudit(id, { action: "refund.decided", actorUid: "admin1", actorRole: "platform:super-admin", resourceType: "refund", resourceId: `r-${id}`, orgId: "org_a", ...(iso ? { at: at(iso) } : {}), ...data });

describe("IST days", () => {
  it("puts 18:30Z on the next India day", () => {
    expect(istDayKey(at("2026-10-08T18:29:00Z"))).toBe("2026-10-08");
    expect(istDayKey(at("2026-10-08T18:30:00Z"))).toBe("2026-10-09");
  });
  it("labels today, yesterday and older days", () => {
    const now = at("2026-10-09T10:00:00Z");
    expect(istDayLabel("2026-10-09", now)).toBe("Today");
    expect(istDayLabel("2026-10-08", now)).toBe("Yesterday");
    expect(istDayLabel("2026-10-02", now)).toMatch(/Fri.*2.*Oct/);
    expect(istDayLabel("2025-12-31", now)).toContain("2025");
  });
  it("groups audit events by India day, newest first, undated last", () => {
    const records = [
      event("a", "2026-10-09T08:00:00Z"),
      event("b", "2026-10-08T19:00:00Z"),
      event("c", "2026-10-08T05:00:00Z"),
      event("d", null),
    ];
    const groups = groupAuditByDay(records, at("2026-10-09T10:00:00Z"));
    expect(groups.map((g) => [g.label, g.records.map((r) => r.id)])).toEqual([
      ["Today", ["a", "b"]],
      ["Yesterday", ["c"]],
      ["Undated", ["d"]],
    ]);
  });
});

describe("audit view", () => {
  const records = [
    event("1", "2026-10-09T08:00:00Z", { reason: "Duplicate charge" }),
    event("2", "2026-10-09T07:00:00Z", { action: "access.operator-updated", resourceType: "user", actorRole: "platform:platform-owner", actorUid: "owner9" }),
    event("3", "2026-10-09T06:00:00Z", { action: "settlement.approved", resourceType: "settlement", actorRole: "auditor" }),
  ];
  it("lists roles with counts and labels", () => {
    expect(auditRoleFacets(records).map((r) => [r.label, r.count])).toEqual(expect.arrayContaining([["Super Admin", 1], ["Platform Owner", 1], ["Auditor", 1]]));
    expect(auditRoleLabel({ actorRole: "platform:super-admin" })).toBe("Super Admin");
    expect(auditRoleLabel({})).toBe("—");
  });
  it("merges actorRole and actorRoleId spellings of one role", () => {
    const mixed = [
      event("m1", "2026-10-09T08:00:00Z", { actorRole: "platform:platform-owner" }),
      event("m2", "2026-10-09T07:00:00Z", { actorRole: undefined, actorRoleId: "platform-owner" }),
      event("m3", "2026-10-09T06:00:00Z", { actorRole: "platform:super-admin" }),
    ];
    expect(auditRoleFacets(mixed).map((r) => [r.value, r.label, r.count])).toEqual([["platform-owner", "Platform Owner", 2], ["super-admin", "Super Admin", 1]]);
    expect(applyAuditView(mixed, { ...EMPTY_AUDIT_VIEW, role: "platform-owner" }).map((r) => r.id)).toEqual(["m1", "m2"]);
  });
  it("counts actions and entities", () => {
    expect(auditFieldFacets(records, "resourceType").map((f) => f.value).sort()).toEqual(["refund", "settlement", "user"]);
  });
  it("combines role, action, entity and search", () => {
    expect(applyAuditView(records, EMPTY_AUDIT_VIEW)).toHaveLength(3);
    expect(applyAuditView(records, { ...EMPTY_AUDIT_VIEW, role: "platform-owner" }).map((r) => r.id)).toEqual(["2"]);
    expect(applyAuditView(records, { ...EMPTY_AUDIT_VIEW, entity: "settlement" }).map((r) => r.id)).toEqual(["3"]);
    expect(applyAuditView(records, { ...EMPTY_AUDIT_VIEW, action: "refund.decided" }).map((r) => r.id)).toEqual(["1"]);
    expect(applyAuditView(records, { ...EMPTY_AUDIT_VIEW, query: "duplicate" }).map((r) => r.id)).toEqual(["1"]);
    expect(applyAuditView(records, { ...EMPTY_AUDIT_VIEW, query: "OWNER9" }).map((r) => r.id)).toEqual(["2"]);
    expect(applyAuditView(records, { ...EMPTY_AUDIT_VIEW, query: "r-3" }).map((r) => r.id)).toEqual(["3"]);
  });
  it("humanizes actions and picks a tone", () => {
    expect(humanize("refund.decided")).toBe("Refund decided");
    expect(humanize("access.operator-updated")).toBe("Access operator updated");
    expect(humanize("releaseExpiredHolds")).toBe("Release expired holds");
    expect(humanize("")).toBe("—");
    expect(auditTone("case.rejected")).toBe("err");
    expect(auditTone("settlement.approved")).toBe("ok");
    expect(auditTone("legal-hold.released")).toBe("warn");
    expect(auditTone("something.else")).toBe("violet");
  });
});

describe("job cards", () => {
  const rows = [
    adaptJobRun("a1", { job: "releaseExpiredHolds", date: "2026-10-07", lastStatus: "failed" }),
    adaptJobRun("a2", { job: "releaseExpiredHolds", date: "2026-10-09", lastStatus: "ok", runs: 288, failures: 0, lastDurationMs: 420, lastStartedAt: "2026-10-09T05:00:00Z" }),
    adaptJobRun("b1", { job: "dataRetention", date: "2026-10-09", lastStatus: "failed", failures: 1 }),
    adaptJobRun("c1", { job: "sendEventReminders", date: "2026-10-09" }),
  ];
  it("makes one card per job on its newest day, failing first", () => {
    const cards = jobCards(rows);
    expect(cards.map((c) => c.job)).toEqual(["dataRetention", "sendEventReminders", "releaseExpiredHolds"]);
    const holds = cards.find((c) => c.job === "releaseExpiredHolds")!;
    expect(holds).toMatchObject({ recordId: "a2", runs: 288, failures: 0, durationMs: 420, health: { tone: "ok", label: "Healthy" } });
    expect(holds.lastRun?.toISOString()).toBe("2026-10-09T05:00:00.000Z");
    expect(holds.history).toEqual([{ date: "2026-10-07", tone: "err" }]);
  });
  it("never invents counts", () => {
    const reminders = jobCards(rows).find((c) => c.job === "sendEventReminders")!;
    expect(reminders).toMatchObject({ runs: null, failures: null, durationMs: null, lastRun: null, health: { tone: "muted", label: "No result" } });
  });
  it("names known jobs and falls back to a readable name", () => {
    expect(jobInfo("dataRetention").cadence).toBe("Daily");
    expect(jobInfo("retryStuckRefunds")).toMatchObject({ label: "Retry stuck refunds", cadence: null });
    expect(jobHealth({ lastStatus: "ok" }).tone).toBe("ok");
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(420)).toBe("420 ms");
    expect(formatDuration(2500)).toBe("2.5 s");
    expect(formatDuration(125_000)).toBe("2 min 5 s");
  });
});

describe("operator rules", () => {
  const base = { currentRole: "super-admin" as const, currentStatus: "active" as const, self: false, nextRole: null, nextStatus: "active" as const };
  it("reads rows with a console role and a default status", () => {
    const row = toOperatorRow(adaptOperator("uid-12345678", { email: "ops@pulse.test", roleId: "super-admin" }));
    expect(row).toMatchObject({ id: "uid-12345678", name: "ops@pulse.test", role: "super-admin", status: "active" });
    expect(toOperatorRow(adaptOperator("u", { roleId: "mystery", status: "suspended" }))).toMatchObject({ role: null, roleRaw: "mystery", status: "suspended" });
  });
  it("blocks no-op changes and non-console roles", () => {
    expect(planOperatorChange(base).blocked).toMatch(/Nothing to change/);
    expect(planOperatorChange({ ...base, currentRole: null }).blocked).toMatch(/not a console role/);
  });
  it("protects the signed-in operator", () => {
    expect(planOperatorChange({ ...base, self: true, nextRole: "auditor" }).blocked).toMatch(/your own role/);
    expect(planOperatorChange({ ...base, self: true, nextStatus: "suspended" }).blocked).toMatch(/cannot suspend or disable/);
    expect(planOperatorChange({ ...base, self: true, nextStatus: "disabled" }).blocked).toMatch(/cannot suspend or disable/);
  });
  it("asks for the right typed phrase", () => {
    expect(planOperatorChange({ ...base, nextStatus: "suspended" })).toMatchObject({ blocked: null, phrase: "SUSPEND OPERATOR", roleId: "super-admin" });
    expect(planOperatorChange({ ...base, nextStatus: "disabled" }).phrase).toBe("DISABLE OPERATOR");
    expect(planOperatorChange({ ...base, nextRole: "platform-owner" }).phrase).toBe("GRANT PLATFORM OWNER");
    expect(planOperatorChange({ ...base, nextRole: "auditor" }).phrase).toBeNull();
    expect(planOperatorChange({ ...base, currentStatus: "suspended", nextStatus: "active" })).toMatchObject({ blocked: null, phrase: null });
  });
  it("always asks for the grant phrase when the role moves to Platform Owner", () => {
    expect(planOperatorChange({ ...base, currentStatus: "suspended", nextRole: "platform-owner", nextStatus: "suspended" }).phrase).toBe("GRANT PLATFORM OWNER");
    expect(planOperatorChange({ ...base, currentStatus: "suspended", nextRole: "platform-owner", nextStatus: "active" }).phrase).toBe("GRANT PLATFORM OWNER");
  });
  it("does not combine a role change with a phrased status change", () => {
    for (const nextStatus of ["suspended", "disabled"] as const) {
      expect(planOperatorChange({ ...base, nextRole: "platform-owner", nextStatus })).toMatchObject({ phrase: null });
      expect(planOperatorChange({ ...base, nextRole: "platform-owner", nextStatus }).blocked).toMatch(/separate steps/);
      expect(planOperatorChange({ ...base, nextRole: "auditor", nextStatus }).blocked).toMatch(/separate steps/);
    }
  });
  it("describes the consequence", () => {
    const plan = planOperatorChange({ ...base, nextStatus: "suspended" });
    expect(operatorConsequence(plan, base)).toContain("revokes current sessions");
  });
});

describe("legal holds", () => {
  const rows = [
    toHoldRow(adaptLegalHold("user_a", { subjectType: "user", subjectId: "a", status: "released", placedAt: at("2026-10-01T00:00:00Z") })),
    toHoldRow(adaptLegalHold("user_b", { subjectType: "user", subjectId: "b", status: "active", placedAt: at("2026-09-01T00:00:00Z"), reference: "CASE-1" })),
    toHoldRow(adaptLegalHold("user_c", { subjectType: "user", subjectId: "c", status: "active", placedAt: at("2026-10-05T00:00:00Z") })),
  ];
  it("sorts active holds first, newest placed first", () => {
    expect(sortHolds(rows).map((r) => r.subjectId)).toEqual(["c", "b", "a"]);
  });
  it("filters and counts by tab", () => {
    expect(filterHolds(rows, "active")).toHaveLength(2);
    expect(filterHolds(rows, "released").map((r) => r.subjectId)).toEqual(["a"]);
    expect(holdCounts(rows)).toEqual({ active: 2, released: 1, all: 3 });
    expect(rows[1]).toMatchObject({ reference: "CASE-1", releasedAt: null });
    expect(toHoldRow(adaptLegalHold("user_x", { status: "active" }))).toMatchObject({ subjectId: null, subjectType: null });
  });
});

describe("policy ordering", () => {
  it("sorts versions numerically", () => {
    const card = (version: string) => toPolicyCard(adaptGeneric(`p_${version}`, { title: "Refund", policyVersion: version }));
    expect(sortPolicies([card("2"), card("10"), card("9")]).map((c) => c.version)).toEqual(["10", "9", "2"]);
  });
});

describe("policy cards", () => {
  it("reads a title, version, status and extra facts", () => {
    const card = toPolicyCard(adaptGeneric("refund-policy_v3", { title: "Refund policy", policyVersion: "3.0", status: "active", summary: "Refund windows.", effectiveFrom: "2026-09-01", maxDays: 7, auto: true, rules: { windowHours: 24 } }));
    expect(card).toMatchObject({ title: "Refund policy", version: "3.0", status: "active", tone: "ok", summary: "Refund windows.", effectiveFrom: "2026-09-01", rules: { windowHours: 24 } });
    expect(card.facts).toEqual([{ label: "Max days", value: "7" }, { label: "Auto", value: "Yes" }]);
  });
  it("falls back to the id and shows nothing it does not have", () => {
    const card = toPolicyCard(adaptGeneric("cancellation_v1", {}));
    expect(card).toMatchObject({ title: "Cancellation v1", version: null, status: null, summary: null, effectiveFrom: null, rules: null, facts: [] });
  });
});

describe("audit role labels with organizer names", () => {
  it("names org-scoped roles and keeps platform roles", async () => {
    const { auditRoleLabel, auditRoleOrgIds } = await import("@/lib/control");
    expect(auditRoleLabel({ actorRole: "org:abc123:owner" }, { abc123: "Clay & Coffee" })).toBe("Owner · Clay & Coffee");
    expect(auditRoleLabel({ actorRole: "org:abc123:co-host" })).toBe("Co host · org abc123");
    expect(auditRoleLabel({ actorRole: "platform:platform-owner" }, { abc123: "x" })).toBe("Platform Owner");
    expect(auditRoleLabel({ actorRole: "customer" })).toBe("Customer");
    expect(auditRoleOrgIds([{ raw: { actorRole: "org:o1:owner", orgId: "o2" } } as never])).toEqual(["o1", "o2"]);
  });
});
