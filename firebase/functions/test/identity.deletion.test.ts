const deletedAuthUsers: string[] = [];
jest.mock("firebase-admin/auth", () => ({
  getAuth: () => ({
    deleteUser: async (uid: string) => {
      deletedAuthUsers.push(uid);
    },
  }),
}));

import { Timestamp } from "firebase-admin/firestore";
import { deleteMyAccount } from "../src/identity/deletion";
import { DomainError } from "../src/platform/errors";
import { phoneActor, seedOrg, seedUser, useEmulator } from "./identity-fixtures";

const h = useEmulator("identity-deletion");
const future = () => Timestamp.fromMillis(Date.now() + 3 * 24 * 60 * 60 * 1000);
const past = () => Timestamp.fromMillis(Date.now() - 3 * 24 * 60 * 60 * 1000);

async function refusal(uid: string): Promise<string> {
  try {
    await deleteMyAccount(phoneActor(uid, "+919800000001"));
  } catch (e) {
    expect(e).toBeInstanceOf(DomainError);
    return (e as DomainError).message;
  }
  throw new Error("expected a refusal");
}

beforeEach(async () => {
  deletedAuthUsers.length = 0;
  for (const c of ["bookings", "tripBookings", "legalHolds", "reviews"]) {
    const docs = await h.firestore().collection(c).get();
    await Promise.all(docs.docs.map((d) => d.ref.delete()));
  }
});

test("deletes the identity documents, the inbox and the sign-in, and keeps bookings", async () => {
  const fs = h.firestore();
  await seedUser(fs, "del-u1", "+919800000001");
  await fs.doc("customerSafety/del-u1").set({ birthDate: "1995-01-01", gender: "female" });
  await fs.doc("userNotifications/n1").set({ recipientUid: "del-u1", title: "t" });
  await fs.doc("userNotifications/n2").set({ recipientUid: "someone-else", title: "t" });
  await fs.doc("reviews/r1").set({ authorUid: "del-u1", authorName: "Test Person", rating: 5 });
  await fs.doc("events/ev-past").set({ startsAt: past() });
  await fs.doc("bookings/b-past").set({ customerUid: "del-u1", eventId: "ev-past", status: "confirmed" });

  await deleteMyAccount(phoneActor("del-u1", "+919800000001"));

  for (const path of ["users/del-u1", "publicProfiles/del-u1", "customerSafety/del-u1", "userNotifications/n1"]) {
    expect((await fs.doc(path).get()).exists).toBe(false);
  }
  expect((await fs.doc("userNotifications/n2").get()).exists).toBe(true);
  expect((await fs.doc("bookings/b-past").get()).exists).toBe(true);
  expect(deletedAuthUsers).toEqual(["del-u1"]);
  expect((await fs.doc("reviews/r1").get()).data()).toMatchObject({ authorUid: null, authorName: "PULSE member", rating: 5 });
  const audit = await fs.collection("auditEvents").where("action", "==", "account.deleted").get();
  expect(audit.docs.map((d) => d.data().resourceId)).toEqual(["del-u1"]);
});

test("an upcoming event booking blocks deletion", async () => {
  const fs = h.firestore();
  await seedUser(fs, "del-u2", "+919800000001");
  await fs.doc("events/ev-next").set({ startsAt: future() });
  await fs.doc("bookings/b-next").set({ customerUid: "del-u2", eventId: "ev-next", status: "confirmed" });
  expect(await refusal("del-u2")).toMatch(/upcoming booking/);
  expect((await fs.doc("users/del-u2").get()).exists).toBe(true);
  expect(deletedAuthUsers).toEqual([]);
});

test("a cancelled booking does not block deletion", async () => {
  const fs = h.firestore();
  await seedUser(fs, "del-u3", "+919800000001");
  await fs.doc("events/ev-next").set({ startsAt: future() });
  await fs.doc("bookings/b-cxl").set({ customerUid: "del-u3", eventId: "ev-next", status: "cancelled" });
  await deleteMyAccount(phoneActor("del-u3", "+919800000001"));
  expect(deletedAuthUsers).toEqual(["del-u3"]);
});

test("an upcoming trip blocks deletion", async () => {
  const fs = h.firestore();
  await seedUser(fs, "del-u4", "+919800000001");
  await fs.doc("tripBookings/t1").set({ customerUid: "del-u4", status: "confirmed", departureStart: future() });
  expect(await refusal("del-u4")).toMatch(/upcoming trip/);
});

test("an active host or staff role blocks deletion", async () => {
  const fs = h.firestore();
  await seedUser(fs, "del-u5", "+919800000001");
  await seedOrg(fs, "org-del", "del-u5");
  expect(await refusal("del-u5")).toMatch(/host or work/);
});

test("a legal hold blocks deletion", async () => {
  const fs = h.firestore();
  await seedUser(fs, "del-u6", "+919800000001");
  await fs.doc("legalHolds/user_del-u6").set({ subjectType: "user", subjectId: "del-u6", status: "active", reason: "x" });
  expect(await refusal("del-u6")).toMatch(/can't be deleted/);
  expect(deletedAuthUsers).toEqual([]);
});
