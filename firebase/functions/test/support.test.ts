/**
 * Support requests and problem reports (support/requests.ts): customers and
 * organizers open them, ops reply from the console, the opener is notified,
 * and a safety report lands in the risk queue.
 */
import { call, callCode, callErr, phoneCtx, adminCtx, uniq, rid, db, Timestamp } from "./commerce-helpers";
import * as support from "../src/support";
import { setAppConfig } from "../src/platform/appConfig";
import { sendBroadcast } from "../src/platform/broadcast";

const submit = (uid: string, over: Record<string, unknown> = {}) =>
  call<{ id: string; status: string; replayed: boolean }>(support.submitSupportRequest, {
    requestId: rid(), kind: "help", topic: "booking", message: "My pass doesn't show the venue map.", ...over,
  }, phoneCtx(uid));

const doc = async (id: string) => (await db().doc(`supportRequests/${id}`).get()).data()!;

describe("support requests", () => {
  test("a customer opens one; replaying the requestId doesn't duplicate it", async () => {
    const uid = uniq("cust");
    const requestId = rid();
    const r = await submit(uid, { requestId });
    expect(r).toMatchObject({ status: "open", replayed: false });
    const again = await submit(uid, { requestId });
    expect(again).toMatchObject({ id: r.id, replayed: true });
    const d = await doc(r.id);
    const days = (d.resolveBy.toMillis() - d.createdAt.toMillis()) / 86_400_000;
    expect(days).toBe(30);
    expect(d.acknowledgedAt.toMillis()).toBe(d.createdAt.toMillis());
    expect(await doc(r.id)).toMatchObject({
      uid, audience: "customer", kind: "help", topic: "booking", status: "open", priority: "normal", lastFrom: "customer",
      messages: [
        expect.objectContaining({ from: "customer", body: "My pass doesn't show the venue map." }),
        expect.objectContaining({ from: "pulse", auto: true, body: expect.stringMatching(/within 48 hours/) }),
      ],
    });
  });

  test("input is validated; a booking link must be the caller's own booking", async () => {
    const uid = uniq("cust");
    expect((await callErr(support.submitSupportRequest, { requestId: rid(), kind: "help", topic: "booking", message: "short" }, phoneCtx(uid))).message).toMatch(/10–2000/);
    expect(await callCode(support.submitSupportRequest, { requestId: rid(), kind: "nope", topic: "booking", message: "long enough message" }, phoneCtx(uid))).toBe("INVALID_INPUT");
    await db().doc("bookings/bk-someone-else").set({ customerUid: "other", eventId: "e1", status: "confirmed" });
    expect(await callCode(support.submitSupportRequest, {
      requestId: rid(), kind: "report", topic: "venue", message: "The venue was closed when we arrived.", context: { type: "booking", id: "bk-someone-else" },
    }, phoneCtx(uid))).toBe("NOT_FOUND");
    await db().doc(`bookings/bk-${uid}`).set({ customerUid: uid, eventId: "e1", status: "confirmed" });
    const ok = await submit(uid, { kind: "report", topic: "venue", message: "The venue was closed when we arrived.", context: { type: "booking", id: `bk-${uid}` } });
    expect((await doc(ok.id)).context).toEqual({ type: "booking", id: `bk-${uid}` });
  });

  test("a safety report is high priority and raises a risk alert", async () => {
    const uid = uniq("cust");
    const r = await submit(uid, { kind: "report", topic: "harassment", message: "A participant kept messaging me after the game." });
    expect((await doc(r.id)).priority).toBe("high");
    const alert = (await db().doc(`riskAlerts/support_${r.id}`).get()).data()!;
    expect(alert).toMatchObject({ kind: "user-report", severity: "high", status: "open" });
  });

  test("an organizer asks about their workspace only as an active member", async () => {
    const uid = uniq("owner");
    const orgId = uniq("org");
    expect(await callCode(support.submitSupportRequest, {
      requestId: rid(), audience: "organizer", orgId, kind: "help", topic: "payouts", message: "When is my first settlement paid?", context: { type: "organizer", id: orgId },
    }, phoneCtx(uid))).toBe("NOT_PERMITTED");
    await db().doc(`memberships/${orgId}__${uid}`).set({ orgId, uid, role: "owner", status: "active", permissions: [], eventScope: { all: true, eventIds: [] } });
    const r = await submit(uid, { audience: "organizer", orgId, topic: "payouts", message: "When is my first settlement paid?", context: { type: "organizer", id: orgId } });
    expect(await doc(r.id)).toMatchObject({ audience: "organizer", orgId });
  });

  test("ops reply → the opener is notified; the opener replies → open again; resolved is closed", async () => {
    const uid = uniq("cust");
    const r = await submit(uid);
    expect(await callCode(support.respondSupportRequest, { requestId: rid(), id: r.id, message: "Hi", status: "open" }, phoneCtx(uid))).not.toBe("OK");
    await call(support.respondSupportRequest, { requestId: rid(), id: r.id, message: "Pull down on the pass to refresh it.", status: "waiting-on-customer" }, adminCtx("admin-a"));
    let d = await doc(r.id);
    expect(d).toMatchObject({ status: "waiting-on-customer", lastFrom: "pulse" });
    expect(d.messages).toHaveLength(3);
    const notes = (await db().collection("userNotifications").where("recipientUid", "==", uid).get()).docs.map((x) => x.data());
    expect(notes.find((n) => n.kind === "support-reply")).toMatchObject({ link: { type: "support-request", id: r.id } });

    // Someone else can't reply on it.
    expect(await callCode(support.addSupportMessage, { id: r.id, message: "me too" }, phoneCtx(uniq("other")))).toBe("NOT_FOUND");
    await call(support.addSupportMessage, { id: r.id, message: "That worked, thanks!" }, phoneCtx(uid));
    d = await doc(r.id);
    expect(d).toMatchObject({ status: "open", lastFrom: "customer" });

    await call(support.respondSupportRequest, { requestId: rid(), id: r.id, message: null, status: "resolved" }, adminCtx("admin-a"));
    expect((await doc(r.id)).status).toBe("resolved");
    expect(await callCode(support.addSupportMessage, { id: r.id, message: "one more thing" }, phoneCtx(uid))).toBe("PRECONDITION");
    expect(await callCode(support.respondSupportRequest, { requestId: rid(), id: r.id, message: null, status: "resolved" }, adminCtx("admin-a"))).toBe("INVALID_INPUT");
    const audit = await db().collection("auditEvents").where("resourceId", "==", r.id).get();
    expect(audit.docs.map((a) => a.data().action)).toEqual(expect.arrayContaining(["support.request-submitted", "support.replied", "support.status-changed"]));
    void Timestamp;
  });
});

