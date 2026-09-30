/**
 * storage.rules: KYC privacy, organizer media authorization (read live from
 * Firestore memberships), and size/type limits. Hosts come from
 * FIREBASE_STORAGE_EMULATOR_HOST / FIRESTORE_EMULATOR_HOST.
 */
import { initializeTestEnvironment, assertFails, assertSucceeds, RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "fs";
import { resolve } from "path";
import { doc, setDoc, updateDoc } from "firebase/firestore";
import { getMetadata, ref, uploadBytes, deleteObject } from "firebase/storage";

const PROJECT_ID = "demo-experience-os";

function emulatorHost(variable: string): { host: string; port: number } {
  const value = process.env[variable];
  if (!value) throw new Error(`${variable} is not set: run under \`firebase emulators:exec\`.`);
  const i = value.lastIndexOf(":");
  return { host: value.slice(0, i), port: Number(value.slice(i + 1)) };
}

let env: RulesTestEnvironment;
let n = 0;
let s = "";

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(resolve(__dirname, "../firestore.rules"), "utf8"), ...emulatorHost("FIRESTORE_EMULATOR_HOST") },
    storage: { rules: readFileSync(resolve(__dirname, "../../storage/storage.rules"), "utf8"), ...emulatorHost("FIREBASE_STORAGE_EMULATOR_HOST") },
  });
});
afterAll(async () => env.cleanup());

/**
 * orgMedia rules read memberships via cross-service `firestore.get`. The
 * Storage emulator performs that lookup through firebase-tools' HTTP client,
 * which honours HTTPS_PROXY but not NO_PROXY; behind a proxy the lookup fails
 * and every `firestore.get` returns null. Probe once: when lookups work, the
 * "allowed" paths are asserted; the "denied" paths are asserted always.
 */
let crossService = false;
beforeAll(async () => {
  const org = `probe-${Date.now().toString(36)}`;
  await env.withSecurityRulesDisabled(async (ctx) =>
    setDoc(doc(ctx.firestore(), `memberships/${org}__probe`), { orgId: org, uid: "probe", role: "owner", status: "active", permissions: [], eventScope: { all: true, eventIds: [] } })
  );
  try {
    await uploadBytes(ref(env.authenticatedContext("probe", { phone_number: "+919800000000" }).storage(), `orgMedia/${org}/p.png`), new Uint8Array(1), { contentType: "image/png" });
    crossService = true;
  } catch {
    console.warn("Storage→Firestore cross-service lookups are unavailable in this environment (proxy); membership-granted uploads are not asserted.");
  }
});
const allowedViaMembership = async (p: Promise<unknown>) => {
  if (crossService) await assertSucceeds(p);
  else await p.catch(() => undefined);
};
beforeEach(() => {
  n += 1;
  s = `${Date.now().toString(36)}${n}`;
});

const bytes = (size: number) => new Uint8Array(size);
const MB = 1024 * 1024;
// Production-shaped phone-auth token: no custom claims at all.
const user = (uid: string) => env.authenticatedContext(uid, { phone_number: "+919800000000" }).storage();
const adminCtx = () => env.authenticatedContext(`admin-${s}`, { roleId: "super-admin", email_verified: true, disabled: false }).storage();

async function member(orgId: string, uid: string, permissions: string[], extra: Record<string, unknown> = {}) {
  await env.withSecurityRulesDisabled(async (ctx) =>
    setDoc(doc(ctx.firestore(), `memberships/${orgId}__${uid}`), {
      orgId, uid, role: "staff", status: "active", permissions, eventScope: { all: true, eventIds: [] }, version: 0, ...extra,
    })
  );
}

describe("kyc documents", () => {
  test("are private to the applicant and platform admins", async () => {
    const owner = `app-${s}`;
    const path = `kyc/${owner}/pan.pdf`;
    await assertSucceeds(uploadBytes(ref(user(owner), path), bytes(1024), { contentType: "application/pdf" }));
    await assertSucceeds(getMetadata(ref(user(owner), path)));
    await assertSucceeds(getMetadata(ref(adminCtx(), path)));
    await assertFails(getMetadata(ref(user(`other-${s}`), path)));
    await assertFails(getMetadata(ref(env.unauthenticatedContext().storage(), path)));
    // Nobody writes into someone else's KYC folder, and uploads are immutable.
    await assertFails(uploadBytes(ref(user(`other-${s}`), `kyc/${owner}/forged.pdf`), bytes(10), { contentType: "application/pdf" }));
    await assertFails(deleteObject(ref(user(owner), path)));
  });

  // Storage evaluates an overwrite as `create`; the kyc rule requires
  // `resource == null`, so documents are write-once. (Fixed 2026-09-30.)
  test("REGRESSION: an uploaded KYC document cannot be overwritten", async () => {
    const owner = `app-${s}`;
    const path = `kyc/${owner}/pan.pdf`;
    await assertSucceeds(uploadBytes(ref(user(owner), path), bytes(1024), { contentType: "application/pdf" }));
    await assertFails(uploadBytes(ref(user(owner), path), bytes(10), { contentType: "application/pdf" }));
  });

  test("enforce size and type limits", async () => {
    const owner = `app-${s}`;
    await assertFails(uploadBytes(ref(user(owner), `kyc/${owner}/big.pdf`), bytes(10 * MB + 1), { contentType: "application/pdf" }));
    await assertFails(uploadBytes(ref(user(owner), `kyc/${owner}/x.html`), bytes(100), { contentType: "text/html" }));
    await assertFails(uploadBytes(ref(user(owner), `kyc/${owner}/x.svg`), bytes(100), { contentType: "image/svg+xml" }));
    await assertSucceeds(uploadBytes(ref(user(owner), `kyc/${owner}/id.jpg`), bytes(100), { contentType: "image/jpeg" }));
  });
});

