/**
 * seed-emulator.ts — realistic local data, made only through the real callables.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run seed:emulator
 *
 * Every state change goes through the Cloud Functions running in the Functions
 * emulator (organizer onboarding, governance decisions, commercial terms,
 * catalog, bookings, Razorpay-signed payments, door check-in, refunds,
 * settlements). firebase-admin is used only to create Auth users, mint custom
 * tokens and READ Firestore (idempotency lookups, case versions, the summary).
 * The one direct write is the very first platform owner, exactly as
 * bootstrap-platform-owner.mjs does it, and only when no platform owner exists.
 *
 * Idempotent: every command carries a deterministic requestId, so a re-run
 * replays the original results; people are found by email/phone.
 *
 * SAFETY GUARDS:
 * - Refuses to run unless FIRESTORE_EMULATOR_HOST is set (and points at this machine).
 * - Refuses to run unless the project id is demo-experience-os.
 * - No live credential fallback: Auth is forced onto the emulator.
 */

import { createHmac } from "node:crypto";
import { createRequire } from "node:module";

const TAG = "[seed-emulator]";
const PROJECT = "demo-experience-os";
const LOCAL = /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/;

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

function configuredProject(): string | undefined {
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
  if (process.env.FIREBASE_CONFIG) {
    try {
      return JSON.parse(process.env.FIREBASE_CONFIG).projectId;
    } catch {
      return undefined;
    }
  }
  return argValue("project");
}

const FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (!FIRESTORE_EMULATOR_HOST) {
  console.error(`${TAG} ABORT: FIRESTORE_EMULATOR_HOST is not set.\nThis script must only run against the local emulators.`);
  process.exit(1);
}
if (!LOCAL.test(FIRESTORE_EMULATOR_HOST)) {
  console.error(`${TAG} ABORT: FIRESTORE_EMULATOR_HOST must point at this machine (got "${FIRESTORE_EMULATOR_HOST}").`);
  process.exit(1);
}
const GCLOUD_PROJECT = configuredProject();
if (GCLOUD_PROJECT !== PROJECT) {
  console.error(`${TAG} ABORT: Expected project "${PROJECT}" but got "${GCLOUD_PROJECT}".\nRefusing to seed a non-demo project.`);
  process.exit(1);
}
process.env.GCLOUD_PROJECT = PROJECT;
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const FUNCTIONS_HOST = process.env.FUNCTIONS_EMULATOR_HOST ?? "127.0.0.1:5001";
if (!LOCAL.test(AUTH_HOST) || !LOCAL.test(FUNCTIONS_HOST)) {
  console.error(`${TAG} ABORT: the Auth and Functions emulator hosts must point at this machine.`);
  process.exit(1);
}

const require = createRequire(new URL("../functions/package.json", import.meta.url));
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp({ projectId: PROJECT });
const auth = getAuth();
const db = getFirestore();

/** Matches secret() in functions/src/platform/security.ts inside the emulator. */
const RAZORPAY_DEV_SECRET = process.env.RAZORPAY_KEY_SECRET || "dev-only-razorpay_key_secret-not-for-production";
const RUN = "seed1";
const HOUR = 3_600_000;

// ------------------------------------------------------------------ plumbing

type Json = Record<string, any>;
interface Session { uid: string; label: string; idToken: string }

const tally: Record<string, { done: number; replayed: number; skipped: number }> = {};
function count(step: string, kind: "done" | "replayed" | "skipped") {
  (tally[step] ??= { done: 0, replayed: 0, skipped: 0 })[kind] += 1;
}
const log = (msg: string) => console.log(`${TAG} ${msg}`);

/** Callables exported from governance/ and auth/ keep the default region. */
const US_CENTRAL = new Set(["decideCase", "setOperatorAccess", "reissueOrganizerCode", "setMarketplaceEntityStatus", "checkHealth"]);

async function call<T = Json>(fn: string, session: Session, data: Json): Promise<T> {
  const region = US_CENTRAL.has(fn) ? "us-central1" : "asia-south1";
  const res = await fetch(`http://${FUNCTIONS_HOST}/${PROJECT}/${region}/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.idToken}` },
    body: JSON.stringify({ data }),
  });
  const body = (await res.json().catch(() => ({}))) as Json;
  if (!res.ok || body.error) {
    const e = body.error ?? {};
    throw new Error(`${fn} as ${session.label}: ${e.status ?? res.status} ${e.message ?? res.statusText}${e.details ? ` ${JSON.stringify(e.details)}` : ""}`);
  }
  return body.result as T;
}

