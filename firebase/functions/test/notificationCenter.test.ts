/**
 * Notification center (docs/NOTIFICATION_CENTER_CONTRACT.md §1, §2, §5):
 * announcements (save / status actions / delivery / receipts / stats),
 * audiences (every type + platform, build, city filters and exclusions),
 * notifications (inbox items, topic vs per-person push, quota, schedule,
 * cancel, the 5-minute job), templates and capability checks.
 * Runs on the spare emulator ports (firebase.verify.json) — it clears Firestore.
 */
import {
  call, callCode, callErr, phoneCtx, adminCtx, uniq, rid, db, Timestamp,
} from "./commerce-helpers";
import { clearFirestore } from "./catalog.fixtures";
import {
  saveAnnouncement, setAnnouncementStatus, previewAudience, getAnnouncementStats, getMyAnnouncements, recordAnnouncementEvent,
  advanceAnnouncementWindows, finishedFor,
} from "../src/platform/announcements";
import { sendNotification, cancelScheduledNotification, saveTemplate, deleteTemplate, sendDueNotifications } from "../src/platform/adminNotifications";
import { sendBroadcast } from "../src/platform/broadcast";
import { deliverNotification } from "../src/identity/push";
import { runNotificationJobsOnce } from "../src/platform/notificationJobs";
import { matchesViewer, parseAudience } from "../src/platform/audience";

const ADMIN = adminCtx("admin-nc-0001");
const OWNER = adminCtx("owner-nc-0001", "platform-owner");
const AUDITOR = adminCtx("auditor-nc-0001", "auditor");
const H = 3_600_000;
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();

type Person = { uid: string };
async function person(o: { name?: string; phone?: string; org?: string; platform?: "android" | "ios"; build?: number; tokens?: string[]; operator?: boolean } = {}): Promise<Person> {
  const uid = uniq("p");
  await db().doc(`users/${uid}`).set({
    uid, phone: o.phone ?? null, createdAt: Timestamp.now(),
    ...(o.operator ? { scope: "platform", roleId: "super-admin" } : {}),
    ...(o.platform || o.build !== undefined ? { appClient: { platform: o.platform ?? "android", build: o.build ?? 40, at: Timestamp.now() } } : {}),
    ...(o.tokens ? { pushTokens: o.tokens, pushPlatform: o.platform ?? "android" } : {}),
  });
  await db().doc(`publicProfiles/${uid}`).set({ displayName: o.name ?? `Person ${uid.slice(-4)}` });
  if (o.org) await db().doc(`memberships/${o.org}__${uid}`).set({ orgId: o.org, uid, role: "staff", status: "active", permissions: [], eventScope: { all: true, eventIds: [] }, version: 1 });
  return { uid };
}

const base = (over: Record<string, unknown> = {}) => ({
  requestId: rid(), title: "Welcome to PULSE", body: "Find something fun this weekend.", format: "modal", tone: "promo",
  primaryCta: { label: "Explore" }, dismissible: true, requireAck: false, frequency: "once", priority: 50,
  audience: { type: "all" }, startsAt: null, endsAt: null, sendPush: false, ...over,
});
const save = (over: Record<string, unknown> = {}, ctx: unknown = ADMIN) => call<{ id: string; status: string }>(saveAnnouncement, base(over), ctx);
const act = (id: string, action: string, ctx: unknown = ADMIN, requestId = rid()) =>
  call<{ id: string; status: string; replayed: boolean }>(setAnnouncementStatus, { requestId, id, action, reason: `Ops: ${action}` }, ctx);
const live = async (over: Record<string, unknown> = {}) => {
  const { id } = await save(over);
  await act(id, "publish");
  return id;
};
const mine = (p: Person, q: Record<string, unknown> = {}) =>
  call<{ items: Array<Record<string, any>> }>(getMyAnnouncements, { platform: "android", build: 40, ...q }, phoneCtx(p.uid));
const ids = async (p: Person, q: Record<string, unknown> = {}) => (await mine(p, q)).items.map((i) => i.id);
const record = (p: Person, id: string, event: string) => call(recordAnnouncementEvent, { announcementId: id, event }, phoneCtx(p.uid));
const ann = async (id: string) => (await db().doc(`announcements/${id}`).get()).data()!;

beforeAll(() => {
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error("Run under `firebase emulators:exec --config firebase.verify.json` (this suite clears Firestore).");
});
beforeEach(async () => {
  await clearFirestore();
});

