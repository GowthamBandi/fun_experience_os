/**
 * Commerce read models under the security rules (ADR-0003 / ADR-0005).
 * Host/port come from FIRESTORE_EMULATOR_HOST (set by `firebase emulators:exec`).
 */

import { initializeTestEnvironment, assertFails, assertSucceeds, RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "fs";
import { resolve } from "path";
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";

const PROJECT_ID = "demo-experience-os";
const [HOST, PORT] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080").split(":");

let env: RulesTestEnvironment;

const ORG = "org-a";
const EV_A = "event-a";
const EV_B = "event-b";

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(resolve(__dirname, "../firestore.rules"), "utf8"), host: HOST!, port: Number(PORT) },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const put = (p: string, v: Record<string, unknown>) => setDoc(doc(db, p), v);
    const member = (uid: string, permissions: string[], eventScope: unknown, status = "active", role = "staff") =>
      put(`memberships/${ORG}__${uid}`, { orgId: ORG, uid, role, status, permissions, eventScope, version: 1 });

    await member("owner", [], { all: true, eventIds: [] }, "active", "owner");
    await member("door-a", ["attendees.view", "tickets.scan"], { all: false, eventIds: [EV_A] });
    await member("finance", ["earnings.view", "refunds.view"], { all: true, eventIds: [] });
    await member("finance-scoped", ["earnings.view"], { all: false, eventIds: [EV_A] });
    await member("revoked", ["attendees.view", "tickets.scan", "earnings.view"], { all: true, eventIds: [] }, "revoked");

    await put("bookings/bk-a", { orgId: ORG, eventId: EV_A, customerUid: "cust-1", alias: "Asha", spots: 1, status: "confirmed" });
    await put("bookings/bk-b", { orgId: ORG, eventId: EV_B, customerUid: "cust-2", alias: "Ravi", spots: 2, status: "held" });
    await put("tickets/tk-a", { orgId: ORG, eventId: EV_A, bookingId: "bk-a", customerUid: "cust-1", status: "valid" });
    await put("tickets/tk-b", { orgId: ORG, eventId: EV_B, bookingId: "bk-b", customerUid: "cust-2", status: "valid" });
    await put("ticketSecrets/tk-a", { customerUid: "cust-1", payload: "PX1.x.y", eventId: EV_A, bookingId: "bk-a" });
    await put("payments/pay-a", { orgId: ORG, eventId: EV_A, bookingId: "bk-a", customerUid: "cust-1", amountMinor: 99_900, status: "captured" });
    await put("refunds/rf-a", { orgId: ORG, eventId: EV_A, bookingId: "bk-a", customerUid: "cust-1", amountMinor: 1_000, status: "processing" });
    await put("ledgerEntries/cap_pay-a_0", { orgId: ORG, account: "organizer_payable", direction: "credit", amountMinor: 87_413, txnId: "cap_pay-a" });
    await put("settlements/stl-1", { orgId: ORG, netMinor: 87_413, status: "pending-approval" });
    await put(`eventCommercials/${EV_A}`, { orgId: ORG, eventId: EV_A, commissionBps: 1_250, commercialAgreementId: "ca-1" });
    await put("paymentEvents/evt_1", { type: "payment.captured" });
    await put("jobRuns/dataRetention_2026-09-30", { job: "dataRetention", status: "completed" });
    await put("legalHolds/user_cust-1", { subjectType: "user", subjectId: "cust-1", status: "active" });
    await put("rateLimits/reserve_cust-1", { count: 1 });
    await put("bookingLocks/event-a__cust-1", { bookingId: "bk-a", customerUid: "cust-1" });
    await put("commandReceipts/reserveSeat_cust-1_r1", { actorUid: "cust-1" });
  });
});

const phone = (uid: string) => env.authenticatedContext(uid, { phone_number: "+919800000001" }).firestore();
const admin = () => env.authenticatedContext("admin-1", { roleId: "super-admin", email_verified: true }).firestore();

