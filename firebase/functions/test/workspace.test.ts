import { deleteApp, getApps } from "firebase-admin/app";
import { parseSyncCommand, syncWorkspaceSlices } from "../src/workspace/sync";
import { db } from "../src/platform/firestore";
import { DomainError } from "../src/platform/errors";

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
process.env.GCLOUD_PROJECT = "demo-experience-os";

const actor = { uid: "admin-001", roleId: "super-admin", email: "admin@example.com", name: "Admin One" };
const WS = "test-ws";

async function clear() {
  for (const sub of ["slices", "chunks"]) {
    const docs = await db().collection("workspaces").doc(WS).collection(sub).get();
    const batch = db().batch();
    docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

async function readSlice(name: string): Promise<unknown[]> {
  const meta = (await db().doc(`workspaces/${WS}/slices/${name}`).get()).data()!;
  const parts = await Promise.all(Array.from({ length: meta.chunkCount }, (_, n) => db().doc(`workspaces/${WS}/chunks/${name}__${n}`).get()));
  return parts.flatMap((p) => JSON.parse(p.data()!.json));
}

beforeEach(clear);
afterAll(async () => Promise.all(getApps().map((a) => deleteApp(a))));

test("parse rejects malformed commands", () => {
  expect(() => parseSyncCommand({ workspaceId: "Bad Id", slices: [] })).toThrow(DomainError);
  expect(() => parseSyncCommand({ workspaceId: WS, slices: [{ name: "x y", expectedVersion: 0, items: [] }] })).toThrow(/valid slice name/);
  expect(() => parseSyncCommand({ workspaceId: WS, slices: [{ name: "bookings", expectedVersion: -1, items: [] }] })).toThrow(/non-negative/);
});

test("first write creates version 1 and round-trips items", async () => {
  const items = [{ id: "b-1", status: "confirmed" }, { id: "b-2", status: "waitlisted" }];
  const res = await syncWorkspaceSlices({ workspaceId: WS, slices: [{ name: "bookings", expectedVersion: 0, items }] }, actor);
  expect(res.versions.bookings).toBe(1);
  expect(await readSlice("bookings")).toEqual(items);
});

test("a write based on a stale version is refused with CONFLICT", async () => {
  await syncWorkspaceSlices({ workspaceId: WS, slices: [{ name: "venues", expectedVersion: 0, items: [{ id: "v-1" }] }] }, actor);
  await expect(syncWorkspaceSlices({ workspaceId: WS, slices: [{ name: "venues", expectedVersion: 0, items: [{ id: "v-2" }] }] }, actor)).rejects.toMatchObject({ code: "CONFLICT" });
  expect(await readSlice("venues")).toEqual([{ id: "v-1" }]);
});

test("append-only record slices merge concurrent writers instead of conflicting", async () => {
  await syncWorkspaceSlices({ workspaceId: WS, slices: [{ name: "activityLog", expectedVersion: 0, items: [{ id: "a1", at: "2026-09-29T10:00:00.000Z" }] }] }, actor);
  // A second operator whose client never saw a1 still appends safely.
  await syncWorkspaceSlices({ workspaceId: WS, slices: [{ name: "activityLog", expectedVersion: 0, items: [{ id: "a2", at: "2026-09-29T10:05:00.000Z" }] }] }, actor);
  const log = (await readSlice("activityLog")) as Array<{ id: string }>;
  expect(log.map((r) => r.id)).toEqual(["a2", "a1"]);
});

test("large slices are split into chunks and old chunks are removed when the slice shrinks", async () => {
  const big = Array.from({ length: 3000 }, (_, i) => ({ id: `r-${i}`, note: "x".repeat(600) }));
  await syncWorkspaceSlices({ workspaceId: WS, slices: [{ name: "audits", expectedVersion: 0, items: big }] }, actor);
  const meta1 = (await db().doc(`workspaces/${WS}/slices/audits`).get()).data()!;
  expect(meta1.chunkCount).toBeGreaterThan(1);
  await syncWorkspaceSlices({ workspaceId: WS, slices: [{ name: "shifts", expectedVersion: 0, items: [{ id: "s" }] }] }, actor);
  const small = [{ id: "only" }];
  await syncWorkspaceSlices({ workspaceId: WS, slices: [{ name: "sessions", expectedVersion: 0, items: big }] }, actor);
  await syncWorkspaceSlices({ workspaceId: WS, slices: [{ name: "sessions", expectedVersion: 1, items: small }] }, actor);
  const meta2 = (await db().doc(`workspaces/${WS}/slices/sessions`).get()).data()!;
  expect(meta2.chunkCount).toBe(1);
  expect(await readSlice("sessions")).toEqual(small);
  const chunks = await db().collection(`workspaces/${WS}/chunks`).get();
  expect(chunks.docs.filter((d) => d.id.startsWith("sessions__")).map((d) => d.id)).toEqual(["sessions__0"]);
});