describe("capabilities", () => {
  test("every console callable refuses customers and auditors; platform owners and super admins pass", async () => {
    const cust = phoneCtx(uniq("c"));
    const cases: Array<[unknown, unknown]> = [
      [saveAnnouncement, base()],
      [setAnnouncementStatus, { requestId: rid(), id: "ann-0001", action: "pause", reason: "x reason" }],
      [previewAudience, { audience: { type: "all" } }],
      [getAnnouncementStats, { id: "ann-0001" }],
      [sendNotification, { requestId: rid(), audience: { type: "all" }, title: "Hello", body: "Hello there", reason: "Ops" }],
      [cancelScheduledNotification, { requestId: rid(), id: "n-0001", reason: "Ops" }],
      [saveTemplate, { requestId: rid(), name: "Tmpl", kind: "notification", payload: {} }],
      [deleteTemplate, { requestId: rid(), id: "tpl-0001", reason: "Ops" }],
    ];
    for (const [fn, data] of cases) {
      expect(await callCode(fn, data, cust)).toBe("NOT_PERMITTED");
      expect(await callCode(fn, data, AUDITOR)).toBe("NOT_PERMITTED");
      expect(await callCode(fn, data, { auth: { uid: "x-unverified", token: { roleId: "super-admin" } } })).toBe("NOT_PERMITTED");
    }
    expect((await save({}, OWNER)).status).toBe("draft");
  });
});

describe("saveAnnouncement", () => {
  test("creates a draft with zero stats, audited; validates every field", async () => {
    const r = await save({ secondaryCta: { label: "Later" }, imageUrl: "https://img.pulse.test/a.jpg" });
    expect(r.status).toBe("draft");
    const a = await ann(r.id);
    expect(a).toMatchObject({
      status: "draft", title: "Welcome to PULSE", format: "modal", tone: "promo", primaryCta: { label: "Explore" }, secondaryCta: { label: "Later" },
      stats: { targeted: 0, shown: 0, clicked: 0, dismissed: 0, acked: 0, viewers: 0 }, createdBy: "admin-nc-0001", startsAt: null, endsAt: null,
    });
    const audits = await db().collection("auditEvents").where("resourceId", "==", r.id).get();
    expect(audits.docs.map((d) => d.get("action"))).toEqual(["announcement.created"]);

    const bad = async (over: Record<string, unknown>) => (await callErr(saveAnnouncement, base(over), ADMIN));
    expect((await bad({ title: "Hi" })).message).toMatch(/3–80/);
    expect((await bad({ body: "x".repeat(601) })).code).toBe("INVALID_INPUT");
    expect((await bad({ format: "popup" })).code).toBe("INVALID_INPUT");
    expect((await bad({ tone: "loud" })).code).toBe("INVALID_INPUT");
    expect((await bad({ frequency: "hourly" })).code).toBe("INVALID_INPUT");
    expect((await bad({ priority: 101 })).code).toBe("INVALID_INPUT");
    expect((await bad({ imageUrl: "http://evil.test/a.png" })).message).toMatch(/https/);
    expect((await bad({ primaryCta: { label: "Go", url: "https://pulse.test", link: { type: "event", id: "evt-0001" } } })).message).toMatch(/not both/);
    expect((await bad({ primaryCta: { label: "Go", link: { type: "spaceship", id: "x-0001" } } })).code).toBe("INVALID_INPUT");
    expect((await bad({ primaryCta: null, secondaryCta: { label: "Later" } })).message).toMatch(/main button/);
    expect((await bad({ audience: { type: "everyone" } })).code).toBe("INVALID_INPUT");
    expect((await bad({ audience: { type: "users", uids: Array.from({ length: 501 }, (_, i) => `user-${1000 + i}`) } })).message).toMatch(/at most 500/);
    expect((await bad({ audience: { type: "orgs", orgIds: Array.from({ length: 101 }, (_, i) => `org-${1000 + i}`) } })).message).toMatch(/at most 100/);
    expect((await bad({ audience: { type: "all", platforms: ["windows"] } })).code).toBe("INVALID_INPUT");
    expect((await bad({ audience: { type: "all", minBuild: 50, maxBuild: 40 } })).message).toMatch(/minimum build/);
    expect((await bad({ startsAt: "tomorrow" })).code).toBe("INVALID_INPUT");
    // Drafts may be incomplete: an empty people list is saved, publish refuses it.
    expect((await save({ audience: { type: "users", uids: [] } })).status).toBe("draft");
  });

  test("normalizes the audience (both platforms = no filter; keys of other types dropped)", () => {
    expect(parseAudience({ type: "all", platforms: ["android", "ios"], uids: ["user-0001"] }, { requireTargets: false })).toEqual({ type: "all" });
    expect(parseAudience({ type: "cities", cities: ["Bangalore", " bengaluru ", "Mysore"] }, { requireTargets: true })).toEqual({ type: "cities", cities: ["Bangalore", "Mysore"] });
  });

  test("live announcements change only text, buttons, image and dates (audited before/after); ended/archived can't be edited", async () => {
    const id = await live();
    const r = await call(saveAnnouncement, base({ id, title: "Welcome to PULSE!", body: "New body" }), ADMIN);
    expect(r.status).toBe("live");
    const edit = (await db().collection("auditEvents").where("action", "==", "announcement.edited").get()).docs[0]!.data();
    expect(edit.before).toMatchObject({ status: "live", title: "Welcome to PULSE", body: "Find something fun this weekend." });
    expect(edit.after).toMatchObject({ status: "live", title: "Welcome to PULSE!", body: "New body" });
    expect(await callCode(saveAnnouncement, base({ id, format: "banner" }), ADMIN)).toBe("PRECONDITION");
    expect(await callCode(saveAnnouncement, base({ id, audience: { type: "customers" } }), ADMIN)).toBe("PRECONDITION");
    await act(id, "end");
    expect(await callCode(saveAnnouncement, base({ id }), ADMIN)).toBe("PRECONDITION");
    // Paused ones edit freely.
    const p = await live();
    await act(p, "pause");
    expect((await call(saveAnnouncement, base({ id: p, format: "sheet" }), ADMIN)).status).toBe("paused");
  });
});

