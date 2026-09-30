import { deleteApp, getApps } from "firebase-admin/app";
import { db } from "../src/platform/firestore";
import { deliverNotification, registerPushTokenService } from "../src/identity/push";
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
