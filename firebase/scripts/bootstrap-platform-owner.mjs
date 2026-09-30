#!/usr/bin/env node
/**
 * One-time bootstrap of the FIRST platform owner for a new Firebase project.
 *
 * `setOperatorAccess` can only be called by an existing platform owner, so
 * the very first one has to be granted out of band. This script does exactly
 * that, once, and refuses to run again:
 *
 *   gcloud auth application-default login          # the project owner's own login
 *   node firebase/scripts/bootstrap-platform-owner.mjs \
 *     --project <exact project id> --uid <Firebase Auth uid> --reason "<why>"
 *
 * Guards:
 * - The project id must be passed explicitly (never inferred) and typed again
 *   when prompted.
 * - Refuses if any platform owner already exists; after bootstrap, use the
 *   console (setOperatorAccess) for every further change.
 * - The user must already exist in Firebase Auth with a VERIFIED email
 *   (the console requires it).
 * - Writes the same users doc and audit event shape as setOperatorAccess.
 */

import { createRequire } from "node:module";
import { createInterface } from "node:readline/promises";

const require = createRequire(new URL("../functions/package.json", import.meta.url));
const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? (process.argv[i + 1] ?? "").trim() : "";
}

const project = arg("project");
const uid = arg("uid");
const reason = arg("reason");
const fail = (msg) => { console.error(`[bootstrap] ABORT: ${msg}`); process.exit(1); };

if (!project) fail("--project is required (the exact Firebase project id).");
if (!/^[A-Za-z0-9_-]{8,128}$/.test(uid)) fail("--uid must be a Firebase Auth uid.");
if (reason.length < 10) fail("--reason of at least 10 characters is required (it goes into the audit log).");
if (project.startsWith("demo-") && !process.env.FIRESTORE_EMULATOR_HOST) fail("demo-* projects exist only in the emulator.");

const rl = createInterface({ input: process.stdin, output: process.stdout });
const typed = (await rl.question(`Type the project id to confirm granting platform-owner on "${project}": `)).trim();
rl.close();
if (typed !== project) fail("confirmation did not match.");

initializeApp({ projectId: project, credential: applicationDefault() });
const auth = getAuth();
const db = getFirestore();

const existing = await db.collection("users").where("roleId", "==", "platform-owner").limit(1).get();
if (!existing.empty) fail(`a platform owner already exists (${existing.docs[0].id}). Use the console's access page instead.`);

const user = await auth.getUser(uid).catch(() => fail(`no Firebase Auth user ${uid}.`));
if (!user.email || !user.emailVerified) fail("the user must have a verified email address to use the console.");

await auth.setCustomUserClaims(uid, { ...(user.customClaims ?? {}), roleId: "platform-owner", disabled: false });
const now = FieldValue.serverTimestamp();
const batch = db.batch();
batch.set(db.collection("users").doc(uid), {
  uid, displayName: user.displayName ?? user.email, email: user.email, roleId: "platform-owner", scope: "platform",
  franchiseId: null, territoryIds: [], status: "active", createdAt: now, createdBy: "bootstrap", updatedAt: now,
  updatedBy: "bootstrap", version: 1,
}, { merge: true });
batch.create(db.collection("auditEvents").doc(), {
  action: "access.operator-bootstrapped", actorUid: "bootstrap", actorRoleId: "system", resourceType: "user",
  resourceId: uid, before: null, after: { roleId: "platform-owner", status: "active" }, reason, at: now, schemaVersion: 1,
});
await batch.commit();
console.log(`[bootstrap] ${user.email} is now platform owner of ${project}. They must sign out and back in.`);
console.log("[bootstrap] Next: grant a second admin from the console, since dual control needs two people.");
