/**
 * Trips (functions/src/trips): drafts are the organizer team's, published
 * trips are public, bookings (with traveller names, ages and emergency
 * contacts) are the booker's alone, and departure updates reach only the
 * organizer team and travellers confirmed on that departure.
 */
import { initializeTestEnvironment, assertFails, assertSucceeds, RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "fs";
import { resolve } from "path";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where } from "firebase/firestore";

const PROJECT_ID = "demo-experience-os";
const [HOST, PORT] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8380").split(":");
const ORG = "org-alpha";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(resolve(__dirname, "../firestore.rules"), "utf8"), host: HOST, port: Number(PORT) },
  });
});
afterAll(async () => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const put = (p: string, v: Record<string, unknown>) => setDoc(doc(db, p), v);
    const m = (uid: string, v: Record<string, unknown>) => put(`memberships/${ORG}__${uid}`, { orgId: ORG, uid, version: 1, ...v });
    await m("owner", { role: "owner", status: "active", permissions: [], eventScope: { all: true, eventIds: [] } });
    await m("scanonly", { role: "staff", status: "active", permissions: ["tickets.scan"], eventScope: { all: true, eventIds: [] } });
    await m("revoked", { role: "staff", status: "revoked", permissions: ["experiences.view"], eventScope: { all: true, eventIds: [] } });
    await put("tripDrafts/ht-1", { orgId: ORG, status: "draft", title: "Coorg" });
    await put("trips/t-ht-1", { orgId: ORG, status: "live", title: "Coorg" });
    await put("tripDepartures/dep-1", { orgId: ORG, tripId: "t-ht-1", seatsTotal: 20, seatsTaken: 2 });
    await put("tripBookings/tb-1", {
      orgId: ORG, customerUid: "cust-1", departureId: "dep-1", status: "confirmed", checked: [],
      people: [{ name: "Asha R", age: 27, gender: "woman" }], emergencyName: "Mum", emergencyPhone: "+919800000000",
    });
    await put("tripBookings/tb-2", { orgId: ORG, customerUid: "cust-2", departureId: "dep-1", status: "confirmed", checked: [] });
    await put("tripPayments/tp-1", { orgId: ORG, customerUid: "cust-1", bookingId: "tb-1" });
    await put("tripRefunds/tr-1", { orgId: ORG, customerUid: "cust-1", bookingId: "tb-1" });
    await put("tripUpdates/up-1", { orgId: ORG, departureId: "dep-1", text: "Pickup moved", important: false });
    await put("tripTravellers/dep-1__cust-1", { departureId: "dep-1", uid: "cust-1", bookings: 1 });
    await put("tripWaitlist/dep-1__cust-3", { departureId: "dep-1", tripId: "t-ht-1", orgId: ORG, uid: "cust-3" });
  });
});

const phone = (uid: string) => env.authenticatedContext(uid, { phone_number: "+919800000001" }).firestore();
const admin = () => env.authenticatedContext("admin-1", { roleId: "super-admin", email_verified: true }).firestore();

test("published trips and departures are readable by anyone signed in; nobody writes them", async () => {
  const db = phone("cust-9");
  await assertSucceeds(getDoc(doc(db, "trips/t-ht-1")));
  await assertSucceeds(getDocs(query(collection(db, "trips"), where("status", "==", "live"))));
  await assertSucceeds(getDocs(query(collection(db, "tripDepartures"), where("tripId", "in", ["t-ht-1"]))));
  await assertFails(setDoc(doc(db, "trips/t-x"), { orgId: ORG, status: "live" }));
  await assertFails(updateDoc(doc(phone("owner"), "tripDepartures/dep-1"), { seatsTaken: 0 }));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "trips/t-ht-1")));
});

test("drafts: the organizer team and admins only", async () => {
  await assertSucceeds(getDoc(doc(phone("owner"), "tripDrafts/ht-1")));
  await assertSucceeds(getDocs(query(collection(phone("owner"), "tripDrafts"), where("orgId", "==", ORG))));
  await assertSucceeds(getDocs(query(collection(admin(), "tripDrafts"), where("status", "==", "in-review"))));
  await assertFails(getDoc(doc(phone("cust-1"), "tripDrafts/ht-1")));
  await assertFails(getDoc(doc(phone("scanonly"), "tripDrafts/ht-1")));
  await assertFails(getDoc(doc(phone("revoked"), "tripDrafts/ht-1")));
  await assertFails(updateDoc(doc(phone("owner"), "tripDrafts/ht-1"), { status: "live" }));
});

