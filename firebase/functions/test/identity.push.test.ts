const sent: { tokens: string[]; data: Record<string, unknown>; notification: unknown }[] = [];
jest.mock("firebase-admin/messaging", () => ({
  getMessaging: () => ({
    sendEachForMulticast: async (m: { tokens: string[]; data: Record<string, unknown>; notification: unknown }) => {
      sent.push(m);
      return { successCount: m.tokens.length, failureCount: 0, responses: m.tokens.map(() => ({ success: true })) };
    },
  }),
}));

import { deleteApp, getApps } from "firebase-admin/app";
import { db } from "../src/platform/firestore";
import { deliverNotification, pushData, registerPushTokenService } from "../src/identity/push";
import { DomainError } from "../src/platform/errors";

process.env.GCLOUD_PROJECT = "demo-experience-os";
process.env.FUNCTIONS_EMULATOR = "true";

afterAll(async () => {
  await Promise.all(getApps().map((a) => deleteApp(a)));
});

test("a notification for a user with no device is recorded as no-device, never 'sent'", async () => {
  const ref = db().collection("userNotifications").doc("booking-confirmed:t1:push-u1");
  await ref.set({ recipientUid: "push-u1", kind: "booking-confirmed", title: "You're in", body: "b", read: false });
  expect(await deliverNotification(ref.id, (await ref.get()).data()!)).toBe("no-device");
  expect((await ref.get()).data()!.push.status).toBe("no-device");
});

test("registered tokens are stored; the emulator never pretends a push was sent", async () => {
  await registerPushTokenService("push-u2", { token: "x".repeat(40), platform: "android" });
  const ref = db().collection("userNotifications").doc("booking-confirmed:t2:push-u2");
  await ref.set({ recipientUid: "push-u2", kind: "booking-confirmed", title: "t", body: "b", read: false });
  expect(await deliverNotification(ref.id, (await ref.get()).data()!)).toBe("skipped-emulator");
});

test("token registration validates input", async () => {
  await expect(registerPushTokenService("push-u3", { token: "short", platform: "android" })).rejects.toBeInstanceOf(DomainError);
  await expect(registerPushTokenService("push-u3", { token: "y".repeat(40), platform: "web" })).rejects.toBeInstanceOf(DomainError);
});

test("a device registered by a second account stops receiving the first account's pushes", async () => {
  const shared = `shared-device-${"s".repeat(40)}`;
  await registerPushTokenService("push-a1", { token: shared, platform: "android" });
  await registerPushTokenService("push-a1", { token: `own-a1-${"a".repeat(40)}`, platform: "android" });
  await registerPushTokenService("push-b1", { token: shared, platform: "android" });
  const a = (await db().collection("users").doc("push-a1").get()).data()!;
  const b = (await db().collection("users").doc("push-b1").get()).data()!;
  expect(a.pushTokens).toEqual([`own-a1-${"a".repeat(40)}`]); // only the shared device was removed
  expect(b.pushTokens).toEqual([shared]);
  // Re-registering on the same account is a no-op for others.
  await registerPushTokenService("push-b1", { token: shared, platform: "android" });
  expect((await db().collection("users").doc("push-b1").get()).data()!.pushTokens).toEqual([shared]);
});

describe("FCM data payload", () => {
  test("carries the notification's link as flat string fields, omitted when absent", () => {
    expect(pushData("n1", { kind: "refund-update", link: { type: "booking", id: "bkg-1" } })).toEqual({
      notificationId: "n1",
      kind: "refund-update",
      linkType: "booking",
      linkId: "bkg-1",
    });
    expect(pushData("n2", { kind: "x" })).toEqual({ notificationId: "n2", kind: "x" });
    expect(pushData("n3", { kind: "x", link: null })).toEqual({ notificationId: "n3", kind: "x" });
    expect(pushData("n4", { kind: "x", link: { type: "event", id: 42 } })).toEqual({ notificationId: "n4", kind: "x" });
  });

  test("deliverNotification sends linkType/linkId (all values strings) outside the emulator", async () => {
    const env = { FUNCTIONS_EMULATOR: process.env.FUNCTIONS_EMULATOR, K_SERVICE: process.env.K_SERVICE };
    process.env.FUNCTIONS_EMULATOR = "false";
    process.env.K_SERVICE = "deliverNotifications";
    try {
      const token = `link-dev-${"l".repeat(40)}`;
      await registerPushTokenService("push-link-1", { token, platform: "ios" });
      const ref = db().collection("userNotifications").doc("event-cancelled:ev-9:push-link-1");
      await ref.set({ recipientUid: "push-link-1", kind: "event-cancelled", title: "t", body: "b", read: false, link: { type: "event", id: "ev-9" } });
      sent.length = 0;
      expect(await deliverNotification(ref.id, (await ref.get()).data()!)).toBe("sent");
      expect(sent).toHaveLength(1);
      expect(sent[0]!.tokens).toEqual([token]);
      expect(sent[0]!.data).toEqual({ notificationId: ref.id, kind: "event-cancelled", linkType: "event", linkId: "ev-9" });
      for (const v of Object.values(sent[0]!.data)) expect(typeof v).toBe("string");
    } finally {
      process.env.FUNCTIONS_EMULATOR = env.FUNCTIONS_EMULATOR;
      if (env.K_SERVICE === undefined) delete process.env.K_SERVICE;
      else process.env.K_SERVICE = env.K_SERVICE;
    }
  });
});
