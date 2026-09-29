import { describe, expect, it } from "vitest";
import { activityToCsv, buildActivityRecord, describeCommand, moduleForCommand } from "./activity";

describe("activity record", () => {
  it("describes commands with target and reason", () => {
    const d = describeCommand("cancelBooking", ["b-12", "Customer asked to cancel"]);
    expect(d.summary).toBe("Cancel booking · b-12");
    expect(d.target).toBe("b-12");
    expect(d.detail).toBe("Customer asked to cancel");
    const p = describeCommand("revokeTemporaryIdentity", [{ identityId: "ti-3", reason: "Duplicate identity" }]);
    expect(p.target).toBe("ti-3");
    expect(p.detail).toBe("Duplicate identity");
  });

  it("assigns modules", () => {
    expect(moduleForCommand("decideGovernanceCase")).toBe("Marketplace governance");
    expect(moduleForCommand("confirmBookingPayment")).toBe("Money");
    expect(moduleForCommand("createVenue")).toBe("Setup");
  });

  it("builds records and escapes CSV", () => {
    const r = buildActivityRecord({ command: "addCatalogNote", args: ["template", "Evening, \"Box\" Cricket", "note"], actorId: "op-1", actorName: "Aditya Rao", roleId: "platform-owner", outcome: "ok" });
    expect(r.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const csv = activityToCsv([r]);
    expect(csv.split("\n")[0]).toContain("actorName");
    expect(csv).toContain('"');
  });
});
