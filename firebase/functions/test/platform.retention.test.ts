/**
 * KYC purge (platform/retention.ts purgeRejectedKyc): persisted cursor and
 * legal-hold re-checks around the Storage deletion.
 *
 * Firestore is the emulator. Storage is replaced by an in-memory bucket (the
 * suite runs with --only firestore,auth) so the REAL deleteStoragePrefix, with
 * its per-page hold check, is what runs.
 */

type FakeFile = { name: string; delete: () => Promise<void> };
const store = new Map<string, Set<string>>();
/** Called on every getFiles(); lets a test place a hold at a precise moment. */
let onList: (prefix: string, call: number) => Promise<void> = async () => undefined;
const listCalls = new Map<string, number>();

jest.mock("firebase-admin/storage", () => ({
  getStorage: () => ({
    bucket: () => ({
      getFiles: async ({ prefix, maxResults }: { prefix: string; maxResults: number }) => {
        const n = (listCalls.get(prefix) ?? 0) + 1;
        listCalls.set(prefix, n);
        await onList(prefix, n);
        const names = [...(store.get(prefix) ?? [])].slice(0, maxResults);
        const files: FakeFile[] = names.map((name) => ({
          name,
          delete: async () => {
            store.get(prefix)?.delete(name);
          },
        }));
        return [files];
      },
    }),
  }),
}));

import { db, Timestamp, uniq } from "./commerce-helpers";
import { runRetention, KYC_CURSOR_DOC, JOB_STATE } from "../src/platform/retention";

jest.setTimeout(180_000);

const DAY = 24 * 3_600_000;
const ts = (msFromNow: number) => Timestamp.fromMillis(Date.now() + msFromNow);
const get = async (path: string) => (await db().doc(path).get()).data();
const cursorPath = `${JOB_STATE}/${KYC_CURSOR_DOC}`;

function seedFiles(uid: string, n: number) {
  store.set(`kyc/${uid}/`, new Set(Array.from({ length: n }, (_, i) => `kyc/${uid}/doc-${i}.pdf`)));
}
const remaining = (uid: string) => store.get(`kyc/${uid}/`)?.size ?? 0;
const hold = (uid: string) =>
  db().doc(`legalHolds/user_${uid}`).set({ subjectType: "user", subjectId: uid, status: "active", reason: "Regulator request pending" });

type KycSummary = {
  purged: number;
  scanned: number;
  alreadyPurged: number;
  held: number;
  stoppedByHold: number;
  purgedDespiteHold: number;
  resumedFromCursor: boolean;
  cycleComplete: boolean;
  more: boolean;
};
const kyc = (s: { steps: Record<string, unknown> }) => s.steps.kycDocuments as KycSummary;

beforeEach(async () => {
  onList = async () => undefined;
  listCalls.clear();
  await db().doc(cursorPath).delete();
});
afterAll(async () => {
  await db().doc(cursorPath).delete();
});

test("jobState is not a client collection (the rules catch-all denies it)", () => {
  const rules = require("node:fs").readFileSync(require("node:path").join(__dirname, "../../firestore/firestore.rules"), "utf8") as string;
  expect(rules).not.toMatch(/jobState/);
  expect(rules).toMatch(/match \/\{document=\*\*\} \{ allow read, write: if false; \}/);
  const adminReadable = rules.match(/collection in \[([^\]]*)\]/)?.[1] ?? "";
  expect(adminReadable).not.toContain("jobState");
});

