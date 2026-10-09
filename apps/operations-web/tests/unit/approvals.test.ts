import { describe, expect, it } from "vitest";
import {
  artGradient,
  caseMeta,
  caseQuery,
  liveDecision,
  caseBadge,
  caseCategory,
  caseGlyph,
  caseLane,
  caseTarget,
  experienceDiff,
  isTypingTarget,
  laneCounts,
  laneRecords,
  neighbourId,
  stepSelection,
  toPreview,
} from "@/lib/approvals";

const rec = (id: string, raw: Record<string, unknown>) => ({ id, raw });

const kyc = rec("k1", { kind: "organizer-kyc", status: "pending", summary: "Business organizer · music, food", location: "Bengaluru" });
const kycInfo = rec("k2", { kind: "organizer-kyc", status: "information-requested", summary: "Individual organizer · sports" });
const exp = rec("x1", { kind: "experience-approval", status: "pending", displayValue: "trips · open · 18+" });
const ev = rec("e1", { kind: "event-approval", status: "under-review", location: "HSR Layout, Bengaluru" });
const done = rec("d1", { kind: "organizer-kyc", status: "approved" });
const fraud = rec("f1", { kind: "fraud-alert", status: "pending" });

describe("lanes", () => {
  it("sorts open cases into hosts, experiences and info requested", () => {
    expect(caseLane(kyc.raw)).toBe("hosts");
    expect(caseLane(exp.raw)).toBe("experiences");
    expect(caseLane(ev.raw)).toBe("experiences");
    expect(caseLane(fraud.raw)).toBeNull();
  });
  it("counts only open cases, with info requested across kinds", () => {
    expect(laneCounts([kyc, kycInfo, exp, ev, done, fraud])).toEqual({ all: 5, hosts: 2, experiences: 2, info: 1 });
  });
  it("filters a lane and drops decided cases", () => {
    const all = [kyc, kycInfo, exp, ev, done, fraud];
    expect(laneRecords(all, "all").map((r) => r.id)).toEqual(["k1", "k2", "x1", "e1", "f1"]);
    expect(laneRecords(all, "hosts").map((r) => r.id)).toEqual(["k1", "k2"]);
    expect(laneRecords(all, "info").map((r) => r.id)).toEqual(["k2"]);
  });
  it("puts the longest-waiting case first and undated ones last", () => {
    const at = (iso: string) => ({ toDate: () => new Date(iso) });
    const a = rec("a", { kind: "organizer-kyc", status: "pending", createdAt: at("2026-10-09T10:00:00Z") });
    const b = rec("b", { kind: "organizer-kyc", status: "pending", createdAt: at("2026-10-08T10:00:00Z") });
    const c = rec("c", { kind: "organizer-kyc", status: "pending" });
    expect(laneRecords([c, a, b], "all").map((r) => r.id)).toEqual(["b", "a", "c"]);
  });
});

describe("case presentation", () => {
  it("reads the category from server fields, never inventing one", () => {
    expect(caseCategory(kyc.raw)).toBe("music");
    expect(caseCategory(exp.raw)).toBe("trips");
    expect(caseCategory(ev.raw)).toBeNull();
  });
  it("picks a glyph per kind and category", () => {
    expect(caseGlyph(kyc.raw).emoji).toBe("🪪");
    expect(caseGlyph(exp.raw).emoji).toBe("🏕️");
    expect(caseGlyph(fraud.raw).emoji).toBe("📋");
  });
  it("labels statuses", () => {
    expect(caseBadge("information-requested")).toEqual({ label: "Info requested", tone: "warn" });
    expect(caseBadge("approved").tone).toBe("ok");
    expect(caseBadge(undefined).label).toBe("Pending");
  });
  it("resolves the target, falling back for legacy cases", () => {
    expect(caseTarget({ kind: "organizer-kyc", targetCollection: "organizerApplications", targetId: "u1" })).toEqual({ collection: "organizerApplications", id: "u1" });
    expect(caseTarget({ kind: "organizer-kyc", targetId: "o1" })).toEqual({ collection: "organizers", id: "o1" });
    expect(caseTarget({ kind: "experience-approval" })).toEqual({ collection: "experiences", id: null });
    expect(caseTarget({ kind: "fraud-alert", targetId: "a" })).toEqual({ collection: null, id: "a" });
  });
});

