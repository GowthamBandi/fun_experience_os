import { describe, expect, it } from "vitest";
import { resolveAppEnvironment } from "@/lib/firebase/environment";

describe("environment badge", () => {
  it("labels emulator, staging and production distinctly", () => {
    expect(resolveAppEnvironment({ dataMode: "firebase-emulator", appEnv: "production", projectId: "demo-experience-os" }).id).toBe("emulator");
    const staging = resolveAppEnvironment({ dataMode: "firebase-live", appEnv: "staging", projectId: "acme-experience-os-staging" });
    expect(staging).toMatchObject({ id: "staging", label: "Staging", tone: "warn", projectId: "acme-experience-os-staging" });
    const production = resolveAppEnvironment({ dataMode: "firebase-live", appEnv: " Production ", projectId: "acme-experience-os-prod" });
    expect(production).toMatchObject({ id: "production", label: "Production", tone: "danger" });
  });
  it("flags a live build whose environment is not declared", () => {
    expect(resolveAppEnvironment({ dataMode: "firebase-live", appEnv: undefined, projectId: "x" }).id).toBe("undeclared");
  });
  it("is hidden when the console is not configured", () => {
    expect(resolveAppEnvironment({ dataMode: undefined, appEnv: "production", projectId: undefined }).id).toBe("unconfigured");
  });
});
