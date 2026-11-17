/** Following organizers (catalog/follows.ts). */
import { call, callCode, phoneCtx, uniq, db } from "./commerce-helpers";
import * as catalog from "../src/catalog";
import { notifyFollowers } from "../src/catalog/follows";

test("follow / unfollow; unknown organizer refused; followers notified once per published event", async () => {
  const orgId = uniq("org");
  await db().doc(`publicOrganizers/${orgId}`).set({ name: "Weekend Cricket Club" });
  const a = uniq("cust");
  const b = uniq("cust");
  expect(await call(catalog.setFollow, { orgId, follow: true }, phoneCtx(a))).toEqual({ orgId, follow: true });
  await call(catalog.setFollow, { orgId, follow: true }, phoneCtx(b));
  expect(await callCode(catalog.setFollow, { orgId: uniq("missing"), follow: true }, phoneCtx(a))).toBe("NOT_FOUND");
  expect((await db().doc(`follows/${orgId}__${a}`).get()).data()).toMatchObject({ orgId, uid: a });

  const eventId = uniq("ev");
  const sent = await notifyFollowers(eventId, { orgId, title: "Sunday Nets", organizerName: "Weekend Cricket Club" });
  expect(sent).toBe(2);
  const notes = await db().collection("userNotifications").where("recipientUid", "==", a).get();
  expect(notes.docs.map((n) => n.data().title)).toContain("New from Weekend Cricket Club");

  await call(catalog.setFollow, { orgId, follow: false }, phoneCtx(b));
  expect((await db().doc(`follows/${orgId}__${b}`).get()).exists).toBe(false);
});
