import { describe, expect, it } from "vitest";
import { buildAttentionQueue, isOpenCase, isOpenRisk, OPEN_CASE_STATUS_LIST, OPEN_RISK_STATUS_LIST, OPEN_SETTLEMENT_STATUS_LIST } from "@/lib/console/attention";
import { refundStage } from "@/lib/console/records";
import { truncatedCopy } from "@/lib/format";
import { laneRecords } from "@/lib/approvals";
import { capRows, LIST_SPECS, listOrder, listSpec, OPEN_SPECS, QUERY_LIMIT, type ListSpec } from "@/lib/governance-query";

describe("capped list specs", () => {
  it("orders the lists the console caps newest first on a backend-written timestamp", () => {
    const expected = {
      governanceCases: "createdAt",
      riskAlerts: "createdAt",
      commercialAgreements: "createdAt",
      organizers: "createdAt",
      arenas: "createdAt",
      policyVersions: "createdAt",
      organizerApplications: "createdAt",
      refunds: "createdAt",
      settlements: "createdAt",
      auditEvents: "at",
      reviews: "updatedAt",
      legalHolds: "updatedAt",
      jobRuns: "updatedAt",
    } as const;
    for (const [name, field] of Object.entries(expected)) {
      const spec = listSpec(name as keyof typeof expected);
      expect(spec, name).toMatchObject({ path: name, order: { field, direction: "desc" } });
      expect(spec.statusIn, name).toBeUndefined();
      expect(listOrder(spec), name).toBe("newest");
    }
  });
  it("keeps operators on one equality filter (no composite) and says it has no order", () => {
    const spec = listSpec("operators");
    expect(spec).toEqual({ path: "users", equals: { field: "scope", value: "platform" } });
    expect(listOrder(spec)).toBeNull();
  });
  it("never combines an equality filter with an ordering in the all-items lists (that would need a composite)", () => {
    for (const [name, spec] of Object.entries(LIST_SPECS)) expect(!!spec.equals && !!spec.order, name).toBe(false);
  });
});

describe("open-item specs (Approvals inbox, rail badges, Needs-you)", () => {
  it("filters open statuses server-side, longest-waiting first", () => {
    expect(listSpec("governanceCases", "open")).toEqual({ path: "governanceCases", statusIn: ["pending", "under-review", "information-requested"], order: { field: "createdAt", direction: "asc" } });
    expect(listSpec("refunds", "open")).toMatchObject({ statusIn: ["under-review"], order: { field: "createdAt", direction: "asc" } });
    expect(listSpec("settlements", "open")).toMatchObject({ statusIn: ["pending-approval", "approved", "held"], order: { field: "createdAt", direction: "asc" } });
    expect(listSpec("riskAlerts", "open")).toMatchObject({ statusIn: OPEN_RISK_STATUS_LIST, order: { field: "createdAt", direction: "asc" } });
    for (const spec of Object.values(OPEN_SPECS)) {
      expect(listOrder(spec!)).toBe("oldest");
      expect(spec!.statusIn!.length).toBeLessThanOrEqual(30); // Firestore `in` limit
    }
    expect(() => listSpec("reviews", "open")).toThrow(/No open-item read/);
  });
  it("matches what the client-side predicates count as open", () => {
    for (const status of OPEN_CASE_STATUS_LIST) expect(isOpenCase({ status })).toBe(true);
    for (const status of ["approved", "rejected"]) expect(isOpenCase({ status })).toBe(false);
    for (const status of OPEN_RISK_STATUS_LIST) expect(isOpenRisk({ status })).toBe(true);
    for (const status of ["resolved", "closed", "dismissed", "blocked"]) expect(OPEN_RISK_STATUS_LIST as readonly string[]).not.toContain(status);
    for (const status of ["accruing", "paid", "empty"]) expect(OPEN_SETTLEMENT_STATUS_LIST as readonly string[]).not.toContain(status);
    // Only under-review refunds can need a decision.
    for (const status of ["requested", "approved", "processing", "completed", "rejected", "failed"]) expect(refundStage({ status })).toBe("decided");
  });
  it("loses no attention item when only open statuses are read", () => {
    const doc = (id: string, raw: Record<string, unknown>) => ({ id, raw });
    const all = {
      governanceCases: [doc("c1", { kind: "organizer-kyc", status: "pending" }), doc("c2", { kind: "organizer-kyc", status: "approved" })],
      riskAlerts: [doc("r1", { status: "open", severity: "high" }), doc("r2", { status: "resolved", severity: "high" })],
      refunds: [doc("f1", { status: "under-review", amountMinor: 1000 }), doc("f2", { status: "completed" })],
      settlements: [doc("s1", { status: "held" }), doc("s2", { status: "approved", netMinor: 1 }), doc("s3", { status: "paid" })],
    };
    const keep = (list: typeof all.governanceCases, statuses: readonly string[]) => list.filter((d) => statuses.includes(String(d.raw.status)));
    const open = {
      governanceCases: keep(all.governanceCases, OPEN_SPECS.governanceCases!.statusIn!),
      riskAlerts: keep(all.riskAlerts, OPEN_SPECS.riskAlerts!.statusIn!),
      refunds: keep(all.refunds, OPEN_SPECS.refunds!.statusIn!),
      settlements: keep(all.settlements, OPEN_SPECS.settlements!.statusIn!),
    };
    expect(buildAttentionQueue(open)).toEqual(buildAttentionQueue(all));
  });
});

