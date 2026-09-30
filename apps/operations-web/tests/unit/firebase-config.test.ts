import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getFirebaseConfig } from "@/lib/firebase/config";

const complete = {
  NEXT_PUBLIC_FIREBASE_API_KEY: "key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "p.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "p",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "p.appspot.com",
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "1",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:1:web:1",
};

describe("firebase config", () => {
  it("builds the config from the environment", () => {
    expect(getFirebaseConfig(complete)).toEqual({ apiKey: "key", authDomain: "p.firebaseapp.com", projectId: "p", storageBucket: "p.appspot.com", messagingSenderId: "1", appId: "1:1:web:1" });
  });
  it("fails closed with the missing variable name", () => {
    expect(() => getFirebaseConfig({ ...complete, NEXT_PUBLIC_FIREBASE_APP_ID: " " })).toThrow(/NEXT_PUBLIC_FIREBASE_APP_ID/);
  });
  it("never reads NEXT_PUBLIC_* dynamically (Next.js only inlines static process.env.X references)", () => {
    for (const file of ["lib/firebase/config.ts", "lib/firebase/client.ts", "lib/firebase/app-check.ts", "lib/firebase/environment.ts", "lib/firebase/auth.tsx"]) {
      const source = readFileSync(path.resolve(__dirname, "../..", file), "utf8");
      expect(source, file).not.toMatch(/process\.env\[/);
    }
    const config = readFileSync(path.resolve(__dirname, "../../lib/firebase/config.ts"), "utf8");
    for (const key of Object.keys(complete)) expect(config).toContain(`process.env.${key}`);
  });
});