describe("setAnnouncementStatus", () => {
  test("publish validates the whole announcement and computes the reach", async () => {
    await person();
    await person();
    await person({ operator: true });
    const noPeople = await save({ audience: { type: "users", uids: [] } });
    expect(await callCode(setAnnouncementStatus, { requestId: rid(), id: noPeople.id, action: "publish", reason: "go live" }, ADMIN)).toBe("INVALID_INPUT");
    const stuck = await save({ dismissible: false, requireAck: false, primaryCta: null });
    expect((await callErr(setAnnouncementStatus, { requestId: rid(), id: stuck.id, action: "publish", reason: "go live" }, ADMIN)).message).toMatch(/couldn't close/);
    const past = await save({ endsAt: iso(-H) });
    expect((await callErr(setAnnouncementStatus, { requestId: rid(), id: past.id, action: "publish", reason: "go live" }, ADMIN)).message).toMatch(/end time/);
    expect(await callCode(setAnnouncementStatus, { requestId: rid(), id: past.id, action: "publish", reason: "" }, ADMIN)).toBe("INVALID_INPUT");

    const id = await live();
    const a = await ann(id);
    expect(a).toMatchObject({ status: "live", publishedBy: "admin-nc-0001", stats: { targeted: 2 }, statusReason: "Ops: publish", pushStatus: null });
    expect(a.startsAt.toMillis()).toBeLessThanOrEqual(Date.now());
    const sched = await save({ startsAt: iso(2 * H), endsAt: iso(5 * H) });
    expect((await act(sched.id, "publish")).status).toBe("scheduled");
  });

  test("pause / resume / end / archive / duplicate, refused from the wrong status, replay-safe, audited", async () => {
    const id = await live();
    expect(await callCode(setAnnouncementStatus, { requestId: rid(), id, action: "resume", reason: "go on" }, ADMIN)).toBe("PRECONDITION");
    const rq = rid();
    expect((await act(id, "pause", ADMIN, rq)).status).toBe("paused");
    expect((await act(id, "pause", ADMIN, rq)).replayed).toBe(true);
    expect((await act(id, "resume")).status).toBe("live");
    expect((await act(id, "end")).status).toBe("ended");
    expect((await ann(id)).endsAt.toMillis()).toBeLessThanOrEqual(Date.now());
    expect(await callCode(setAnnouncementStatus, { requestId: rid(), id, action: "pause", reason: "again" }, ADMIN)).toBe("PRECONDITION");
    const dup = await act(id, "duplicate");
    expect(dup.id).not.toBe(id);
    expect(await ann(dup.id)).toMatchObject({ status: "draft", duplicatedFrom: id, startsAt: null, endsAt: null, stats: { shown: 0, targeted: 0 } });
    expect((await act(id, "archive")).status).toBe("archived");
    expect(await callCode(setAnnouncementStatus, { requestId: rid(), id, action: "archive", reason: "again" }, ADMIN)).toBe("PRECONDITION");
    expect(await callCode(setAnnouncementStatus, { requestId: rid(), id: "missing-0001", action: "pause", reason: "x reason" }, ADMIN)).toBe("NOT_FOUND");
    const actions = (await db().collection("auditEvents").where("resourceId", "==", id).get()).docs.map((d) => d.get("action")).sort();
    expect(actions).toEqual(["announcement.archive", "announcement.created", "announcement.end", "announcement.pause", "announcement.publish", "announcement.resume"].sort());
    // A paused one whose end passed can't resume.
    const old = await live({ endsAt: iso(2 * H) });
    await act(old, "pause");
    await db().doc(`announcements/${old}`).update({ endsAt: Timestamp.fromMillis(Date.now() - 1000) });
    expect((await callErr(setAnnouncementStatus, { requestId: rid(), id: old, action: "resume", reason: "back" }, ADMIN)).message).toMatch(/end time has passed/);
  });

  test("the push: skipped in the emulator, counted toward the shared 3-a-day, refused when the quota is used", async () => {
    const id = await live({ sendPush: true });
    expect((await ann(id)).pushStatus).toBe("skipped-emulator");
    const b = await db().collection("broadcasts").where("announcementId", "==", id).get();
    expect(b.docs[0]!.data()).toMatchObject({ source: "announcement", audience: "all", topic: "all", status: "skipped-emulator" });
    await call(sendBroadcast, { audience: "all", title: "Hello", body: "Weekend picks", reason: "Two" }, ADMIN);
    await call(sendBroadcast, { audience: "all", title: "Hello", body: "Weekend picks", reason: "Three" }, ADMIN);
    const fourth = await save({ sendPush: true });
    expect(await callCode(setAnnouncementStatus, { requestId: rid(), id: fourth.id, action: "publish", reason: "go live" }, ADMIN)).toBe("PRECONDITION");
    // Targeted pushes aren't limited: per-person devices (none registered → no-device).
    const p = await person({ tokens: [`tok-${"x".repeat(30)}`] });
    const t = await live({ sendPush: true, audience: { type: "users", uids: [p.uid] } });
    expect((await ann(t)).pushStatus).toBe("skipped-emulator");
    const nobody = await person();
    const t2 = await live({ sendPush: true, audience: { type: "users", uids: [nobody.uid] } });
    expect((await ann(t2)).pushStatus).toBe("no-device");
    // A city push can't carry platform filters.
    const c = await save({ sendPush: true, audience: { type: "cities", cities: ["Hyderabad"], platforms: ["ios"] } });
    expect((await callErr(setAnnouncementStatus, { requestId: rid(), id: c.id, action: "publish", reason: "go live" }, ADMIN)).message).toMatch(/city push/);
  });
});

describe("getMyAnnouncements: audiences", () => {
  test("every audience type, platform/build filters and exclusions", async () => {
    const ORG = uniq("org");
    const cust = await person();
    const host = await person({ org: ORG });
    const other = await person();
    const all = await live({ title: "For everyone" });
    const customers = await live({ title: "Customers only", audience: { type: "customers" } });
    const organizers = await live({ title: "Organizers only", audience: { type: "organizers" } });
    const cities = await live({ title: "Bengaluru", audience: { type: "cities", cities: ["Bengaluru"] } });
    const users = await live({ title: "Just you", audience: { type: "users", uids: [other.uid] } });
    const orgs = await live({ title: "Your org", audience: { type: "orgs", orgIds: [ORG] } });
    const ios = await live({ title: "iOS only", audience: { type: "all", platforms: ["ios"] } });
    const builds = await live({ title: "Builds 30-39", audience: { type: "all", minBuild: 30, maxBuild: 39 } });
    const excl = await live({ title: "Not the host", audience: { type: "all", excludeUids: [host.uid] } });

    expect((await ids(cust)).sort()).toEqual([all, customers, excl].sort());
    expect((await ids(host)).sort()).toEqual([all, organizers, orgs].sort());
    expect((await ids(other, { city: "Bangalore" })).sort()).toEqual([all, customers, cities, users, excl].sort());
    expect(await ids(cust, { platform: "ios" })).toEqual(expect.arrayContaining([ios]));
    expect(await ids(cust, { build: 35 })).toEqual(expect.arrayContaining([builds]));
    expect(await ids(cust, { build: 40 })).not.toContain(builds);
    expect(await callCode(getMyAnnouncements, { platform: "web", build: 1 }, phoneCtx(cust.uid))).toBe("INVALID_INPUT");
    expect(await callCode(getMyAnnouncements, { platform: "android", build: 40 }, { auth: null })).toBe("NOT_AUTHENTICATED");
  });

  test("only live and in-window; priority first, then newest; fields as the contract says; records the app details", async () => {
    const p = await person();
    const low = await live({ title: "Low priority", priority: 10, imageUrl: "https://img.pulse.test/x.png", endsAt: iso(10 * H) });
    const high = await live({ title: "High priority", priority: 90, primaryCta: { label: "Open", link: { type: "event", id: "evt-0001" } }, secondaryCta: { label: "Web", url: "https://pulse.test/x" } });
    const newer = await live({ title: "Newer low", priority: 10 });
    await save({ title: "Just a draft" });
    const scheduled = await save({ title: "Later", startsAt: iso(3 * H) });
    await act(scheduled.id, "publish");
    const paused = await live({ title: "Paused" });
    await act(paused, "pause");
    const expired = await live({ title: "Expired", endsAt: iso(2 * H) });
    await db().doc(`announcements/${expired}`).update({ endsAt: Timestamp.fromMillis(Date.now() - 1000) });

    const { items } = await mine(p, { platform: "ios", build: 52 });
    expect(items.map((i) => i.id)).toEqual([high, newer, low]);
    expect(items[0]).toEqual({
      id: high, title: "High priority", body: "Find something fun this weekend.", format: "modal", tone: "promo", imageUrl: null,
      primaryCta: { label: "Open", link: { type: "event", id: "evt-0001" } }, secondaryCta: { label: "Web", url: "https://pulse.test/x" },
      dismissible: true, requireAck: false, frequency: "once", priority: 90, endsAt: null,
    });
    expect(items[2]).toMatchObject({ imageUrl: "https://img.pulse.test/x.png", primaryCta: { label: "Explore" } });
    expect(typeof items[2]!.endsAt).toBe("string");
    expect((await db().doc(`users/${p.uid}`).get()).get("appClient")).toMatchObject({ platform: "ios", build: 52 });
  });

  test("frequency: once until clicked/dismissed/acked; daily once per IST day; every-open always", async () => {
    const p = await person();
    const once = await live({ title: "Once", frequency: "once" });
    const daily = await live({ title: "Daily", frequency: "daily" });
    const every = await live({ title: "Every open", frequency: "every-open" });
    await record(p, once, "shown");
    await record(p, daily, "shown");
    await record(p, every, "shown");
    expect((await ids(p)).sort()).toEqual([once, every].sort());
    await record(p, once, "dismissed");
    await record(p, every, "dismissed");
    expect(await ids(p)).toEqual([every]);
    expect(finishedFor("once", { ackedAt: 1 }, "2026-11-24")).toBe(true);
    expect(finishedFor("daily", { lastShownDay: "2026-11-23" }, "2026-11-24")).toBe(false);
    expect(finishedFor("every-open", { clickedAt: 1, lastShownDay: "2026-11-24" }, "2026-11-24")).toBe(false);
  });

  test("matchesViewer: no city never matches a city audience", () => {
    const v = { uid: "u-0001", platform: "android" as const, build: 1, cityKey: null, activeOrgIds: [] };
    expect(matchesViewer({ type: "cities", cities: ["Hyderabad"] }, v)).toBe(false);
    expect(matchesViewer({ type: "cities", cities: ["Hyderabad"] }, { ...v, cityKey: "hyderabad" })).toBe(true);
  });
});

describe("recordAnnouncementEvent + stats", () => {
  test("idempotent per person and event (shown: per IST day); counters, viewers, daily series and CTR", async () => {
    const a = await person();
    const b = await person();
    const id = await live();
    await record(a, id, "shown");
    await record(a, id, "shown");
    await record(b, id, "shown");
    await record(a, id, "clicked");
    await record(a, id, "clicked");
    await record(b, id, "dismissed");
    await record(b, id, "acked");
    expect((await ann(id)).stats).toMatchObject({ shown: 2, viewers: 2, clicked: 1, dismissed: 1, acked: 1 });
    const r = (await db().doc(`announcementReceipts/${id}__${a.uid}`).get()).data()!;
    expect(r).toMatchObject({ announcementId: id, uid: a.uid, shownCount: 1 });
    expect(r.clickedAt).toBeDefined();
    const s = await call<Record<string, any>>(getAnnouncementStats, { id }, ADMIN);
    expect(s).toMatchObject({ id, status: "live", stats: { shown: 2, viewers: 2, clicked: 1 }, ctr: 0.5 });
    expect(s.series).toHaveLength(30);
    expect(s.series[29]).toMatchObject({ shown: 2, clicked: 1, dismissed: 1, acked: 1 });
    expect(s.series[0]).toMatchObject({ shown: 0 });
    expect(s.series[0].day < s.series[29].day).toBe(true);

    const draft = await save();
    expect(await callCode(recordAnnouncementEvent, { announcementId: draft.id, event: "shown" }, phoneCtx(a.uid))).toBe("NOT_FOUND");
    expect(await callCode(recordAnnouncementEvent, { announcementId: id, event: "liked" }, phoneCtx(a.uid))).toBe("INVALID_INPUT");
    expect(await callCode(getAnnouncementStats, { id: "nope-0001" }, ADMIN)).toBe("NOT_FOUND");
  });

  test("only people the announcement is for, and only while it is on, move the counters", async () => {
    const a = await person();
    const outsider = await person();
    const id = await live({ audience: { type: "users", uids: [a.uid] } });
    await record(outsider, id, "shown");
    await record(outsider, id, "clicked");
    expect((await ann(id)).stats).toMatchObject({ shown: 0, clicked: 0, viewers: 0 });
    expect((await db().doc(`announcementReceipts/${id}__${outsider.uid}`).get()).exists).toBe(false);
    await record(a, id, "shown");
    expect((await ann(id)).stats).toMatchObject({ shown: 1, viewers: 1 });
    await act(id, "end");
    await record(a, id, "clicked");
    expect((await ann(id)).stats).toMatchObject({ clicked: 0 });
  });

  test("rate-limited per person", async () => {
    const p = await person();
    const id = await live();
    await db().doc(`rateLimits/announceevt_${p.uid}`).set({ windowStart: Timestamp.now(), count: 600 });
    expect(await callCode(recordAnnouncementEvent, { announcementId: id, event: "shown" }, phoneCtx(p.uid))).toBe("RATE_LIMITED");
    await db().doc(`rateLimits/announce_${p.uid}`).set({ windowStart: Timestamp.now(), count: 240 });
    expect(await callCode(getMyAnnouncements, { platform: "android", build: 1 }, phoneCtx(p.uid))).toBe("RATE_LIMITED");
  });
});

describe("previewAudience", () => {
  test("estimates per type: exact counts, breakdown, sample; operators and blocked never counted", async () => {
    const ORG = uniq("org");
    const c1 = await person({ name: "Asha" });
    await person({ name: "Ravi", platform: "ios", build: 50 });
    const h1 = await person({ org: ORG, platform: "android", build: 30 });
    await person({ operator: true });
    const blocked = await person();
    await db().doc(`accountStatus/${blocked.uid}`).set({ status: "blocked", until: null });
    const pv = (audience: Record<string, unknown>) => call<Record<string, any>>(previewAudience, { audience }, ADMIN);

    expect(await pv({ type: "all" })).toMatchObject({ estimate: 3, exact: true, breakdown: { customers: 2, organizers: 1 }, note: null });
    expect((await pv({ type: "all" })).sample.map((s: { uid: string }) => s.uid)).not.toContain(blocked.uid);
    expect(await pv({ type: "customers" })).toMatchObject({ estimate: 2, exact: true, breakdown: { customers: 2, organizers: 0 } });
    expect(await pv({ type: "organizers" })).toMatchObject({ estimate: 1, breakdown: { organizers: 1, customers: 0 } });
    expect(await pv({ type: "orgs", orgIds: [ORG] })).toMatchObject({ estimate: 1, sample: [{ uid: h1.uid, displayName: expect.any(String) }] });
    expect(await pv({ type: "users", uids: [c1.uid, blocked.uid] })).toMatchObject({ estimate: 1, sample: [{ uid: c1.uid, displayName: "Asha" }] });
    const city = await pv({ type: "cities", cities: ["Hyderabad"] });
    expect(city).toMatchObject({ estimate: 3, exact: false });
    expect(city.note).toMatch(/phone decides the city/);
    const iosOnly = await pv({ type: "all", platforms: ["ios"] });
    expect(iosOnly).toMatchObject({ estimate: 1, exact: false });
    expect(await pv({ type: "all", minBuild: 40 })).toMatchObject({ estimate: 1 });
    expect(await pv({ type: "all", excludeUids: [c1.uid] })).toMatchObject({ estimate: 2, exact: true });
    expect(await callCode(previewAudience, { audience: { type: "nobody" } }, ADMIN)).toBe("INVALID_INPUT");
  });
});

describe("sendNotification", () => {
  const send = (over: Record<string, unknown>, ctx: unknown = ADMIN) =>
    call<{ id: string; status: string; recipients: number | null; replayed: boolean }>(sendNotification, {
      requestId: rid(), title: "Weekend picks", body: "Twelve new things to do this weekend.", reason: "Weekly push", style: "standard", ...over,
    }, ctx);

  test("to people: an admin-message inbox item each (image, style, link), pushed per person; history; audited", async () => {
    const a = await person();
    const b = await person();
    const excluded = await person();
    const r = await send({
      audience: { type: "users", uids: [a.uid, b.uid, excluded.uid], excludeUids: [excluded.uid] },
      imageUrl: "https://img.pulse.test/w.jpg", style: "rich", link: { type: "event", id: "evt-0001" },
    });
    expect(r).toMatchObject({ status: "sent", recipients: 2, replayed: false });
    const inbox = await db().collection("userNotifications").where("notificationId", "==", r.id).get();
    expect(inbox.size).toBe(2);
    expect(inbox.docs.map((d) => d.get("recipientUid")).sort()).toEqual([a.uid, b.uid].sort());
    expect(inbox.docs[0]!.data()).toMatchObject({
      kind: "admin-message", title: "Weekend picks", imageUrl: "https://img.pulse.test/w.jpg", style: "rich",
      link: { type: "event", id: "evt-0001" }, url: null, read: false,
      // Written as "pending"; the emulator's push trigger may already have
      // run and found no device for these test people.
      push: { status: expect.stringMatching(/^(pending|no-device)$/) },
    });
    expect(inbox.docs[0]!.id).toBe(`admin-message:${r.id}:${inbox.docs[0]!.get("recipientUid")}`);
    const n = (await db().doc(`adminNotifications/${r.id}`).get()).data()!;
    expect(n).toMatchObject({ status: "sent", recipients: 2, limited: false, pushMode: "per-user", reason: "Weekly push", createdBy: "admin-nc-0001" });
    expect(n.sentAt).toBeDefined();
    expect((await db().collection("auditEvents").where("resourceId", "==", r.id).get()).docs.map((d) => d.get("action"))).toEqual(["notification.sent"]);
    // A replay of the same request returns the first outcome, no second send.
    const rq = rid();
    const first = await send({ requestId: rq, audience: { type: "users", uids: [a.uid] } });
    const again = await send({ requestId: rq, audience: { type: "users", uids: [a.uid] } });
    expect(again).toMatchObject({ id: first.id, replayed: true });
    expect((await db().collection("userNotifications").where("notificationId", "==", first.id).get()).size).toBe(1);
  });

  test("to everyone: inbox for every person (not operators/blocked), the `all` topic, no per-item push; quota shared with sendBroadcast", async () => {
    await person();
    await person();
    await person({ operator: true });
    const blocked = await person();
    await db().doc(`accountStatus/${blocked.uid}`).set({ status: "blocked", until: null });
    const r = await send({ audience: { type: "all" }, url: "https://pulse.test/weekend" });
    expect(r).toMatchObject({ status: "sent", recipients: 2 });
    const inbox = await db().collection("userNotifications").where("notificationId", "==", r.id).get();
    expect(inbox.size).toBe(2);
    expect(inbox.docs[0]!.data()).toMatchObject({ push: { status: "topic" }, url: "https://pulse.test/weekend", link: null });
    // The per-item push trigger leaves topic-pushed items alone.
    expect(await deliverNotification(inbox.docs[0]!.id, inbox.docs[0]!.data())).toBe("topic");
    expect((await db().doc(`adminNotifications/${r.id}`).get()).data()).toMatchObject({ pushMode: "topic", pushStatus: "skipped-emulator", limited: true });
    expect((await db().collection("broadcasts").where("notificationId", "==", r.id).get()).docs[0]!.data()).toMatchObject({ source: "notification", topic: "all" });
    await send({ audience: { type: "customers" } });
    await send({ audience: { type: "cities", cities: ["Hyderabad"] } });
    expect(await callCode(sendNotification, { requestId: rid(), audience: { type: "all" }, title: "Hello", body: "One too many", reason: "x reason" }, ADMIN)).toBe("PRECONDITION");
    expect(await callCode(sendBroadcast, { audience: "all", title: "Hello", body: "One too many", reason: "Four" }, ADMIN)).toBe("PRECONDITION");
    // Targeted sends aren't limited by the daily quota.
    const p = await person();
    expect((await send({ audience: { type: "users", uids: [p.uid] } })).status).toBe("sent");
  });

  test("organizations, organizers, customers; cities go to topics only (no inbox); city + filters refused", async () => {
    const ORG = uniq("org");
    const h = await person({ org: ORG });
    await db().doc(`memberships/${ORG}__revoked-0001`).set({ orgId: ORG, uid: "revoked-0001", status: "revoked" });
    const c = await person();
    expect((await send({ audience: { type: "orgs", orgIds: [ORG] } })).recipients).toBe(1);
    expect((await send({ audience: { type: "organizers" } })).recipients).toBe(1);
    const cust = await send({ audience: { type: "customers" } });
    expect((await db().collection("userNotifications").where("notificationId", "==", cust.id).get()).docs.map((d) => d.get("recipientUid"))).toEqual([c.uid]);
    void h;
    const city = await send({ audience: { type: "cities", cities: ["Bengaluru", "Hyderabad"] } });
    expect(city).toMatchObject({ status: "sent", recipients: null });
    expect((await db().collection("userNotifications").where("notificationId", "==", city.id).get()).size).toBe(0);
    expect((await db().collection("broadcasts").where("notificationId", "==", city.id).get()).docs[0]!.get("topic")).toBe("city_bengaluru,city_hyderabad");
    expect((await callErr(sendNotification, { requestId: rid(), audience: { type: "cities", cities: ["Pune"], platforms: ["ios"] }, title: "Hello", body: "Hello there", reason: "x" }, ADMIN)).code).toBe("INVALID_INPUT");
  });

  test("validation and the targeted rate limit", async () => {
    const p = await person();
    const bad = (over: Record<string, unknown>) =>
      callErr(sendNotification, { requestId: rid(), audience: { type: "users", uids: [p.uid] }, title: "Hello", body: "Hello there", reason: "Ops", ...over }, ADMIN);
    expect((await bad({ title: "Hi" })).code).toBe("INVALID_INPUT");
    expect((await bad({ body: "hey" })).code).toBe("INVALID_INPUT");
    expect((await bad({ reason: "" })).code).toBe("INVALID_INPUT");
    expect((await bad({ style: "fancy" })).code).toBe("INVALID_INPUT");
    expect((await bad({ link: { type: "event", id: "evt-0001" }, url: "https://pulse.test" })).message).toMatch(/not both/);
    expect((await bad({ url: "ftp://pulse.test" })).code).toBe("INVALID_INPUT");
    expect((await bad({ audience: { type: "users", uids: [] } })).code).toBe("INVALID_INPUT");
    expect((await bad({ scheduleAt: iso(30_000) })).message).toMatch(/2 minutes/);
    expect((await bad({ scheduleAt: iso(61 * 24 * H) })).message).toMatch(/60 days/);
    await db().doc(`rateLimits/adminnotify_${"admin-nc-0001"}`).set({ windowStart: Timestamp.now(), count: 60 });
    expect((await bad({})).code).toBe("RATE_LIMITED");
  });

  test("scheduled: stored with an estimate, cancellable once, sent by the 5-minute job when due", async () => {
    const a = await person();
    const s = await send({ audience: { type: "users", uids: [a.uid] }, scheduleAt: iso(H) });
    expect(s).toMatchObject({ status: "scheduled", recipients: 1 });
    expect((await db().collection("userNotifications").where("notificationId", "==", s.id).get()).size).toBe(0);
    const c = await send({ audience: { type: "users", uids: [a.uid] }, scheduleAt: iso(H) });
    expect((await call(cancelScheduledNotification, { requestId: rid(), id: c.id, reason: "Wrong copy" }, ADMIN)).status).toBe("cancelled");
    expect(await callCode(cancelScheduledNotification, { requestId: rid(), id: c.id, reason: "Again" }, ADMIN)).toBe("PRECONDITION");
    expect((await db().doc(`adminNotifications/${c.id}`).get()).data()).toMatchObject({ status: "cancelled", cancelReason: "Wrong copy", cancelledBy: "admin-nc-0001" });

    expect(await sendDueNotifications()).toMatchObject({ due: 0 });
    await db().doc(`adminNotifications/${s.id}`).update({ scheduleAt: Timestamp.fromMillis(Date.now() - 1000) });
    await db().doc(`adminNotifications/${c.id}`).update({ scheduleAt: Timestamp.fromMillis(Date.now() - 1000) });
    const job = await runNotificationJobsOnce();
    expect(job.steps.scheduledNotifications).toMatchObject({ due: 1, sent: 1, failed: 0 });
    expect((await db().doc(`adminNotifications/${s.id}`).get()).data()).toMatchObject({ status: "sent", recipients: 1 });
    expect((await db().collection("userNotifications").where("notificationId", "==", s.id).get()).size).toBe(1);
    expect((await db().doc(`jobRuns/runNotificationJobs_${new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10)}`).get()).get("lastStatus")).toBe("ok");
    // A limited scheduled send past the daily quota fails as "daily-limit".
    for (const reason of ["One", "Two", "Three"]) await call(sendBroadcast, { audience: "all", title: "Hello", body: "Weekend picks", reason }, ADMIN);
    const late = await send({ audience: { type: "all" }, scheduleAt: iso(H) });
    await db().doc(`adminNotifications/${late.id}`).update({ scheduleAt: Timestamp.fromMillis(Date.now() - 1000) });
    await sendDueNotifications();
    expect((await db().doc(`adminNotifications/${late.id}`).get()).data()).toMatchObject({ status: "failed", failure: "daily-limit" });
  });
});

describe("announcement windows job", () => {
  test("scheduled → live at startsAt (sending its push once), live → ended after endsAt", async () => {
    const sched = await save({ startsAt: iso(H), endsAt: iso(3 * H), sendPush: true });
    await act(sched.id, "publish");
    expect((await ann(sched.id)).pushStatus).toBe("pending");
    const ending = await live({ endsAt: iso(2 * H) });
    await db().doc(`announcements/${sched.id}`).update({ startsAt: Timestamp.fromMillis(Date.now() - 1000) });
    await db().doc(`announcements/${ending}`).update({ endsAt: Timestamp.fromMillis(Date.now() - 1000) });
    expect(await advanceAnnouncementWindows()).toMatchObject({ wentLive: 1, ended: 1, pushes: 1 });
    expect(await ann(sched.id)).toMatchObject({ status: "live", pushStatus: "skipped-emulator" });
    expect((await ann(ending)).status).toBe("ended");
    expect(await advanceAnnouncementWindows()).toMatchObject({ wentLive: 0, ended: 0, pushes: 0 });
    const audits = (await db().collection("auditEvents").where("actorUid", "==", "system").get()).docs.map((d) => d.get("action")).sort();
    expect(audits).toEqual(["announcement.ended-automatically", "announcement.went-live"]);
  });
});

describe("templates", () => {
  test("save, update, delete (with a reason); validated; audited", async () => {
    const r = await call<{ id: string }>(saveTemplate, { requestId: rid(), name: "Weekend picks", kind: "notification", payload: { title: "Weekend", body: "Picks" } }, ADMIN);
    expect((await db().doc(`notificationTemplates/${r.id}`).get()).data()).toMatchObject({ name: "Weekend picks", kind: "notification", payload: { title: "Weekend" }, createdBy: "admin-nc-0001" });
    await call(saveTemplate, { requestId: rid(), id: r.id, name: "Weekend picks v2", kind: "notification", payload: { title: "Weekend 2" } }, ADMIN);
    expect((await db().doc(`notificationTemplates/${r.id}`).get()).get("name")).toBe("Weekend picks v2");
    expect(await callCode(saveTemplate, { requestId: rid(), name: "Hi", kind: "notification", payload: {} }, ADMIN)).toBe("INVALID_INPUT");
    expect(await callCode(saveTemplate, { requestId: rid(), name: "Valid name", kind: "email", payload: {} }, ADMIN)).toBe("INVALID_INPUT");
    expect(await callCode(saveTemplate, { requestId: rid(), name: "Valid name", kind: "announcement", payload: { big: "x".repeat(21_000) } }, ADMIN)).toBe("INVALID_INPUT");
    expect(await callCode(deleteTemplate, { requestId: rid(), id: r.id }, ADMIN)).toBe("INVALID_INPUT");
    expect((await call(deleteTemplate, { requestId: rid(), id: r.id, reason: "Outdated" }, ADMIN)).deleted).toBe(true);
    expect((await db().doc(`notificationTemplates/${r.id}`).get()).exists).toBe(false);
    expect(await callCode(deleteTemplate, { requestId: rid(), id: r.id, reason: "Again" }, ADMIN)).toBe("NOT_FOUND");
    const actions = (await db().collection("auditEvents").where("resourceId", "==", r.id).get()).docs.map((d) => d.get("action")).sort();
    expect(actions).toEqual(["template.created", "template.deleted", "template.updated"]);
  });
});
