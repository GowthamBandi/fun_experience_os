/**
 * Seeds the Auth + Firestore emulators with the marketplace governance dataset.
 *
 * SINGLE SOURCE OF TRUTH: the documents come straight from the console's local
 * workspace seed (apps/operations-web/lib/prototype/governance/seed.ts), so the
 * emulator and the local workspace always show the same organizers, arenas,
 * events, cases, settlements and audit history. Node 22.18+ loads that .ts file
 * natively (type stripping); run with `npm run seed:emulator` inside
 * `firebase emulators:exec` (root: `npm run firebase:seed`).
 *
 * Also creates two sign-in accounts:
 *   admin@experience.local   / Local-Admin-Only-2026!   platform-owner
 *   auditor@experience.local / Local-Admin-Only-2026!   auditor (read-only)
 */
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error("Refusing to seed without both Firestore and Auth emulator hosts.");
}
const projectId = "demo-experience-os";
if ((process.env.GCLOUD_PROJECT ?? projectId) !== projectId) {
  throw new Error(`Refusing to seed project "${process.env.GCLOUD_PROJECT}"; only ${projectId} is allowed.`);
}

const here = dirname(fileURLToPath(import.meta.url));
const seedPath = resolve(here, "../../../apps/operations-web/lib/prototype/governance/seed.ts");
let SEED_GOVERNANCE;
try {
  ({ SEED_GOVERNANCE } = await import(pathToFileURL(seedPath).href));
} catch (error) {
  throw new Error(`Could not load ${seedPath}. Node 22.18+ is required (native TypeScript type stripping). ${error.message}`);
}

const app = initializeApp({ projectId });
const auth = getAuth(app);
const firestore = getFirestore(app);
const password = "Local-Admin-Only-2026!";

async function ensureUser(email, displayName, roleId) {
  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch {
    user = await auth.createUser({ email, password, emailVerified: true, displayName });
  }
  await auth.setCustomUserClaims(user.uid, { roleId, scope: "platform", franchiseId: null, territoryIds: [], disabled: false });
  return user;
}

const owner = await ensureUser("admin@experience.local", "Aditya Rao", "platform-owner");
const auditor = await ensureUser("auditor@experience.local", "Compliance Auditor", "auditor");

const now = Timestamp.now();
const ts = (iso) => (iso ? Timestamp.fromDate(new Date(iso)) : now);
const writer = firestore.bulkWriter();

for (const [user, roleId] of [[owner, "platform-owner"], [auditor, "auditor"]]) {
  writer.set(firestore.collection("users").doc(user.uid), {
    uid: user.uid, displayName: user.displayName, email: user.email, roleId, scope: "platform", franchiseId: null,
    territoryIds: [], status: "active", version: 0, createdAt: now, updatedAt: now, createdBy: "seed", updatedBy: "seed",
  });
}

const counts = {};
for (const doc of SEED_GOVERNANCE) {
  const data = { ...doc.data, version: doc.version ?? 0, createdAt: ts(doc.createdAt), updatedAt: ts(doc.updatedAt) };
  if (doc.collection === "auditEvents") {
    Object.assign(data, { actorUid: data.actorUid ?? "seed", at: ts(doc.data.at ?? doc.createdAt), schemaVersion: 1 });
  }
  writer.set(firestore.collection(doc.collection).doc(doc.id), data);
  counts[doc.collection] = (counts[doc.collection] ?? 0) + 1;
}
await writer.close();

console.log(`Seeded ${SEED_GOVERNANCE.length} governance documents:`, counts);
console.log(`Sign in with admin@experience.local or auditor@experience.local / ${password}`);
