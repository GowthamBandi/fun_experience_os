import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Every firebase-admin service getter must be handed app() (platform/firestore.ts),
 * which initialises Firebase on a fresh instance. A bare getAuth() worked in the
 * test harness (something else had initialised it) and crashed live on staging
 * with app/no-app when a cold instance served deleteMyAccount first.
 */
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") ? [p] : [];
  });

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

test("no firebase-admin getter is called without app()", () => {
  const bare = files(join(__dirname, "../src")).flatMap((f) => {
    const src = stripComments(readFileSync(f, "utf8"));
    return [...src.matchAll(/\bget(Auth|Firestore|Messaging|Storage|AppCheck|RemoteConfig)\(\s*\)/g)].map((m) => `${f.split("/src/")[1]}: ${m[0]}`);
  });
  expect(bare).toEqual([]);
});