test("already-purged applications don't starve newer ones: each run resumes after the last one examined", async () => {
  const t = uniq("cur");
  // The oldest rejected applications in the database (older than anything
  // else the suites seed), already purged: they used to be rescanned first on
  // every run and eat the whole scan budget.
  const done = [0, 1, 2, 3, 4].map((i) => `${t}-done-${i}`);
  const fresh = [0, 1, 2].map((i) => `${t}-new-${i}`);
  await Promise.all([
    ...done.map((id, i) =>
      db().doc(`organizerApplications/${id}`).set({ status: "rejected", decidedAt: ts(-9000 * DAY + i * 1000), kycPurgedAt: ts(-8000 * DAY) })
    ),
    ...fresh.map((id, i) => db().doc(`organizerApplications/${id}`).set({ status: "rejected", decidedAt: ts(-8990 * DAY + i * 1000) })),
  ]);
  for (const id of fresh) seedFiles(id, 2);

  const r1 = kyc(await runRetention({ kycMaxScan: 4, pageSize: 2 }));
  expect(r1).toMatchObject({ scanned: 4, alreadyPurged: 4, purged: 0, resumedFromCursor: false, cycleComplete: false, more: true });
  const c1 = (await get(cursorPath))!;
  expect(c1.id).toBe(done[3]);

  const r2 = kyc(await runRetention({ kycMaxScan: 4, pageSize: 2 }));
  expect(r2).toMatchObject({ scanned: 4, alreadyPurged: 1, purged: 3, resumedFromCursor: true });
  for (const id of fresh) {
    expect((await get(`organizerApplications/${id}`))!.kycPurgedAt).toBeInstanceOf(Timestamp);
    expect(remaining(id)).toBe(0);
  }

  // Keep going until the end of the eligible set: the cursor is then cleared
  // and the next run starts a new cycle from the oldest.
  let last: KycSummary = r2;
  for (let i = 0; i < 200 && !last.cycleComplete; i++) last = kyc(await runRetention({ kycMaxScan: 50, pageSize: 20 }));
  expect(last).toMatchObject({ cycleComplete: true, more: false });
  const c2 = (await get(cursorPath))!;
  expect(c2.id).toBeNull();
  expect(c2.decidedAt).toBeNull();
  const r3 = kyc(await runRetention({ kycMaxScan: 2, pageSize: 2 }));
  expect(r3.resumedFromCursor).toBe(false);
  expect((await get(cursorPath))!.id).toBe(done[1]);
});

test("a hold placed between Storage pages stops the deletion: alerted, logged, not recorded as purged", async () => {
  const uid = uniq("kyc-mid");
  await db().doc(`organizerApplications/${uid}`).set({ status: "rejected", decidedAt: ts(-9500 * DAY) });
  seedFiles(uid, 600); // two pages of 500
  onList = async (prefix, call) => {
    if (prefix === `kyc/${uid}/` && call === 2) await hold(uid);
  };
  const s = await runRetention({});
  expect(s.status).toBe("ok");
  expect(kyc(s).stoppedByHold).toBeGreaterThanOrEqual(1);
  expect(remaining(uid)).toBe(100); // the second page was never deleted
  const app = (await get(`organizerApplications/${uid}`))!;
  expect(app.kycPurgedAt).toBeUndefined();
  const alert = (await get(`riskAlerts/kyc-purged-under-hold_${uid}`))!;
  expect(alert).toMatchObject({ kind: "kyc-purged-under-hold", severity: "high", status: "open", detail: { uid, filesDeleted: 500, partial: true } });
});

test("a hold placed just before the first delete means nothing is deleted and no alert is needed", async () => {
  const uid = uniq("kyc-first");
  await db().doc(`organizerApplications/${uid}`).set({ status: "rejected", decidedAt: ts(-9400 * DAY) });
  seedFiles(uid, 3);
  onList = async (prefix, call) => {
    if (prefix === `kyc/${uid}/` && call === 1) await hold(uid);
  };
  const s = await runRetention({});
  expect(kyc(s).stoppedByHold).toBeGreaterThanOrEqual(1);
  expect(remaining(uid)).toBe(3);
  expect((await get(`organizerApplications/${uid}`))!.kycPurgedAt).toBeUndefined();
  expect(await get(`riskAlerts/kyc-purged-under-hold_${uid}`)).toBeUndefined();
});

test("a hold that appears after the files are gone is re-checked in the recording transaction and raises an alert", async () => {
  const uid = uniq("kyc-late");
  await db().doc(`organizerApplications/${uid}`).set({ status: "rejected", decidedAt: ts(-9300 * DAY) });
  seedFiles(uid, 2);
  onList = async (prefix, call) => {
    if (prefix === `kyc/${uid}/` && call === 2) await hold(uid); // the final, empty listing
  };
  const s = await runRetention({});
  expect(kyc(s).purgedDespiteHold).toBeGreaterThanOrEqual(1);
  expect(remaining(uid)).toBe(0);
  const app = (await get(`organizerApplications/${uid}`))!;
  expect(app).toMatchObject({ kycFilesDeleted: 2, kycPurgedDespiteHold: true });
  expect(app.kycPurgedAt).toBeInstanceOf(Timestamp);
  expect((await get(`riskAlerts/kyc-purged-under-hold_${uid}`))!).toMatchObject({ severity: "high", detail: { uid, filesDeleted: 2 } });
  const audits = await db().collection("auditEvents").where("resourceId", "==", uid).get();
  const purged = audits.docs.map((d) => d.data()).filter((a) => a.action === "retention.kyc-purged");
  expect(purged).toHaveLength(1);
  expect(purged[0]!.after).toMatchObject({ legalHoldActiveAtRecord: true });
});
