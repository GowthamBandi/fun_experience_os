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
  it("maps the authenticator-app (second step) codes", () => {
    expect(friendlyAuthError({ code: "auth/invalid-verification-code" })).toBe("That code didn't match. Enter the current 6-digit code from your authenticator app.");
    expect(friendlyAuthError({ code: "auth/missing-code" })).toBe("Enter the 6-digit code from your authenticator app.");
    expect(friendlyAuthError({ code: "auth/requires-recent-login" })).toBe("For your safety this needs a fresh sign-in. Sign out, sign in again, then try once more.");
    expect(friendlyAuthError({ code: "auth/operation-not-allowed" })).toBe("Authenticator-app sign-in isn't switched on for this project yet. Ask a platform owner.");
    expect(friendlyAuthError({ code: "auth/code-expired" })).toBe("That code expired. Enter the newest code from your authenticator app.");
  });
  it("uses the caller's fallback for unknown codes (setup isn't sign-in)", () => {
    expect(friendlyAuthError({ code: "auth/internal-error" }, "The setup couldn't start. Try again in a minute.")).toBe("The setup couldn't start. Try again in a minute.");
    expect(friendlyAuthError({ code: "auth/invalid-verification-code" }, "x")).toBe("That code didn't match. Enter the current 6-digit code from your authenticator app.");
  });
  it("falls back without leaking raw text", () => {
    expect(friendlyAuthError(new Error("Firebase: Error (auth/weird).")))
      .toBe("Sign-in didn't work. Try again.");
    expect(friendlyAuthError(undefined)).toBe("Sign-in didn't work. Try again.");
  });
});
