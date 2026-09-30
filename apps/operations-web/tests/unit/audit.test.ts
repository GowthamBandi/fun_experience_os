import { describe, expect, it } from "vitest";
import { EMPTY_AUDIT_FILTER, auditFacets, filterAudit, mergeAuditPages } from "@/lib/console/audit";
import { adaptAudit, adaptOperator } from "@/lib/console/records";

const ts = (seconds: number) => ({ seconds, toMillis: () => seconds * 1000 });
const event = (id: string, seconds: number, data: Record<string, unknown> = {}) =>
  adaptAudit(id, { action: "refund.decided", actorUid: "admin1", actorRole: "platform:super-admin", resourceType: "refund", resourceId: `r-${id}`, orgId: "org_a", at: ts(seconds), ...data });

describe("audit adapter", () => {
  it("shows action, resource, organizer and actor", () => {
    const record = event("1", 100, { reason: "Duplicate charge" });
    expect(record.primary).toBe("refund.decided");
    expect(record.secondary).toBe("refund/r-1 · org org_a");
    expect(record.meta).toContain("admin1 (platform:super-admin)");
    expect(record.meta).toContain("Duplicate charge");
  });
  it("reads the schema v1 actorRoleId too", () => {
    expect(adaptAudit("x", { action: "governance.case-decided", actorUid: "u", actorRoleId: "platform-owner" }).meta).toContain("(platform-owner)");
  });
});

describe("audit filters", () => {
  const records = [
    event("1", 300),
    event("2", 200, { action: "settlement.approved", resourceType: "settlement", orgId: "org_b" }),
    event("3", 100, { action: "access.operator-updated", resourceType: "user", resourceId: "uid-12345678", orgId: null }),
  ];
  it("lists facets from what is loaded", () => {
    expect(auditFacets(records)).toEqual({ actions: ["access.operator-updated", "refund.decided", "settlement.approved"], resourceTypes: ["refund", "settlement", "user"] });
  });
  it("filters by action, resource type and organizer/resource/actor id", () => {
    expect(filterAudit(records, EMPTY_AUDIT_FILTER)).toHaveLength(3);
    expect(filterAudit(records, { ...EMPTY_AUDIT_FILTER, action: "settlement.approved" }).map((r) => r.id)).toEqual(["2"]);
    expect(filterAudit(records, { ...EMPTY_AUDIT_FILTER, resourceType: "user" }).map((r) => r.id)).toEqual(["3"]);
    expect(filterAudit(records, { ...EMPTY_AUDIT_FILTER, subject: "ORG_B" }).map((r) => r.id)).toEqual(["2"]);
    expect(filterAudit(records, { ...EMPTY_AUDIT_FILTER, subject: "uid-1234" }).map((r) => r.id)).toEqual(["3"]);
  });
  it("merges live and older pages without duplicates, newest first", () => {
    const live = [event("5", 500), event("4", 400)];
    const retained = [event("4", 400), event("3", 300), event("2", 200)];
    expect(mergeAuditPages(live, retained).map((r) => r.id)).toEqual(["5", "4", "3", "2"]);
  });
});

describe("operator adapter", () => {
  it("maps suspended/disabled to distinct statuses", () => {
    expect(adaptOperator("u1", { displayName: "A", email: "a@x", roleId: "super-admin", status: "suspended" }).status).toBe("Paused");
    expect(adaptOperator("u1", { email: "a@x", roleId: "auditor", status: "disabled" }).status).toBe("Blocked");
    expect(adaptOperator("u1", { email: "a@x", roleId: "auditor", status: "active" })).toMatchObject({ status: "Approved", primary: "a@x", value: "auditor" });
  });
});
