import { describe, expect, it } from "vitest";
import { CommandValidationError, buildSetOperatorAccessPayload } from "@/lib/console/actions";

const base = { uid: "abcdefgh1234", roleId: "super-admin", status: "active", reason: "Second admin for dual control" };

describe("setOperatorAccess payload", () => {
  it("builds the exact server contract", () => {
    expect(buildSetOperatorAccessPayload({ ...base, uid: "  abcdefgh1234 " })).toEqual({ uid: "abcdefgh1234", roleId: "super-admin", status: "active", reason: "Second admin for dual control" });
  });
  it("mirrors the server validators", () => {
    expect(() => buildSetOperatorAccessPayload({ ...base, uid: "short" })).toThrow(CommandValidationError);
    expect(() => buildSetOperatorAccessPayload({ ...base, roleId: "customer" })).toThrow(/Platform Owner, Super Admin or Auditor/);
    expect(() => buildSetOperatorAccessPayload({ ...base, status: "paused" })).toThrow(/active, suspended or disabled/);
    expect(() => buildSetOperatorAccessPayload({ ...base, reason: "too short" })).toThrow(/at least 10/);
    expect(() => buildSetOperatorAccessPayload({ ...base, reason: "x".repeat(1001) })).toThrow(/at most 1000/);
  });
  it("refuses suspending or disabling yourself (the server refuses too)", () => {
    expect(() => buildSetOperatorAccessPayload({ ...base, status: "disabled", actorUid: "abcdefgh1234" })).toThrow(/your own account/);
    expect(buildSetOperatorAccessPayload({ ...base, status: "disabled", actorUid: "someoneelse1" }).status).toBe("disabled");
  });
});
