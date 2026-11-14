/** Push channel preferences: muted kinds skip the push; the inbox entry stays. */
import { call, phoneCtx, uniq, db } from "./commerce-helpers";
import * as identity from "../src/identity";
import { channelOf, deliverNotification } from "../src/identity/push";

describe("notification preferences", () => {
  test("kinds map to channels; safety/support/organizer always push", () => {
    expect(channelOf("event-reminder")).toBe("reminders");
    expect(channelOf("event-changed")).toBe("changes");
    expect(channelOf("booking-confirmed")).toBe("booking");
    expect(channelOf("safety")).toBeNull();
    expect(channelOf("support-reply")).toBeNull();
    expect(channelOf("payout-account")).toBeNull();
  });

  test("a muted channel isn't pushed; other kinds still are", async () => {
    const uid = uniq("cust");
    await db().doc(`users/${uid}`).set({ pushTokens: ["tok-1"] });
    const r = await call<{ channels: Record<string, boolean> }>(identity.setNotificationPreferences, { channels: { reminders: false, changes: true, bogus: false } }, phoneCtx(uid));
    expect(r.channels).toEqual({ reminders: false, changes: true });
    await db().doc(`userNotifications/n1-${uid}`).set({ recipientUid: uid, kind: "event-reminder", title: "t", body: "b" });
    expect(await deliverNotification(`n1-${uid}`, { recipientUid: uid, kind: "event-reminder", title: "t", body: "b" })).toBe("muted");
    expect((await db().doc(`userNotifications/n1-${uid}`).get()).data()!.push).toMatchObject({ status: "muted", channel: "reminders" });
    expect(await deliverNotification(`n2-${uid}`, { recipientUid: uid, kind: "safety", title: "t", body: "b" })).toBe("skipped-emulator");
  });
});
