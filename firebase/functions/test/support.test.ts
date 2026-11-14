/**
 * Support requests and problem reports (support/requests.ts): customers and
 * organizers open them, ops reply from the console, the opener is notified,
 * and a safety report lands in the risk queue.
 */
import { call, callCode, callErr, phoneCtx, adminCtx, uniq, rid, db, Timestamp } from "./commerce-helpers";
import * as support from "../src/support";

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
    expect(await doc(r.id)).toMatchObject({
      uid, audience: "customer", kind: "help", topic: "booking", status: "open", priority: "normal", lastFrom: "customer",
      messages: [expect.objectContaining({ from: "customer", body: "My pass doesn't show the venue map." })],
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
    expect(d.messages).toHaveLength(2);
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
