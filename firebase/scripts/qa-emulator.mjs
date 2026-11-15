#!/usr/bin/env node
/**
 * qa-emulator.mjs — small helpers for manual QA against the local emulators.
 * Every action goes through the real callables (as the app would call them).
 *
 *   node firebase/scripts/qa-emulator.mjs draft-free  [+91phone]   → a free experience draft (the app schedules the event after approval)
 *   node firebase/scripts/qa-emulator.mjs otp +91phone            → latest OTP the Auth emulator issued
 *   node firebase/scripts/qa-emulator.mjs show <collection> [n]   → print recent docs
 *
 * Refuses to run unless the emulators are on this machine and the project is
 * demo-experience-os.
 */
import { createRequire } from "node:module";

const PROJECT = "demo-experience-os";
process.env.GCLOUD_PROJECT = PROJECT;
process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const FN = process.env.FUNCTIONS_EMULATOR_HOST ?? "127.0.0.1:5001";
const LOCAL = /^(127\.0\.0\.1|localhost):\d+$/;
if (![AUTH, FN, process.env.FIRESTORE_EMULATOR_HOST].every((h) => LOCAL.test(h))) {
  console.error("ABORT: emulator hosts must point at this machine.");
  process.exit(1);
}

const require = createRequire(new URL("../functions/package.json", import.meta.url));
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
initializeApp({ projectId: PROJECT });
const auth = getAuth();
const db = getFirestore();

async function session(phone) {
  const user = await auth.getUserByPhoneNumber(phone);
  const token = await auth.createCustomToken(user.uid);
  const r = await fetch(`http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, returnSecureToken: true }),
  }).then((x) => x.json());
  return { uid: user.uid, idToken: r.idToken };
}

async function call(fn, s, data, region = "asia-south1") {
  const res = await fetch(`http://${FN}/${PROJECT}/${region}/${fn}`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.idToken}` }, body: JSON.stringify({ data }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) throw new Error(`${fn}: ${JSON.stringify(body.error ?? res.status)}`);
  return body.result;
}

const rid = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

async function draftFree(phone = "+919000000001") {
  const s = await session(phone);
  const m = await db.collection("memberships").where("uid", "==", s.uid).get();
  const orgId = m.docs.map((d) => d.data()).find((d) => d.role === "owner").orgId;
  const exp = await call("saveExperience", s, {
    requestId: rid("qa-exp"), orgId,
    title: "Free Sunday Nets", tagline: "", category: "sports", activity: "Cricket nets", format: "Solo spot",
    description: "Open nets practice for beginners. Bring shoes, we bring bats and balls.",
    highlights: [], genderRule: "open", ageMin: 18, ageMax: null, idRequired: false,
    rules: ["Zero tolerance for abuse on field"], bring: [], safety: { level: "medium", measures: ["Trained first-aider present"] },
    cancellationPolicy: "flexible", config: {}, coverStyle: { seed: 0 }, mediaPaths: [], mediaUrls: [],
  });
  console.log(JSON.stringify({ orgId, experienceId: exp.experienceId }));
}

async function otp(phone) {
  const r = await fetch(`http://${AUTH}/emulator/v1/projects/${PROJECT}/verificationCodes`).then((x) => x.json());
  const c = r.verificationCodes.filter((x) => x.phoneNumber === phone);
  console.log(c.length ? c[c.length - 1].code : "none");
}

async function show(col, n = 5) {
  const snap = await db.collection(col).limit(Number(n)).get();
  for (const d of snap.docs) console.log(d.id, JSON.stringify(d.data()).slice(0, 400));
}

const [cmd, ...args] = process.argv.slice(2);
const run = { "draft-free": draftFree, otp, show }[cmd];
if (!run) {
  console.error("usage: qa-emulator.mjs draft-free [+91phone] | otp +91phone | show <collection> [n]");
  process.exit(2);
}
await run(...args);
process.exit(0);