describe("blocking an organizer", () => {
  const block = (uid: string, orgId: string, blocked: boolean) =>
    call<{ orgId: string; blocked: boolean }>(support.setOrganizerBlock, { orgId, blocked }, phoneCtx(uid));

  test("block, block again (no duplicate), unblock; unknown organizers are refused", async () => {
    const uid = uniq("cust");
    const orgId = uniq("org");
    await db().doc(`organizers/${orgId}`).set({ status: "active", displayName: "Loud Club" });
    expect(await block(uid, orgId, true)).toEqual({ orgId, blocked: true });
    await block(uid, orgId, true);
    expect((await db().doc(`userBlocks/${uid}`).get()).data()).toMatchObject({ uid, orgIds: [orgId] });
    await block(uid, orgId, false);
    expect((await db().doc(`userBlocks/${uid}`).get()).data()!.orgIds).toEqual([]);
    expect(await callCode(support.setOrganizerBlock, { orgId: uniq("missing"), blocked: true }, phoneCtx(uid))).toBe("NOT_FOUND");
    expect(await callCode(support.setOrganizerBlock, { orgId, blocked: "yes" }, phoneCtx(uid))).toBe("INVALID_INPUT");
    const audits = await db().collection("auditEvents").where("resourceId", "==", orgId).get();
    expect(audits.docs.map((d) => d.data().action).sort()).toEqual(["trust.organizer-blocked", "trust.organizer-blocked", "trust.organizer-unblocked"]);
  });
});

describe("app config (min build, maintenance)", () => {
  test("admins set it with a reason and it's audited; others can't", async () => {
    expect(await callCode(setAppConfig, { minBuild: 5, maintenance: false, reason: "Force update" }, phoneCtx(uniq("cust")))).toBe("NOT_PERMITTED");
    expect(await callCode(setAppConfig, { minBuild: -1, reason: "Bad" }, adminCtx("admin-a"))).toBe("INVALID_INPUT");
    const r = await call(setAppConfig, { minBuild: 7, maintenance: true, maintenanceMessage: "Back at 6 pm.", reason: "DB upgrade" }, adminCtx("admin-a"));
    expect(r).toEqual({ minBuild: 7, maintenance: true, maintenanceMessage: "Back at 6 pm." });
    expect((await db().doc("appConfig/mobile").get()).data()).toMatchObject({ minBuild: 7, maintenance: true });
    const audits = await db().collection("auditEvents").where("action", "==", "platform.app-config-set").get();
    expect(audits.size).toBeGreaterThan(0);
  });
});

describe("console broadcast", () => {
  test("admins only; city needs a key; 3 a day; recorded and audited (no real push in the emulator)", async () => {
    await Promise.all((await db().collection("broadcasts").get()).docs.map((d) => d.ref.delete()));
    expect(await callCode(sendBroadcast, { audience: "all", title: "Hello", body: "New things this weekend", reason: "Launch" }, phoneCtx(uniq("c")))).toBe("NOT_PERMITTED");
    expect(await callCode(sendBroadcast, { audience: "city", city: "", title: "Hello", body: "New things this weekend", reason: "Launch" }, adminCtx("admin-a"))).toBe("INVALID_INPUT");
    const r = await call<{ topic: string; status: string }>(sendBroadcast, { audience: "city", city: "Bengaluru", title: "Weekend in Bengaluru", body: "12 new experiences this weekend", reason: "Weekly push" }, adminCtx("admin-a"));
    expect(r).toMatchObject({ topic: "city_bengaluru", status: "skipped-emulator" });
    await call(sendBroadcast, { audience: "all", title: "Hello", body: "New things this weekend", reason: "Two" }, adminCtx("admin-a"));
    await call(sendBroadcast, { audience: "all", title: "Hello", body: "New things this weekend", reason: "Three" }, adminCtx("admin-a"));
    expect(await callCode(sendBroadcast, { audience: "all", title: "Hello", body: "One too many today", reason: "Four" }, adminCtx("admin-a"))).toBe("PRECONDITION");
  });
});
