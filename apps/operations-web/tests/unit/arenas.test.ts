import { describe, expect, it } from "vitest";
import { arenaCounts, arenaStatusActions, arenaStatusBadge, filterArenas, sortArenas, toArena } from "@/lib/arenas";

const a = toArena("a1", { name: "Turf Park", city: "Bengaluru", capacity: 120, status: "active", version: 2, sports: ["cricket"], orgId: "o1" });
const b = toArena("a2", { name: "HSR Arena", status: "paused", capacity: "lots", version: 1.5 });
const c = toArena("a3", { status: "under-review" });
const d = toArena("a4", { name: "Zed", status: "blocked", statusReason: "unsafe" });
const e = toArena("a5", { name: "Appr", status: "approved" });

// The exact shape seed-governance-emulator.mjs writes (ADR-0003 flat display documents).
const godavari = toArena("arena-godavari", { name: "Godavari Indoor Stadium", status: "under-review", location: "Rajahmundry, Andhra Pradesh", displayValue: "8,000 capacity", summary: "Fire NOC pending", version: 0 });

describe("toArena", () => {
  it("maps the flat display fields without parsing displayValue", () => {
    expect(godavari).toMatchObject({ name: "Godavari Indoor Stadium", city: "Rajahmundry, Andhra Pradesh", address: "Rajahmundry, Andhra Pradesh", capacity: null, capacityText: "8,000 capacity", summary: "Fire NOC pending", version: 0 });
    expect(filterArenas([godavari], "all", "noc")).toHaveLength(1);
    expect(toArena("x", { location: "Pune", city: "Goa", capacity: 5, displayValue: "x" })).toMatchObject({ city: "Goa", capacity: 5 });
  });
  it("notes the open verification case when approving", () => {
    expect(arenaStatusActions("under-review")[0].consequence).toContain("verification case in Approvals stays open");
    expect(arenaStatusActions("paused")[0].consequence).not.toContain("Approvals");
  });
  it("reads known fields and never invents missing ones", () => {
    expect(a).toMatchObject({ name: "Turf Park", city: "Bengaluru", capacity: 120, version: 2, ownerId: "o1", sports: ["cricket"] });
    expect(b).toMatchObject({ name: "HSR Arena", city: null, capacity: null, version: 0 });
    expect(c.name).toBe("—");
    expect(d.statusReason).toBe("unsafe");
  });
});

describe("filters", () => {
  const all = [a, b, c, d, e];
  it("counts by bucket", () => {
    expect(arenaCounts(all)).toEqual({ all: 5, active: 1, approved: 1, review: 1, paused: 1, blocked: 1 });
  });
  it("filters by status and searches", () => {
    expect(filterArenas(all, "review", "").map((x) => x.id)).toEqual(["a3"]);
    expect(filterArenas(all, "all", "bengal").map((x) => x.id)).toEqual(["a1"]);
    expect(filterArenas(all, "active", "hsr")).toEqual([]);
  });
  it("sorts usable arenas first", () => {
    expect(sortArenas(all).map((x) => x.id)).toEqual(["a1", "a5", "a3", "a2", "a4"]);
  });
});

describe("arenaStatusActions", () => {
  it("never offers under-review or resolved and hides no-ops", () => {
    expect(arenaStatusActions("active").map((x) => x.status)).toEqual(["paused", "blocked"]);
    expect(arenaStatusActions("paused").map((x) => x.status)).toEqual(["active", "blocked"]);
    expect(arenaStatusActions("blocked").map((x) => x.status)).toEqual(["active"]);
    expect(arenaStatusActions("under-review")[0]).toMatchObject({ status: "active", label: "Approve" });
    expect(arenaStatusActions(undefined).map((x) => x.status)).toEqual(["active", "paused", "blocked"]);
  });
  it("requires the BLOCK phrase only for blocking", () => {
    expect(arenaStatusActions("active").map((x) => x.phrase)).toEqual([null, "BLOCK"]);
  });
});

describe("arenaStatusBadge", () => {
  it("labels approved and falls back to the shared badge", () => {
    expect(arenaStatusBadge("approved")).toEqual({ label: "Approved", tone: "violet" });
    expect(arenaStatusBadge("active").label).toBe("Active");
    expect(arenaStatusBadge(null).label).toBe("—");
  });
});
