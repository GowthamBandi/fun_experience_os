import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { POLICIES_IN_FORCE } from "@/lib/console/policies-in-force";

describe("policies in force", () => {
  it("match the backend version constants", () => {
    for (const p of POLICIES_IN_FORCE) {
      if (!p.source) continue;
      const [file, name] = p.source;
      const src = readFileSync(resolve(__dirname, "../../../../firebase/functions/src", file), "utf8");
      const m = src.match(new RegExp(`export const ${name} = "([^"]+)"`));
      expect(m?.[1], `${name} in ${file}`).toBe(p.version);
    }
  });
});