describe("open cases above the cap", () => {
  /** What Firestore returns for `spec` with limit(max + 1): docs sorted by the spec's order field. */
  const read = (docs: { id: string; raw: { createdAt: Date } & Record<string, unknown> }[], spec: ListSpec) => {
    const dir = spec.order?.direction === "desc" ? -1 : 1;
    const sorted = [...docs].sort((a, b) => dir * (a.raw.createdAt.getTime() - b.raw.createdAt.getTime()));
    return capRows(sorted.slice(0, QUERY_LIMIT + 1));
  };
  const day = 86_400_000;
  const base = Date.UTC(2026, 0, 1);
  // 300 open KYC cases, c0 submitted first (waiting longest).
  const cases = Array.from({ length: QUERY_LIMIT + 50 }, (_, i) => ({ id: `c${i}`, raw: { kind: "organizer-kyc", status: "pending", createdAt: new Date(base + i * day) } }));

  it("keeps the longest-waiting cases at the top of the inbox", () => {
    const { rows, truncated } = read(cases, listSpec("governanceCases", "open"));
    expect(truncated).toBe(true);
    const inbox = laneRecords(rows, "all").map((r) => r.id);
    expect(inbox).toHaveLength(QUERY_LIMIT);
    expect(inbox[0]).toBe("c0");
    expect(inbox.at(-1)).toBe(`c${QUERY_LIMIT - 1}`);
  });
  it("cuts the most recently submitted cases, not the most overdue, in every open read", () => {
    for (const spec of Object.values(OPEN_SPECS)) {
      const ids = read(cases, spec!).rows.map((r) => r.id);
      expect(ids, spec!.path).toContain("c0");
      expect(ids, spec!.path).not.toContain(`c${QUERY_LIMIT + 49}`);
    }
  });
});

describe("capRows (+1 probe)", () => {
  const n = (count: number) => Array.from({ length: count }, (_, i) => i);
  it("is not truncated at exactly the limit", () => {
    expect(capRows(n(QUERY_LIMIT))).toEqual({ rows: n(QUERY_LIMIT), truncated: false });
    expect(capRows(n(3), 3).truncated).toBe(false);
  });
  it("is truncated only when the probe came back, and never shows the probe", () => {
    const out = capRows(n(QUERY_LIMIT + 1));
    expect(out.truncated).toBe(true);
    expect(out.rows).toHaveLength(QUERY_LIMIT);
    expect(out.rows.at(-1)).toBe(QUERY_LIMIT - 1);
  });
  it("handles short and empty reads", () => {
    expect(capRows([], 5)).toEqual({ rows: [], truncated: false });
    expect(capRows(n(2), 5)).toEqual({ rows: [0, 1], truncated: false });
  });
});

describe("truncatedCopy", () => {
  it("names the order the read actually has and never promises filters fetch more", () => {
    expect(truncatedCopy(250, "newest", "reviews")).toBe("Showing the newest 250 reviews.");
    expect(truncatedCopy(250, "oldest", "open cases")).toBe("Showing the 250 longest-waiting open cases.");
    expect(truncatedCopy(250, null)).toBe("Showing the first 250 records.");
    expect(truncatedCopy(1500, null, "events")).toBe("Showing the first 1,500 events.");
    expect(truncatedCopy(250, "newest")).not.toMatch(/filter/i);
  });
});