describe("customers", () => {
  test("read their own bookings, tickets, ticket secrets, payments and refunds", async () => {
    const db = phone("cust-1");
    for (const p of ["bookings/bk-a", "tickets/tk-a", "ticketSecrets/tk-a", "payments/pay-a", "refunds/rf-a"]) {
      await assertSucceeds(getDoc(doc(db, p)));
    }
    await assertSucceeds(getDocs(query(collection(db, "bookings"), where("customerUid", "==", "cust-1"))));
    await assertSucceeds(getDocs(query(collection(db, "tickets"), where("customerUid", "==", "cust-1"))));
  });

  test("cannot read another customer's documents or list everyone's", async () => {
    const db = phone("cust-2");
    for (const p of ["bookings/bk-a", "tickets/tk-a", "ticketSecrets/tk-a", "payments/pay-a", "refunds/rf-a"]) {
      await assertFails(getDoc(doc(db, p)));
    }
    await assertFails(getDocs(collection(db, "bookings")));
    await assertFails(getDocs(query(collection(db, "bookings"), where("customerUid", "==", "cust-1"))));
    await assertFails(getDocs(collection(db, "ticketSecrets")));
  });

  test("signed-out users read nothing", async () => {
    const db = env.unauthenticatedContext().firestore();
    for (const p of ["bookings/bk-a", "tickets/tk-a", "ticketSecrets/tk-a", "payments/pay-a", "ledgerEntries/cap_pay-a_0"]) {
      await assertFails(getDoc(doc(db, p)));
    }
  });
});

describe("organizer staff", () => {
  test("attendees.view on event A reads A's bookings but not B's", async () => {
    const db = phone("door-a");
    await assertSucceeds(getDoc(doc(db, "bookings/bk-a")));
    await assertFails(getDoc(doc(db, "bookings/bk-b")));
    await assertSucceeds(getDocs(query(collection(db, "bookings"), where("orgId", "==", ORG), where("eventId", "==", EV_A))));
    await assertFails(getDocs(query(collection(db, "bookings"), where("orgId", "==", ORG), where("eventId", "==", EV_B))));
    await assertSucceeds(getDoc(doc(db, "tickets/tk-a")));
    await assertFails(getDoc(doc(db, "tickets/tk-b")));
  });

  test("scanning staff never see the QR secret or payments", async () => {
    const db = phone("door-a");
    await assertFails(getDoc(doc(db, "ticketSecrets/tk-a")));
    await assertFails(getDoc(doc(db, "payments/pay-a")));
  });

  test("staff without earnings.view cannot read ledger or settlements; with it (all events) they can", async () => {
    await assertFails(getDoc(doc(phone("door-a"), "ledgerEntries/cap_pay-a_0")));
    await assertFails(getDoc(doc(phone("door-a"), "settlements/stl-1")));
    // earnings.view is organization-wide: an event-scoped grant is not enough.
    await assertFails(getDoc(doc(phone("finance-scoped"), "ledgerEntries/cap_pay-a_0")));
    await assertFails(getDoc(doc(phone("finance-scoped"), "settlements/stl-1")));
    await assertSucceeds(getDoc(doc(phone("finance"), "ledgerEntries/cap_pay-a_0")));
    await assertSucceeds(getDoc(doc(phone("finance"), "settlements/stl-1")));
    await assertSucceeds(getDoc(doc(phone("owner"), "settlements/stl-1")));
  });

  test("commission terms are visible only to org-wide earnings.view, admins and auditors — never customers or door staff", async () => {
    const path = `eventCommercials/${EV_A}`;
    await assertSucceeds(getDoc(doc(phone("finance"), path)));
    await assertSucceeds(getDoc(doc(phone("owner"), path)));
    await assertSucceeds(getDoc(doc(admin(), path)));
    await assertFails(getDoc(doc(phone("finance-scoped"), path)));
    await assertFails(getDoc(doc(phone("door-a"), path)));
    await assertFails(getDoc(doc(phone("cust-1"), path)));
    await assertFails(getDoc(doc(phone("revoked"), path)));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), path)));
    for (const db of [phone("owner"), admin()]) await assertFails(setDoc(doc(db, path), { orgId: ORG, commissionBps: 0 }));
  });

  test("revoked staff read nothing", async () => {
    const db = phone("revoked");
    for (const p of ["bookings/bk-a", "tickets/tk-a", "ledgerEntries/cap_pay-a_0", "settlements/stl-1"]) {
      await assertFails(getDoc(doc(db, p)));
    }
  });

  test("a member of another org reads nothing of this org", async () => {
    await env.withSecurityRulesDisabled(async (ctx) =>
      setDoc(doc(ctx.firestore(), "memberships/org-z__outsider"), {
        orgId: "org-z", uid: "outsider", role: "owner", status: "active", permissions: [], eventScope: { all: true, eventIds: [] }, version: 1,
      })
    );
    const db = phone("outsider");
    for (const p of ["bookings/bk-a", "tickets/tk-a", "refunds/rf-a", "ledgerEntries/cap_pay-a_0", "settlements/stl-1"]) {
      await assertFails(getDoc(doc(db, p)));
    }
  });
});

