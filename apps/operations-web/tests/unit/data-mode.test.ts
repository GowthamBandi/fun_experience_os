import { describe, expect, it } from "vitest";
import { DATA_MODE_REQUIRED_MESSAGE, configurationProblemFromError, dataModeProblem } from "@/lib/firebase/data-mode";

describe("dataModeProblem", () => {
  it("accepts the two Firebase modes", () => {
    expect(dataModeProblem("firebase-emulator")).toBeNull();
    expect(dataModeProblem("firebase-live")).toBeNull();
  });
  it("explains prototype, unset and unknown modes with the required configuration", () => {
    for (const raw of [undefined, "", "prototype", "live"]) {
      const problem = dataModeProblem(raw);
      expect(problem).not.toBeNull();
      expect(problem!.message).toContain(DATA_MODE_REQUIRED_MESSAGE);
    }
    expect(dataModeProblem(undefined)!.message).toContain("unset");
    expect(dataModeProblem("prototype")!.message).toContain("prototype");
  });
  it("classifies Firebase config errors as configuration problems", () => {
    expect(configurationProblemFromError('[Firebase] Required environment variable "NEXT_PUBLIC_FIREBASE_API_KEY" is missing')).not.toBeNull();
    expect(configurationProblemFromError("Network down")).toBeNull();
  });
});