async function identityToolkit(path: string, body: Json): Promise<Json> {
  const res = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/${path}?key=fake`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as Json;
  if (!res.ok) throw new Error(`${path}: ${JSON.stringify(json.error ?? json)}`);
  return json;
}

async function signInWithPassword(email: string, password: string, label: string): Promise<Session> {
  const r = await identityToolkit("accounts:signInWithPassword", { email, password, returnSecureToken: true });
  return { uid: r.localId, label, idToken: r.idToken };
}

async function phoneSession(phone: string, label: string): Promise<{ session: Session; created: boolean }> {
  let user = await auth.getUserByPhoneNumber(phone).catch(() => null);
  const created = !user;
  if (!user) user = await auth.createUser({ phoneNumber: phone });
  const token = await auth.createCustomToken(user.uid);
  const r = await identityToolkit("accounts:signInWithCustomToken", { token, returnSecureToken: true });
  return { session: { uid: user.uid, label, idToken: r.idToken }, created };
}

async function get(collection: string, id: string): Promise<Json | null> {
  const s = await db.collection(collection).doc(id).get();
  return s.exists ? ({ id: s.id, ...s.data() } as Json) : null;
}

const docs = (snap: Json): Json[] => snap.docs.map((d: Json) => ({ id: d.id, ...d.data() }));

/** Deterministic pseudo-random sequence, so every run plans the same bookings. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

/** `hour:minute` IST, `daysAhead` days from today (IST), as an ISO instant. */
function istAt(daysAhead: number, hour: number, minute = 0): string {
  const istNow = new Date(Date.now() + 5.5 * HOUR);
  const ms = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate() + daysAhead, hour, minute) - 5.5 * HOUR;
  return new Date(ms).toISOString();
}

const iso = (t: Json | null | undefined) => (t?.toMillis ? new Date(t.toMillis()).toISOString() : "—");

async function decide(admin: Session, caseId: string, requestId: string, note = ""): Promise<Json> {
  const c = await get("governanceCases", caseId);
  if (!c) throw new Error(`governance case ${caseId} is missing`);
  return call("decideCase", admin, { requestId, caseId, expectedVersion: Number(c.version ?? 0), outcome: "approved", note });
}

// ---------------------------------------------------------------- the data

const APPLICANTS = [
  {
    phone: "+919000000001", approve: true,
    application: { kind: "individual", displayName: "Weekend Cricket Club", legalName: "Rohan Iyer", city: "Bengaluru", categories: ["sports"], about: "Friendly weekend box-cricket and nets sessions for working professionals across Bengaluru.", contactEmail: null },
  },
  {
    phone: "+919000000002", approve: true,
    application: { kind: "business", displayName: "Trailblazers Treks", legalName: "Trailblazers Outdoor LLP", city: "Pune", categories: ["trips", "wellness"], about: "Guided sunrise treks around the Sahyadris and slow wellness mornings outside Pune.", contactEmail: "hello@trailblazers.test" },
  },
  {
    phone: "+919000000003", approve: true,
    application: { kind: "individual", displayName: "Clay & Coffee", legalName: "Meera Reddy", city: "Hyderabad", categories: ["workshops", "social"], about: "Pottery wheel workshops paired with good filter coffee and new friends in Hyderabad.", contactEmail: null },
  },
  {
    phone: "+919000000004", approve: false,
    application: { kind: "business", displayName: "Bassline Collective", legalName: "Bassline Events Pvt Ltd", city: "Bengaluru", categories: ["music"], about: "Small-room live music nights featuring independent artists from the city.", contactEmail: "team@bassline.test" },
  },
  {
    phone: "+919000000005", approve: false,
    application: { kind: "individual", displayName: "Deccan Food Walks", legalName: "Imran Qureshi", city: "Hyderabad", categories: ["food"], about: "Evening food walks through the old city's bakeries, biryani joints and Irani cafes.", contactEmail: null },
  },
];

const VENUES: Record<string, Json[]> = {
  Bengaluru: [
    { name: "Turf Park Koramangala", area: "Koramangala", city: "Bengaluru", address: "80 Feet Road, 4th Block, Koramangala, Bengaluru 560034", lat: 12.9352, lng: 77.6245 },
    { name: "HSR Sports Arena", area: "HSR Layout", city: "Bengaluru", address: "27th Main Road, Sector 2, HSR Layout, Bengaluru 560102", lat: 12.9116, lng: 77.6474 },
  ],
  Pune: [
    { name: "Sinhagad Base Village", area: "Donje", city: "Pune", address: "Sinhagad Ghat Road, Donje, Pune 411025", lat: 18.3663, lng: 73.7559 },
    { name: "Pashan Lake Garden", area: "Pashan", city: "Pune", address: "Pashan Lake Road, Pashan, Pune 411021", lat: 18.5362, lng: 73.7837 },
  ],
  Hyderabad: [
    { name: "Clay & Coffee Studio", area: "Jubilee Hills", city: "Hyderabad", address: "Road No. 36, Jubilee Hills, Hyderabad 500033", lat: 17.4307, lng: 78.4071 },
    { name: "Lamakaan Courtyard", area: "Banjara Hills", city: "Hyderabad", address: "Road No. 1, Banjara Hills, Hyderabad 500034", lat: 17.4156, lng: 78.4347 },
  ],
};

const base = {
  genderRule: "open", ageMin: 18, ageMax: null, idRequired: false, cancellationPolicy: "flexible",
  safety: { level: "low", measures: [] as string[] }, mediaPaths: [] as string[],
};

const EXPERIENCES: Record<string, Json[]> = {
  "+919000000001": [
    { ...base, key: "box", title: "Sunday Box Cricket", tagline: "Six-a-side, tennis ball, all skill levels", category: "sports", activity: "Box cricket", format: "Mixed teams of six", description: "Two hours of fast six-a-side box cricket under lights. Teams are mixed on arrival so everyone plays.", highlights: ["Floodlit turf", "Mixed teams", "Scorer provided"], rules: ["Tennis ball only", "Non-marking shoes"], bring: ["Water bottle", "Sports shoes"], config: { teamSize: 6, skillLevel: "all-levels", equipmentProvided: true }, coverStyle: { seed: 11 } },
    { ...base, key: "nets", title: "Cricket Nets for Beginners", tagline: "Learn to bat and bowl with a coach", category: "sports", activity: "Cricket nets", format: "Coached small groups", description: "A relaxed coached session in the nets covering grip, stance, and simple bowling actions.", highlights: ["Certified coach", "Leather ball optional"], rules: ["Helmets in the nets"], bring: ["Comfortable clothes"], config: { teamSize: 4, skillLevel: "beginner", equipmentProvided: true }, coverStyle: { seed: 12 } },
  ],
  "+919000000002": [
    { ...base, key: "trek", title: "Sinhagad Sunrise Trek", tagline: "Catch the sunrise from the fort walls", category: "trips", activity: "Trekking", format: "Guided group trek", description: "An early start from the base village, a steady climb to Sinhagad fort and breakfast with a view.", highlights: ["Sunrise at the top", "Pithla bhakri breakfast"], rules: ["Stay with the group"], bring: ["Torch", "Two litres of water", "Grip shoes"], config: { pickupPoint: "Sinhagad base village parking", returnTime: "11:00", overnight: false, stops: ["Base village", "Kalyan Darwaza", "Fort top"] }, safety: { level: "medium", measures: ["Trained trek leaders", "First-aid kit"] }, coverStyle: { seed: 21 } },
    { ...base, key: "yoga", title: "Sunset Yoga by the Lake", tagline: "Slow flow and breathwork outdoors", category: "wellness", activity: "Yoga", format: "Instructor-led class", description: "An easy-paced outdoor yoga flow by Pashan lake, ending with breathwork as the sun goes down.", highlights: ["Lakeside", "All levels"], rules: ["Arrive ten minutes early"], bring: ["Yoga mat", "Water"], config: { intensity: "gentle", matsProvided: false }, coverStyle: { seed: 22 } },
  ],
  "+919000000003": [
    { ...base, key: "wheel", title: "Wheel Throwing Basics", tagline: "Make your first bowl on the wheel", category: "workshops", activity: "Pottery", format: "Hands-on workshop", description: "Centre clay, open it up and pull your first walls on the pottery wheel. Pieces are fired and ready in two weeks.", highlights: ["Your own wheel", "Firing included"], rules: ["Short nails help"], bring: ["Clothes that can get muddy"], config: { materialsIncluded: true, skillLevel: "beginner", takeaway: "One fired bowl" }, coverStyle: { seed: 31 } },
    { ...base, key: "social", title: "Clay & Coffee Social Night", tagline: "Hand-building, coffee and new people", category: "social", activity: "Social mixer", format: "Hosted social evening", description: "A hosted evening of hand-building with clay and filter coffee, built around meeting new people.", highlights: ["Icebreakers", "Unlimited coffee"], rules: ["Be kind"], bring: ["Curiosity"], config: { icebreakers: true, groupSize: 20 }, coverStyle: { seed: 32 } },
  ],
};

/**
 * Three events per organizer in its own city. saveEvent refuses a start less
 * than 2 h ahead, so the "live" event starts 2 h 20 min after the seed and is
 * moved to the `live` phase (allowed up to 3 h before the start).
 */
function eventPlan(phone: string, city: string): Json[] {
  const v = VENUES[city]!;
  const liveStart = new Date(Date.now() + 2 * HOUR + 20 * 60_000).toISOString();
  switch (phone) {
    case "+919000000001":
      return [
        { key: "live", exp: "box", venue: v[0], startsAt: liveStart, durationMinutes: 300, max: 24, priceMinor: 39900, live: true },
        { key: "d2", exp: "nets", venue: v[1], startsAt: istAt(2, 18, 30), durationMinutes: 120, max: 12, priceMinor: 59900 },
        { key: "d5", exp: "box", venue: v[0], startsAt: istAt(5, 19, 0), durationMinutes: 120, max: 24, priceMinor: 39900 },
      ];
    case "+919000000002":
      return [
        { key: "d1", exp: "trek", venue: v[0], startsAt: istAt(1, 5, 30), durationMinutes: 330, max: 30, priceMinor: 89900 },
        { key: "d3", exp: "yoga", venue: v[1], startsAt: istAt(3, 17, 45), durationMinutes: 75, max: 20, priceMinor: 49900 },
        { key: "d6", exp: "trek", venue: v[0], startsAt: istAt(6, 5, 30), durationMinutes: 330, max: 30, priceMinor: 89900 },
      ];
    default:
      return [
        { key: "d2", exp: "wheel", venue: v[0], startsAt: istAt(2, 11, 0), durationMinutes: 150, max: 10, priceMinor: 149900 },
        { key: "d4", exp: "social", venue: v[1], startsAt: istAt(4, 19, 30), durationMinutes: 150, max: 20, priceMinor: 69900 },
        { key: "d7", exp: "wheel", venue: v[0], startsAt: istAt(7, 11, 0), durationMinutes: 150, max: 10, priceMinor: 149900 },
      ];
  }
}

const CUSTOMERS = ["Aarav", "Diya", "Kabir", "Ananya", "Vihaan", "Ishita", "Arjun", "Saanvi", "Reyansh", "Myra", "Advait", "Kiara"].map(
  (name, i) => ({
    phone: `+9191000000${String(i + 1).padStart(2, "0")}`,
    name,
    birthDate: `${1988 + (i % 10)}-0${(i % 9) + 1}-1${i % 9}`,
    gender: i % 2 === 0 ? "man" : "woman",
  })
);

// --------------------------------------------------------------- the steps

async function ensureOperators(): Promise<{ admin: Session; ops: Session }> {
  const ADMIN = { email: "admin@pulse.test", password: "PulseAdmin#2026" };
  const OPS = { email: "ops@pulse.test", password: "PulseOps#2026" };

  let owner = await auth.getUserByEmail(ADMIN.email).catch(() => null);
  if (!owner) owner = await auth.createUser({ email: ADMIN.email, password: ADMIN.password, emailVerified: true, displayName: "Platform Owner" });
  else if (!owner.emailVerified) owner = await auth.updateUser(owner.uid, { emailVerified: true });
  if (owner.customClaims?.roleId === "platform-owner") {
    count("platform owner", "skipped");
    log(`platform owner ${ADMIN.email} exists (${owner.uid})`);
  } else {
    // Same out-of-band bootstrap as bootstrap-platform-owner.mjs: setOperatorAccess
    // needs an existing owner, so the first one can't come from a callable.
    const existing = await db.collection("users").where("roleId", "==", "platform-owner").limit(1).get();
    if (!existing.empty) throw new Error(`another platform owner exists (${existing.docs[0].id}); refusing to bootstrap ${ADMIN.email}`);
    await auth.setCustomUserClaims(owner.uid, { ...(owner.customClaims ?? {}), roleId: "platform-owner", disabled: false });
    const now = FieldValue.serverTimestamp();
    const batch = db.batch();
    batch.set(db.collection("users").doc(owner.uid), {
      uid: owner.uid, displayName: owner.displayName ?? owner.email, email: owner.email, roleId: "platform-owner", scope: "platform",
      franchiseId: null, territoryIds: [], status: "active", createdAt: now, createdBy: "bootstrap", updatedAt: now,
      updatedBy: "bootstrap", version: 1,
    }, { merge: true });
    batch.create(db.collection("auditEvents").doc(), {
      action: "access.operator-bootstrapped", actorUid: "bootstrap", actorRoleId: "system", resourceType: "user",
      resourceId: owner.uid, before: null, after: { roleId: "platform-owner", status: "active" },
      reason: "Emulator seed: first platform owner.", at: now, schemaVersion: 1,
    });
    await batch.commit();
    count("platform owner", "done");
    log(`bootstrapped platform owner ${ADMIN.email}`);
  }
  const admin = await signInWithPassword(ADMIN.email, ADMIN.password, "admin");

  let ops = await auth.getUserByEmail(OPS.email).catch(() => null);
  if (!ops) {
    ops = await auth.createUser({ email: OPS.email, password: OPS.password, displayName: "Ops Admin" });
    log(`created ${OPS.email}`);
  }
  if (!ops.emailVerified) {
    // The Auth emulator's admin bypass (Bearer owner) marks the email verified.
    const res = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer owner" },
      body: JSON.stringify({ localId: ops.uid, emailVerified: true }),
    });
    if (!res.ok) throw new Error(`could not verify ${OPS.email}: ${await res.text()}`);
  }
  if (ops.customClaims?.roleId === "super-admin" && ops.customClaims?.disabled === false) {
    count("second super-admin", "skipped");
  } else {
    await call("setOperatorAccess", admin, { uid: ops.uid, roleId: "super-admin", status: "active", reason: "Second admin for dual control (emulator seed)." });
    count("second super-admin", "done");
    log(`granted super-admin to ${OPS.email}`);
  }
  // A fresh sign-in after the claim change, so the token carries roleId.
  return { admin, ops: await signInWithPassword(OPS.email, OPS.password, "ops") };
}

interface Org { orgId: string; owner: Session; city: string; name: string; phone: string }

async function onboardOrganizers(admin: Session): Promise<Org[]> {
  const orgs: Org[] = [];
  for (const a of APPLICANTS) {
    const name = a.application.displayName;
    const { session } = await phoneSession(a.phone, name);
    let app = await get("organizerApplications", session.uid);
    if (!app) {
      await call("submitOrganizerApplication", session, { requestId: `${RUN}-apply-${session.uid}`, ...a.application });
      count("organizer applications", "done");
      log(`submitted application: ${name}`);
      app = await get("organizerApplications", session.uid);
    } else {
      count("organizer applications", "skipped");
    }
    if (!a.approve) continue;

    let code: string | null = null;
    if (app!.status === "submitted" || app!.status === "under-review") {
      const r = await decide(admin, `organizer-kyc_${session.uid}`, `${RUN}-kyc-${session.uid}`, "KYC documents checked (emulator seed).");
      code = (r.organizerCode as string) ?? null;
      count("KYC approvals", r.replayed ? "replayed" : "done");
      log(`approved organizer: ${name}`);
      app = await get("organizerApplications", session.uid);
    } else {
      count("KYC approvals", "skipped");
    }
    const orgId = String(app!.orgId ?? "");
    if (!orgId) throw new Error(`${name}: application is ${app!.status} without an organizer`);

    const activation = await get("organizerActivations", session.uid);
    if (activation?.status === "redeemed") {
      count("organizer codes redeemed", "skipped");
    } else {
      if (!code) {
        const r = await call("reissueOrganizerCode", admin, { requestId: `${RUN}-reissue-${session.uid}-${Date.now()}`, applicantUid: session.uid, reason: "Emulator seed: code for activation." });
        code = r.organizerCode as string;
      }
      await call("redeemOrganizerCode", session, { code });
      count("organizer codes redeemed", "done");
      log(`activated ${name} (${orgId})`);
    }
    orgs.push({ orgId, owner: session, city: a.application.city, name, phone: a.phone });
  }
  return orgs;
}

async function ensureAgreement(org: Org, admin: Session, ops: Session) {
  const approved = await db.collection("commercialAgreements").where("orgId", "==", org.orgId).where("status", "==", "approved").limit(1).get();
  if (!approved.empty) {
    count("commercial agreements", "skipped");
    return;
  }
  // Dual control: one admin proposes, a different admin approves.
  const p = await call("proposeCommercialAgreement", ops, { requestId: `${RUN}-agr-${org.orgId}`, orgId: org.orgId, commissionBps: 1000, payoutCadence: "weekly", note: "Standard 10% launch terms." });
  await call("decideCommercialAgreement", admin, { requestId: `${RUN}-agrok-${org.orgId}`, agreementId: p.agreementId, action: "approve", note: "Approved standard terms." });
  count("commercial agreements", "done");
  log(`commercial terms approved for ${org.name} (proposed by ops, approved by admin)`);
}

async function ensureExperiences(org: Org, admin: Session): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  for (const x of EXPERIENCES[org.phone] ?? []) {
    const { key, ...content } = x;
    const saved = await call("saveExperience", org.owner, { requestId: `${RUN}-exp-${org.orgId}-${key}`, orgId: org.orgId, ...content });
    const experienceId = saved.experienceId as string;
    ids[key] = experienceId;
    let doc = await get("experiences", experienceId);
    if (doc!.status === "draft" || doc!.status === "changes-requested") {
      await call("submitExperience", org.owner, { requestId: `${RUN}-expsub-${experienceId}`, orgId: org.orgId, experienceId });
      doc = await get("experiences", experienceId);
    }
    if (doc!.status === "submitted") {
      await decide(admin, doc!.governanceCaseId, `${RUN}-expok-${experienceId}`);
      count("experiences approved", "done");
      log(`experience approved: ${x.title}`);
    } else {
      count("experiences approved", "skipped");
    }
  }
  return ids;
}

interface SeededEvent { eventId: string; org: Org; title: string; live: boolean }

async function ensureEvents(org: Org, admin: Session, experienceIds: Record<string, string>): Promise<SeededEvent[]> {
  const out: SeededEvent[] = [];
  for (const e of eventPlan(org.phone, org.city)) {
    const saved = await call("saveEvent", org.owner, {
      requestId: `${RUN}-ev-${org.orgId}-${e.key}`,
      orgId: org.orgId,
      experienceId: experienceIds[e.exp],
      venue: e.venue,
      startsAt: e.startsAt,
      durationMinutes: e.durationMinutes,
      capacity: { max: e.max, min: 2, blocked: 0 },
      priceMinor: e.priceMinor,
      currency: "INR",
      primaryUid: org.owner.uid,
      staffUids: [],
    });
    const eventId = saved.eventId as string;
    let ev = await get("events", eventId);
    if (ev!.status === "draft" || ev!.status === "changes-requested") {
      await call("submitEvent", org.owner, { requestId: `${RUN}-evsub-${eventId}`, orgId: org.orgId, eventId });
      ev = await get("events", eventId);
    }
    if (ev!.status === "submitted") {
      await decide(admin, ev!.governanceCaseId, `${RUN}-evok-${eventId}`);
      ev = await get("events", eventId);
    }
    if (ev!.status === "approved") {
      await call("publishEvent", org.owner, { requestId: `${RUN}-evpub-${eventId}`, orgId: org.orgId, eventId });
      count("events published", "done");
      log(`published: ${ev!.title} · ${e.venue.area}, ${e.venue.city} · ${iso(ev!.startsAt)}`);
    } else {
      count("events published", "skipped");
    }
    out.push({ eventId, org, title: ev!.title, live: !!e.live });
  }
  return out;
}

interface Customer { session: Session; name: string; index: number }

async function ensureCustomers(): Promise<Customer[]> {
  const out: Customer[] = [];
  for (const [index, c] of CUSTOMERS.entries()) {
    const { session, created } = await phoneSession(c.phone, c.name);
    if (await get("customerSafety", session.uid)) {
      count("customers", "skipped");
    } else {
      await call("updateMyProfile", session, { displayName: c.name, bio: null, birthDate: c.birthDate, gender: c.gender });
      count("customers", "done");
      log(`${created ? "created" : "completed profile for"} customer ${c.name} (${c.phone})`);
    }
    out.push({ session, name: c.name, index });
  }
  return out;
}

/** 8 of 12 customers book the live event; everyone books one or two others; ~30% take 2 spots. */
function bookingPlan(customers: Customer[], events: SeededEvent[]) {
  const next = rng(20261009);
  const live = events.find((e) => e.live)!;
  const others = events.filter((e) => !e.live);
  const plan: { customer: Customer; event: SeededEvent; spots: number }[] = [];
  for (const customer of customers) {
    const picks = new Set<SeededEvent>();
    if (customer.index < 8) picks.add(live);
    const target = picks.size + 1 + Math.floor(next() * 2);
    while (picks.size < target) picks.add(others[Math.floor(next() * others.length)]!);
    for (const event of picks) plan.push({ customer, event, spots: next() < 0.3 ? 2 : 1 });
  }
  return plan;
}

async function ensureBookings(customers: Customer[], events: SeededEvent[]) {
  for (const { customer, event, spots } of bookingPlan(customers, events)) {
    const tag = `${customer.name} → ${event.title}`;
    const requestId = `${RUN}-bk-${event.eventId}`;
    const ev = await get("events", event.eventId);
    const receipt = await get("commandReceipts", `reserveSeat_${customer.session.uid}_${requestId}`);
    if (!receipt && ev!.status !== "published") {
      count("bookings", "skipped");
      log(`skip booking ${tag}: the event is ${ev!.status} and no longer takes bookings`);
      continue;
    }
    const r = await call("reserveSeat", customer.session, { requestId, eventId: event.eventId, spots, alias: customer.name });
    const booking = await get("bookings", r.bookingId);
    if (booking!.status === "confirmed") {
      count("bookings", "skipped");
      continue;
    }
    if (booking!.status !== "held" || booking!.holdExpiresAt.toMillis() <= Date.now()) {
      count("bookings", "skipped");
      log(`skip booking ${tag}: it is ${booking!.status} (the hold lapsed before payment)`);
      continue;
    }
    const order = await call("createPaymentOrder", customer.session, { requestId: `${RUN}-pay-${r.bookingId}`, bookingId: r.bookingId });
    const providerPaymentId = `pay_seed${r.bookingId}`.slice(0, 64);
    // Razorpay checkout signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret).
    const providerSignature = createHmac("sha256", RAZORPAY_DEV_SECRET).update(`${order.providerOrderId}|${providerPaymentId}`).digest("hex");
    const paid = await call("confirmPayment", customer.session, { paymentId: order.paymentId, providerPaymentId, providerSignature });
    if (paid.status !== "confirmed") throw new Error(`${tag}: payment settled as ${paid.status}`);
    count("bookings", "done");
    log(`booked + paid ${tag} (${spots} spot${spots > 1 ? "s" : ""}, ₹${(order.amountMinor / 100).toFixed(0)})`);
  }
}

async function goLiveAndCheckIn(events: SeededEvent[]): Promise<SeededEvent> {
  const live = events.find((e) => e.live)!;
  const ev = await get("events", live.eventId);
  if (ev!.status === "published" || ev!.status === "booking-closed") {
    await call("setEventPhase", live.org.owner, { requestId: `${RUN}-golive-${live.eventId}`, orgId: live.org.orgId, eventId: live.eventId, phase: "live" });
    count("event set live", "done");
    log(`${live.title} is now in the live phase (starts ${iso(ev!.startsAt)})`);
  } else {
    count("event set live", "skipped");
  }

  const tickets = docs(await db.collection("tickets").where("eventId", "==", live.eventId).get())
    .sort((a, b) => String(a.bookingId).localeCompare(String(b.bookingId)) || a.spotIndex - b.spotIndex);
  const admit = tickets.slice(0, Math.ceil(tickets.length * 0.6));
  for (const t of admit) {
    if (t.status !== "valid") {
      count("door check-ins", "skipped");
      continue;
    }
    // The typed booking reference: each entry admits the booking's next valid spot.
    const r = await call("scanTicket", live.org.owner, { requestId: `${RUN}-scan-${t.ticketId}`, eventId: live.eventId, payload: t.reference });
    if (r.result !== "checked-in") throw new Error(`scan of ${t.reference} answered ${r.result}`);
    count("door check-ins", "done");
  }
  log(`door: ${admit.length} of ${tickets.length} tickets admitted at ${live.title}`);
  return live;
}

async function ensureRefundRequest(events: SeededEvent[]) {
  const target = events.find((e) => !e.live && e.org.phone === "+919000000002") ?? events.find((e) => !e.live)!;
  const booking = docs(await db.collection("bookings").where("eventId", "==", target.eventId).where("status", "==", "confirmed").get())
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0];
  if (!booking) {
    count("refund requests", "skipped");
    log(`skip refund request: no confirmed booking on ${target.title}`);
    return;
  }
  const requestId = `${RUN}-refund-1`;
  const existed = !!(await get("refunds", `req_${target.org.owner.uid}_${requestId}`));
  const r = await call("requestRefund", target.org.owner, {
    requestId, orgId: target.org.orgId, bookingId: booking.id,
    amountMinor: Math.round(booking.amountMinor / 2), reason: "Guest twisted an ankle on the approach; goodwill half refund.",
  });
  count("refund requests", existed ? "replayed" : "done");
  log(`refund requested by ${target.org.name}: ${r.refundId} (${r.status})`);
}

async function maybeReviews(live: SeededEvent, customers: Customer[]) {
  const ev = await get("events", live.eventId);
  if (ev!.endsAt.toMillis() > Date.now()) {
    count("reviews", "skipped");
    log(
      `skip reviews: no seeded event has ended yet (${live.title} runs ${iso(ev!.startsAt)} to ${iso(ev!.endsAt)}). saveEvent refuses starts ` +
        "under 2 h ahead and reviews need an ended event, so a completed event can't be made legitimately now. " +
        "Re-run the seed after that end to complete it and add two reviews."
    );
    return;
  }
  if (["published", "booking-closed", "live"].includes(ev!.status)) {
    await call("setEventPhase", live.org.owner, { requestId: `${RUN}-done-${live.eventId}`, orgId: live.org.orgId, eventId: live.eventId, phase: "completed" });
    count("event completed", "done");
    log(`${live.title} marked completed`);
  }
  const used = docs(await db.collection("tickets").where("eventId", "==", live.eventId).where("status", "==", "used").get());
  const reviewers = customers.filter((c) => used.some((t) => t.customerUid === c.session.uid)).slice(0, 2);
  const words = ["Great energy and well organised, would come again.", "Lovely group and a fun evening, the turf was in top shape."];
  for (const [i, c] of reviewers.entries()) {
    const r = await call("submitReview", c.session, { requestId: `${RUN}-review-${live.eventId}-${i}`, eventId: live.eventId, rating: 5 - i, comment: words[i] });
    count("reviews", r.replayed ? "replayed" : "done");
  }
}

async function ensureSettlement(org: Org, admin: Session) {
  const completed = await db.collection("events").where("orgId", "==", org.orgId).where("status", "==", "completed").limit(1).get();
  const requestId = `${RUN}-stl-${completed.empty ? "open" : "completed"}`;
  const existed = !!(await get("settlements", `stl_${org.orgId}_${requestId}`));
  const r = await call("buildSettlement", admin, {
    requestId,
    orgId: org.orgId,
    periodEnd: new Date(Date.now() - 60_000).toISOString(),
  });
  count("settlement built", existed ? "replayed" : "done");
  log(`settlement for ${org.name}: ${r.status}, ${r.entryCount} entries, net ₹${(r.netMinor / 100).toFixed(2)}${r.status === "empty" ? " (only completed events settle)" : ""}`);
}

async function summary() {
  const n = async (q: Json) => (await q.count().get()).data().count as number;
  const c = (name: string) => db.collection(name);
  const gross = docs(await c("payments").where("status", "==", "captured").get()).reduce((s, p) => s + Number(p.amountMinor ?? 0), 0);
  const rows: [string, number | string][] = [
    ["operators (platform users)", await n(c("users").where("scope", "==", "platform"))],
    ["organizer applications", await n(c("organizerApplications"))],
    ["  KYC cases still pending", await n(c("governanceCases").where("kind", "==", "organizer-kyc").where("status", "==", "pending"))],
    ["organizers active", await n(c("organizers").where("status", "==", "active"))],
    ["memberships active", await n(c("memberships").where("status", "==", "active"))],
    ["commercial agreements approved", await n(c("commercialAgreements").where("status", "==", "approved"))],
    ["experiences approved", await n(c("experiences").where("status", "==", "approved"))],
    ["events published", await n(c("events").where("status", "==", "published"))],
    ["events live", await n(c("events").where("status", "==", "live"))],
    ["events completed", await n(c("events").where("status", "==", "completed"))],
    ["customers with profiles", await n(c("customerSafety"))],
    ["bookings confirmed", await n(c("bookings").where("status", "==", "confirmed"))],
    ["payments captured", await n(c("payments").where("status", "==", "captured"))],
    ["gross captured (INR)", (gross / 100).toFixed(2)],
    ["tickets issued", await n(c("tickets"))],
    ["tickets checked in", await n(c("tickets").where("status", "==", "used"))],
    ["refunds under review", await n(c("refunds").where("status", "==", "under-review"))],
    ["ledger entries", await n(c("ledgerEntries"))],
    ["settlements", await n(c("settlements"))],
    ["reviews", await n(c("reviews"))],
  ];
  console.log(`\n${TAG} This run, per step (done / replayed / skipped)`);
  for (const [step, t] of Object.entries(tally)) {
    console.log(`  ${step.padEnd(28)} ${String(t.done).padStart(3)} / ${String(t.replayed).padStart(3)} / ${String(t.skipped).padStart(3)}`);
  }
  console.log(`\n${TAG} The emulator now holds`);
  for (const [label, value] of rows) console.log(`  ${label.padEnd(32)} ${String(value).padStart(10)}`);
  console.log(`\n${TAG} Console: admin@pulse.test / PulseAdmin#2026 (platform owner), ops@pulse.test / PulseOps#2026 (super-admin)`);
}