describe("no client writes to money or admission state", () => {
  const targets = [
    "bookings/bk-a",
    "bookings/new-one",
    "tickets/tk-a",
    "ticketSecrets/tk-a",
    "payments/pay-a",
    "refunds/rf-a",
    "refunds/new-one",
    "ledgerEntries/cap_pay-a_0",
    "ledgerEntries/forged",
    "settlements/stl-1",
    "paymentEvents/evt_2",
    "bookingLocks/event-a__cust-1",
  ];
  test.each(["cust-1", "owner", "finance", "door-a"])("%s cannot create/update/delete", async (uid) => {
    const db = phone(uid);
    for (const p of targets) {
      await assertFails(setDoc(doc(db, p), { status: "confirmed", customerUid: uid, orgId: ORG, amountMinor: 1 }));
      await assertFails(updateDoc(doc(db, p), { status: "used" }));
      await assertFails(deleteDoc(doc(db, p)));
    }
  });

  test("admins cannot bypass the callables either", async () => {
    const db = admin();
    for (const p of targets) {
      await assertFails(setDoc(doc(db, p), { status: "paid" }));
      await assertFails(deleteDoc(doc(db, p)));
    }
  });
});

describe("server-only stores", () => {
  test.each([
    ["customer", () => phone("cust-1")],
    ["owner", () => phone("owner")],
    ["admin", () => admin()],
  ])("paymentEvents, rateLimits, bookingLocks and commandReceipts are unreadable (%s)", async (_label, ctx) => {
    const db = ctx();
    for (const p of ["paymentEvents/evt_1", "rateLimits/reserve_cust-1", "bookingLocks/event-a__cust-1", "commandReceipts/reserveSeat_cust-1_r1"]) {
      await assertFails(getDoc(doc(db, p)));
    }
    await assertFails(getDocs(collection(db, "paymentEvents")));
    await assertFails(getDocs(collection(db, "rateLimits")));
  });

  test("job runs and legal holds: admins and auditors read; nobody else reads; nobody writes", async () => {
    const auditor = env.authenticatedContext("aud-1", { roleId: "auditor", email_verified: true }).firestore();
    for (const p of ["jobRuns/dataRetention_2026-09-30", "legalHolds/user_cust-1"]) {
      await assertSucceeds(getDoc(doc(admin(), p)));
      await assertSucceeds(getDoc(doc(auditor, p)));
      for (const uid of ["cust-1", "owner", "finance"]) await assertFails(getDoc(doc(phone(uid), p)));
      await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), p)));
      for (const db of [admin(), auditor, phone("cust-1")]) await assertFails(setDoc(doc(db, p), { status: "released" }));
    }
  });

  test("admins read all commerce documents", async () => {
    const db = admin();
    for (const p of ["bookings/bk-a", "tickets/tk-a", "payments/pay-a", "refunds/rf-a", "ledgerEntries/cap_pay-a_0", "settlements/stl-1"]) {
      await assertSucceeds(getDoc(doc(db, p)));
    }
  });
});