test("traveller details: the booker reads their own booking, co-travellers and organizers never read it directly", async () => {
  await assertSucceeds(getDoc(doc(phone("cust-1"), "tripBookings/tb-1")));
  await assertSucceeds(getDocs(query(collection(phone("cust-1"), "tripBookings"), where("customerUid", "==", "cust-1"))));
  // A co-traveller on the same departure.
  await assertFails(getDoc(doc(phone("cust-2"), "tripBookings/tb-1")));
  await assertFails(getDocs(query(collection(phone("cust-2"), "tripBookings"), where("departureId", "==", "dep-1"))));
  // The organizer uses getTripManifest instead.
  await assertFails(getDoc(doc(phone("owner"), "tripBookings/tb-1")));
  await assertSucceeds(getDoc(doc(admin(), "tripBookings/tb-1")));
});

test("the booker may only tick their packing checklist", async () => {
  const db = phone("cust-1");
  await assertSucceeds(updateDoc(doc(db, "tripBookings/tb-1"), { checked: ["Documents/ID"] }));
  await assertFails(updateDoc(doc(db, "tripBookings/tb-1"), { status: "cancelled" }));
  await assertFails(updateDoc(doc(db, "tripBookings/tb-1"), { checked: ["x"], paid: 99999 }));
  await assertFails(updateDoc(doc(phone("cust-2"), "tripBookings/tb-1"), { checked: [] }));
  await assertFails(deleteDoc(doc(db, "tripBookings/tb-1")));
  await assertFails(setDoc(doc(db, "tripBookings/tb-new"), { customerUid: "cust-1", checked: [] }));
});

test("trip payments and refunds: owner (and refunds.view for refunds)", async () => {
  await assertSucceeds(getDoc(doc(phone("cust-1"), "tripPayments/tp-1")));
  await assertSucceeds(getDoc(doc(phone("cust-1"), "tripRefunds/tr-1")));
  await assertFails(getDoc(doc(phone("cust-2"), "tripPayments/tp-1")));
  await assertFails(getDoc(doc(phone("cust-2"), "tripRefunds/tr-1")));
  await assertFails(getDoc(doc(phone("owner"), "tripPayments/tp-1")));
  await assertSucceeds(getDoc(doc(phone("owner"), "tripRefunds/tr-1")));
});

test("departure updates: confirmed travellers on that departure and the organizer team", async () => {
  await assertSucceeds(getDocs(query(collection(phone("cust-1"), "tripUpdates"), where("departureId", "==", "dep-1"))));
  await assertSucceeds(getDoc(doc(phone("cust-1"), "tripUpdates/up-1")));
  await assertSucceeds(getDocs(query(collection(phone("owner"), "tripUpdates"), where("orgId", "==", ORG), where("departureId", "==", "dep-1"))));
  // Not travelling on it.
  await assertFails(getDocs(query(collection(phone("cust-9"), "tripUpdates"), where("departureId", "==", "dep-1"))));
  await assertFails(getDoc(doc(phone("cust-9"), "tripUpdates/up-1")));
  await assertFails(setDoc(doc(phone("owner"), "tripUpdates/up-2"), { orgId: ORG, departureId: "dep-1", text: "hi" }));
});

test("traveller markers: own only, never listed", async () => {
  await assertSucceeds(getDoc(doc(phone("cust-1"), "tripTravellers/dep-1__cust-1")));
  await assertFails(getDoc(doc(phone("cust-2"), "tripTravellers/dep-1__cust-1")));
  await assertFails(getDocs(query(collection(phone("cust-1"), "tripTravellers"), where("departureId", "==", "dep-1"))));
});

test("waitlist entries: the person's own, read-only; listing only their own", async () => {
  await assertSucceeds(getDoc(doc(phone("cust-3"), "tripWaitlist/dep-1__cust-3")));
  await assertSucceeds(getDocs(query(collection(phone("cust-3"), "tripWaitlist"), where("uid", "==", "cust-3"))));
  await assertFails(getDoc(doc(phone("cust-1"), "tripWaitlist/dep-1__cust-3")));
  await assertFails(getDoc(doc(phone("owner"), "tripWaitlist/dep-1__cust-3")));
  await assertFails(getDocs(query(collection(phone("cust-3"), "tripWaitlist"), where("departureId", "==", "dep-1"))));
  await assertFails(setDoc(doc(phone("cust-1"), "tripWaitlist/dep-1__cust-1"), { departureId: "dep-1", uid: "cust-1" }));
  await assertFails(deleteDoc(doc(phone("cust-3"), "tripWaitlist/dep-1__cust-3")));
});