// ------------------------------------------------------------------ main

async function main() {
  const health = await fetch(`http://${FUNCTIONS_HOST}/${PROJECT}/us-central1/checkHealth`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: {} }),
  }).catch(() => null);
  if (!health?.ok) throw new Error(`the Functions emulator is not answering at ${FUNCTIONS_HOST}; start the emulators first`);

  log("1/7 operators");
  const { admin, ops } = await ensureOperators();
  log("2/7 organizer applications, KYC and activation");
  const orgs = await onboardOrganizers(admin);
  log("3/7 commercial terms, experiences and events");
  const events: SeededEvent[] = [];
  for (const org of orgs) {
    await ensureAgreement(org, admin, ops);
    const experienceIds = await ensureExperiences(org, admin);
    events.push(...(await ensureEvents(org, admin, experienceIds)));
  }
  log("4/7 customers, bookings and payments");
  const customers = await ensureCustomers();
  await ensureBookings(customers, events);
  log("5/7 live event and door check-in");
  const live = await goLiveAndCheckIn(events);
  log("6/7 refund request and reviews");
  await ensureRefundRequest(events);
  await maybeReviews(live, customers);
  log("7/7 settlement");
  await ensureSettlement(orgs[0]!, admin);
  await summary();
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(`${TAG} FAILED: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
);