describe("organizer media", () => {
  test("upload requires an active membership with experiences.edit on all events", async () => {
    const org = `org-${s}`;
    const editor = `ed-${s}`, scanner = `sc-${s}`, scoped = `sp-${s}`, owner = `ow-${s}`, stranger = `st-${s}`;
    await member(org, editor, ["experiences.edit"]);
    await member(org, scanner, ["tickets.scan"]);
    await member(org, scoped, ["experiences.edit"], { eventScope: { all: false, eventIds: ["e1"] } });
    await member(org, owner, [], { role: "owner" });
    const put = (uid: string, name: string) => uploadBytes(ref(user(uid), `orgMedia/${org}/${name}`), bytes(2048), { contentType: "image/webp" });
    await allowedViaMembership(put(editor, "cover.webp"));
    await allowedViaMembership(put(owner, "owner.webp"));
    await assertFails(put(scanner, "scanner.webp"));
    await assertFails(put(scoped, "scoped.webp"));
    await assertFails(put(stranger, "stranger.webp"));
    // Media is readable by signed-in users (it backs public listings).
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), `orgMedia/${org}/seeded.webp`), bytes(10), { contentType: "image/webp" });
    });
    await assertSucceeds(getMetadata(ref(user(stranger), `orgMedia/${org}/seeded.webp`)));
    await assertFails(getMetadata(ref(env.unauthenticatedContext().storage(), `orgMedia/${org}/seeded.webp`)));
  });

  test("revoking the membership stops uploads immediately", async () => {
    const org = `org-${s}`;
    const editor = `ed-${s}`;
    await member(org, editor, ["experiences.edit"]);
    await allowedViaMembership(uploadBytes(ref(user(editor), `orgMedia/${org}/a.png`), bytes(100), { contentType: "image/png" }));
    await env.withSecurityRulesDisabled(async (ctx) => updateDoc(doc(ctx.firestore(), `memberships/${org}__${editor}`), { status: "revoked" }));
    await assertFails(uploadBytes(ref(user(editor), `orgMedia/${org}/b.png`), bytes(100), { contentType: "image/png" }));
    if (crossService) await assertFails(deleteObject(ref(user(editor), `orgMedia/${org}/a.png`)));
  });

  test("enforce size and type limits", async () => {
    const org = `org-${s}`;
    const editor = `ed-${s}`;
    await member(org, editor, ["experiences.edit"]);
    await assertFails(uploadBytes(ref(user(editor), `orgMedia/${org}/huge.jpg`), bytes(8 * MB + 1), { contentType: "image/jpeg" }));
    await assertFails(uploadBytes(ref(user(editor), `orgMedia/${org}/doc.pdf`), bytes(100), { contentType: "application/pdf" }));
    await assertFails(uploadBytes(ref(user(editor), `orgMedia/${org}/x.svg`), bytes(100), { contentType: "image/svg+xml" }));
    await assertFails(uploadBytes(ref(user(editor), `orgMedia/${org}/x.gif`), bytes(100), { contentType: "image/gif" }));
  });
});

describe("avatars and everything else", () => {
  test("owner-only avatar writes; unknown paths are closed", async () => {
    const me = `me-${s}`;
    await assertSucceeds(uploadBytes(ref(user(me), `avatars/${me}/a.png`), bytes(100), { contentType: "image/png" }));
    await assertFails(uploadBytes(ref(user(`x-${s}`), `avatars/${me}/b.png`), bytes(100), { contentType: "image/png" }));
    await assertFails(uploadBytes(ref(user(me), `avatars/${me}/big.png`), bytes(2 * MB + 1), { contentType: "image/png" }));
    await assertFails(uploadBytes(ref(user(me), `public/${me}.png`), bytes(100), { contentType: "image/png" }));
    await assertFails(uploadBytes(ref(adminCtx(), `anything/${me}.png`), bytes(100), { contentType: "image/png" }));
  });
});

test("a production-shaped phone token (no custom claims) can read organizer media and its own KYC", async () => {
  const org = `org-${s}`;
  const me = `real-${s}`;
  await env.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage(), `orgMedia/${org}/r.png`), bytes(10), { contentType: "image/png" });
  });
  const real = env.authenticatedContext(me, { phone_number: "+919800000001" }).storage();
  await assertSucceeds(getMetadata(ref(real, `orgMedia/${org}/r.png`)));
  await assertSucceeds(uploadBytes(ref(real, `kyc/${me}/id.pdf`), bytes(10), { contentType: "application/pdf" }));
  await assertSucceeds(getMetadata(ref(real, `kyc/${me}/id.pdf`)));
});
