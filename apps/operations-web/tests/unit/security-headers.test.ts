import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, securityHeaders } from "../../security-headers.mjs";

const header = (headers: { key: string; value: string }[], key: string) => headers.find((h) => h.key === key)?.value;

describe("security headers", () => {
  it("sets the standard hardening headers", () => {
    const headers = securityHeaders({ dataMode: "firebase-live", authDomain: "acme-experience-os-prod.firebaseapp.com" });
    expect(header(headers, "X-Frame-Options")).toBe("DENY");
    expect(header(headers, "X-Content-Type-Options")).toBe("nosniff");
    expect(header(headers, "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(header(headers, "Strict-Transport-Security")).toMatch(/max-age=\d+/);
    expect(header(headers, "Permissions-Policy")).toContain("camera=()");
  });
  it("allows the Firebase + reCAPTCHA Enterprise endpoints and nothing broad", () => {
    const csp = buildContentSecurityPolicy({ dataMode: "firebase-live" });
    for (const host of ["https://identitytoolkit.googleapis.com", "https://securetoken.googleapis.com", "https://firestore.googleapis.com", "https://*.cloudfunctions.net", "https://*.run.app", "https://content-firebaseappcheck.googleapis.com"]) {
      expect(csp).toContain(host);
    }
    expect(csp).toMatch(/script-src [^;]*https:\/\/www\.google\.com\/recaptcha\//);
    expect(csp).toMatch(/frame-src [^;]*https:\/\/\*\.firebaseapp\.com/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toMatch(/(^|\s)\*(\s|;|$)/);
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toContain("127.0.0.1");
    expect(csp).toContain("upgrade-insecure-requests");
  });
  it("adds a custom auth domain to frame-src", () => {
    expect(buildContentSecurityPolicy({ dataMode: "firebase-live", authDomain: "auth.acme.example" })).toMatch(/frame-src [^;]*https:\/\/auth\.acme\.example/);
  });
  it("allows the local emulators only in emulator mode, and never upgrades or pins HSTS locally", () => {
    const csp = buildContentSecurityPolicy({ dataMode: "firebase-emulator" });
    expect(csp).toContain("http://127.0.0.1:9099");
    expect(csp).not.toContain("upgrade-insecure-requests");
    expect(header(securityHeaders({ dataMode: "firebase-emulator" }), "Strict-Transport-Security")).toBeUndefined();
    expect(buildContentSecurityPolicy({}).includes("upgrade-insecure-requests")).toBe(false);
  });
  it("relaxes eval only for next dev", () => {
    expect(buildContentSecurityPolicy({ dataMode: "firebase-emulator", dev: true })).toContain("'unsafe-eval'");
  });
});
