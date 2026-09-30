import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkProductionEnv } from "../../scripts/verify-production-env.mjs";

const production = {
  NEXT_PUBLIC_DATA_MODE: "firebase-live",
  NEXT_PUBLIC_APP_ENV: "production",
  NEXT_PUBLIC_FIREBASE_API_KEY: "AIzaSyExampleExampleExampleExample0000",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "acme-experience-os-prod.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "acme-experience-os-prod",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "acme-experience-os-prod.firebasestorage.app",
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "123456789012",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:123456789012:web:abcdef0123456789",
  NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY: "6LcExampleSiteKeyValue",
  EXPECTED_FIREBASE_PROJECT_ID: "acme-experience-os-prod",
};
const staging = {
  ...production,
  NEXT_PUBLIC_APP_ENV: "staging",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "acme-experience-os-staging.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "acme-experience-os-staging",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "acme-experience-os-staging.firebasestorage.app",
  EXPECTED_FIREBASE_PROJECT_ID: "acme-experience-os-staging",
};

describe("verify-production-env", () => {
  it("accepts a complete, consistent production and staging environment", () => {
    expect(checkProductionEnv(production).errors).toEqual([]);
    expect(checkProductionEnv(staging).errors).toEqual([]);
  });
  it("requires firebase-live and a declared app env", () => {
    expect(checkProductionEnv({ ...production, NEXT_PUBLIC_DATA_MODE: "firebase-emulator" }).errors.join()).toMatch(/firebase-live/);
    expect(checkProductionEnv({ ...production, NEXT_PUBLIC_APP_ENV: "" }).errors.join()).toMatch(/NEXT_PUBLIC_APP_ENV/);
    expect(checkProductionEnv({ ...production, NEXT_PUBLIC_APP_ENV: "prod" }).errors.join()).toMatch(/NEXT_PUBLIC_APP_ENV/);
  });
  it("reports missing variables", () => {
    expect(checkProductionEnv({ ...production, NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY: "" }).errors.join()).toMatch(/NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY/);
  });
  it("refuses demo projects", () => {
    expect(checkProductionEnv({ ...production, NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-experience-os", EXPECTED_FIREBASE_PROJECT_ID: "" }).errors.join()).toMatch(/demo/);
  });
  it("refuses staging values declared as production, and production values declared as staging", () => {
    expect(checkProductionEnv({ ...staging, NEXT_PUBLIC_APP_ENV: "production" }).errors.join()).toMatch(/non-production project/);
    expect(checkProductionEnv({ ...production, NEXT_PUBLIC_APP_ENV: "staging" }).errors.join()).toMatch(/Staging must never point at production/);
  });
  it("checks EXPECTED_FIREBASE_PROJECT_ID exactly and warns when it is unset", () => {
    expect(checkProductionEnv({ ...production, EXPECTED_FIREBASE_PROJECT_ID: "other-prod" }).errors.join()).toMatch(/EXPECTED_FIREBASE_PROJECT_ID/);
    const { errors, warnings } = checkProductionEnv({ ...production, EXPECTED_FIREBASE_PROJECT_ID: "" });
    expect(errors).toEqual([]);
    expect(warnings.join()).toMatch(/EXPECTED_FIREBASE_PROJECT_ID/);
  });
  it("catches an authDomain or bucket from another project", () => {
    expect(checkProductionEnv({ ...production, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "acme-experience-os-staging.firebaseapp.com" }).errors.join()).toMatch(/AUTH_DOMAIN/);
    expect(checkProductionEnv({ ...production, NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "acme-experience-os-staging.appspot.com" }).errors.join()).toMatch(/STORAGE_BUCKET/);
    expect(checkProductionEnv({ ...production, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "console.acme.example" }).errors).toEqual([]);
  });
  it("refuses the archived prototype flag", () => {
    expect(checkProductionEnv({ ...production, NEXT_PUBLIC_SHOW_ARCHIVED_PROTOTYPE: "true" }).errors.join()).toMatch(/ARCHIVED/);
  });
  it("refuses the committed templates until real values are filled in", () => {
    for (const file of [".env.staging.example", ".env.production.example"]) {
      const env = Object.fromEntries(
        readFileSync(path.resolve(__dirname, "../..", file), "utf8")
          .split("\n")
          .filter((line) => /^[A-Z_]+=/.test(line))
          .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
      );
      const { errors } = checkProductionEnv(env);
      expect(errors.join(), file).toMatch(/placeholder/);
    }
  });
  it("the committed templates document every NEXT_PUBLIC_* variable the app reads", () => {
    const used = ["NEXT_PUBLIC_DATA_MODE", "NEXT_PUBLIC_APP_ENV", "NEXT_PUBLIC_SHOW_ARCHIVED_PROTOTYPE", "NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY", "NEXT_PUBLIC_FIREBASE_API_KEY", "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "NEXT_PUBLIC_FIREBASE_PROJECT_ID", "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", "NEXT_PUBLIC_FIREBASE_APP_ID"];
    for (const file of [".env.example", ".env.staging.example", ".env.production.example"]) {
      const text = readFileSync(path.resolve(__dirname, "../..", file), "utf8");
      for (const key of used) expect(text, `${file} documents ${key}`).toMatch(new RegExp(`^${key}=`, "m"));
    }
  });
});
