import { describe, expect, it } from "vitest";
import { friendlyAuthError } from "@/lib/console/auth-errors";

describe("friendlyAuthError", () => {
  const mismatch = "That email and password don't match. Try again or reset your password.";
  it("maps credential failures", () => {
    for (const code of ["auth/wrong-password", "auth/invalid-credential", "auth/user-not-found"]) {
      expect(friendlyAuthError({ code })).toBe(mismatch);
    }
  });
  it("maps the other known codes", () => {
    expect(friendlyAuthError({ code: "auth/too-many-requests" })).toBe("Too many attempts. Wait a minute, then try again.");
    expect(friendlyAuthError({ code: "auth/network-request-failed" })).toBe("Can't reach the sign-in service. Check your connection.");
    expect(friendlyAuthError({ code: "auth/user-disabled" })).toBe("This operator account is disabled. Ask a platform owner.");
    expect(friendlyAuthError({ code: "auth/invalid-email" })).toBe("That doesn't look like an email address.");
  });
  it("falls back without leaking raw text", () => {
    expect(friendlyAuthError(new Error("Firebase: Error (auth/weird).")))
      .toBe("Sign-in didn't work. Try again.");
    expect(friendlyAuthError(undefined)).toBe("Sign-in didn't work. Try again.");
  });
});