describe("selection", () => {
  const ids = ["a", "b", "c"];
  it("moves with J/K and clamps at the ends", () => {
    expect(stepSelection(ids, "a", 1)).toBe("b");
    expect(stepSelection(ids, "c", 1)).toBe("c");
    expect(stepSelection(ids, "a", -1)).toBe("a");
    expect(stepSelection(ids, null, 1)).toBe("a");
    expect(stepSelection(ids, "zz", -1)).toBe("a");
    expect(stepSelection([], "a", 1)).toBeNull();
  });
  it("advances to the next case after a decision, else the previous one", () => {
    expect(neighbourId(ids, "b")).toBe("c");
    expect(neighbourId(ids, "c")).toBe("b");
    expect(neighbourId(["a"], "a")).toBeNull();
    expect(neighbourId(ids, "zz")).toBe("a");
  });
  it("ignores shortcuts while typing", () => {
    expect(isTypingTarget({ tagName: "INPUT" })).toBe(true);
    expect(isTypingTarget({ tagName: "TEXTAREA" })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(isTypingTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("experience preview", () => {
  const doc = {
    title: "Sunday Box Cricket",
    tagline: "Six-a-side",
    category: "sports",
    activity: "Box cricket",
    description: "Fast cricket.",
    highlights: ["Floodlit turf", 4],
    format: "Mixed teams of six",
    genderRule: "women-only",
    ageMin: 18,
    ageMax: 30,
    idRequired: true,
    rules: ["Tennis ball only"],
    bring: ["Water"],
    safety: { level: "medium", measures: ["First aid"] },
    cancellationPolicy: "strict",
    coverStyle: { seed: 11 },
    organizerName: "Weekend Cricket Club",
  };
  it("maps backend fields the way the PULSE app reads them", () => {
    const p = toPreview(doc);
    expect(p.title).toBe("Sunday Box Cricket");
    expect(p.highlights).toEqual(["Floodlit turf"]);
    expect(p.gender).toEqual({ label: "Women only", body: "This experience is reserved for women." });
    expect(p.age).toEqual({ label: "18–30", body: "Open to ages 18 to 30." });
    expect(p.format.label).toBe("Group experience");
    expect(p.safety.label).toBe("Moderate activity");
    expect(p.cancellation.label).toBe("Strict");
    expect(p.cancellation.rules).toHaveLength(2);
    expect(p.seed).toBe(11);
    expect(p.host).toBe("Weekend Cricket Club");
  });
  it("shows a dash for missing fields", () => {
    const p = toPreview({});
    expect(p.title).toBe("—");
    expect(p.tagline).toBeNull();
    expect(p.age.label).toBe("—");
    expect(p.highlights).toEqual([]);
    expect(p.host).toBeNull();
  });
  it("builds a category gradient like the app's generated art", () => {
    const g = artGradient("sports", 11);
    expect(g).toMatch(/^linear-gradient\(\d+deg, #b6f04a 0%, #[0-9a-f]{6} 55%, #[0-9a-f]{6} 100%\)$/);
    expect(artGradient("unknown", 0)).toContain("#8e72ff");
  });
});

describe("experienceDiff", () => {
  it("lists only changed content fields", () => {
    const before = { title: "A", tagline: "x", highlights: ["1"], safety: { level: "low", measures: [] }, version: 1 };
    const after = { title: "A", tagline: "y", highlights: ["1", "2"], safety: { level: "medium", measures: ["kit"] }, version: 2 };
    const diff = experienceDiff(before, after);
    expect(diff.map((d) => d.label)).toEqual(["Tagline", "Highlights", "Safety"]);
    expect(diff[1]).toMatchObject({ before: "1", after: "1 · 2" });
    expect(diff[2]).toMatchObject({ before: "low", after: "medium — kit" });
  });
  it("treats a missing field as a dash", () => {
    expect(experienceDiff({}, { tagline: "new" })).toEqual([{ field: "tagline", label: "Tagline", before: "—", after: "new" }]);
  });
});

describe("selection state", () => {
  it("drops ?case= when a decision leaves nothing to select", () => {
    expect(caseQuery("case=a&view=x", null)).toBe("view=x");
    expect(caseQuery("case=a", null)).toBe("");
    expect(caseQuery("", "b")).toBe("case=b");
    expect(caseQuery("case=a", "b")).toBe("case=b");
  });
  it("releases an open decision whose case left the live list", () => {
    const d = { caseId: "a", outcome: "approved" };
    expect(liveDecision(d, new Set(["a", "b"]))).toBe(d);
    expect(liveDecision(d, new Set(["b"]))).toBeNull();
    expect(liveDecision(null, new Set(["a"]))).toBeNull();
  });
});

describe("caseMeta", () => {
  const now = new Date("2026-10-09T10:00:00Z");
  const at = (iso: string) => ({ toDate: () => new Date(iso) });
  it("uses the case city when there is one", () => {
    expect(caseMeta({ kind: "organizer-kyc", location: "Pune", summary: "Business organizer · trips", createdAt: at("2026-10-09T09:50:00Z") }, now)).toBe("Pune · trips · 10 min ago");
  });
  it("labels the organizer as host when an experience case has no city", () => {
    expect(caseMeta({ kind: "experience-approval", location: null, organizerName: "Clay & Coffee", displayValue: "workshops · open · 16+" }, null)).toBe("by Clay & Coffee · workshops");
  });
  it("shows a dash when nothing is known", () => {
    expect(caseMeta({}, null)).toBe("—");
  });
});

describe("caseDecisionKey (ruling R16)", () => {
  it("changes with the outcome and the version decided against", async () => {
    const { caseDecisionKey } = await import("@/lib/approvals");
    const rec = { id: "case1", version: 3, raw: { status: "open" } };
    expect(caseDecisionKey(rec, "approved")).toBe("case|case1|approved|3|open");
    expect(caseDecisionKey(rec, "approved")).toBe(caseDecisionKey({ ...rec }, "approved"));
    expect(caseDecisionKey({ ...rec, version: 4 }, "approved")).not.toBe(caseDecisionKey(rec, "approved"));
    expect(caseDecisionKey(rec, "rejected")).not.toBe(caseDecisionKey(rec, "approved"));
  });
});

describe("organizer codes", () => {
  it("labels activation and keys a re-issue on the application state", async () => {
    const { applicationActivation, reissueCodeKey } = await import("@/lib/approvals");
    expect(applicationActivation({ status: "approved", orgId: "o1", activationPending: true }).label).toBe("Code issued, not redeemed");
    expect(applicationActivation({ status: "approved", orgId: "o1", activationPending: false }).label).toBe("Activated");
    expect(applicationActivation({ status: "submitted" }).label).toBe("No code");
    const rec = { id: "uid_1", version: 2, raw: { status: "approved", activationPending: true } };
    expect(reissueCodeKey(rec)).toBe("reissue-code|uid_1|approved|2|true");
    expect(reissueCodeKey({ ...rec, version: 3 })).not.toBe(reissueCodeKey(rec));
  });
});
