/**
 * Console operators must have signed in with their authenticator-app code
 * (Firebase TOTP second factor): a password alone never reaches admin actions.
 */
import { hasOperatorSecondFactor } from "../src/platform/auth";
import * as commerce from "../src/commerce";
import { callCode, rid, uniq } from "./commerce-helpers";

jest.setTimeout(60_000);

const ctx = (token: Record<string, unknown>) => ({ auth: { uid: uniq("op"), token }, rawRequest: {} }) as never;
const base = { roleId: "super-admin", email_verified: true, email: "ops@example.in" };

describe("operator second factor", () => {
  test("an admin signed in with password only is refused", async () => {
    const code = await callCode(commerce.buildSettlement, { requestId: rid(), orgId: "org-x", periodEnd: new Date().toISOString() }, ctx(base));
    expect(code).toBe("NOT_PERMITTED");
  });

  test("an SMS second factor is not enough; only the authenticator app counts", () => {
    expect(hasOperatorSecondFactor({ ...base, firebase: { sign_in_second_factor: "phone" } }, { emulated: false, projectId: "experience-os-staging" })).toBe(false);
    expect(hasOperatorSecondFactor({ ...base, firebase: { sign_in_second_factor: "totp" } }, { emulated: false, projectId: "experience-os-staging" })).toBe(true);
  });

  test("seeded @pulse.test logins skip it only in a local demo- emulator project", () => {
    const seed = { ...base, email: "admin@pulse.test" };
    expect(hasOperatorSecondFactor(seed, { emulated: true, projectId: "demo-experience-os" })).toBe(true);
    expect(hasOperatorSecondFactor(seed, { emulated: false, projectId: "demo-experience-os" })).toBe(false);
    expect(hasOperatorSecondFactor(seed, { emulated: true, projectId: "experience-os-staging" })).toBe(false);
    expect(hasOperatorSecondFactor(base, { emulated: true, projectId: "demo-experience-os" })).toBe(false);
  });
});
