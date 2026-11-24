import { describe, expect, it } from "vitest";
import {
  EMPTY_ANNOUNCEMENT,
  EMPTY_AUDIENCE,
  EMPTY_CTA,
  EMPTY_NOTIFICATION,
  FORMAT_META,
  FORMATS,
  TONE_META,
  TONES,
  announcementActions,
  announcementFormFrom,
  announcementFormFromTemplate,
  announcementProblems,
  announcementTemplatePayload,
  audienceFormFrom,
  audienceProblems,
  audienceSummary,
  broadPushesUsed,
  buildAnnouncementPayload,
  buildNotificationPayload,
  canClose,
  ctaHint,
  ctrOf,
  effectiveStatus,
  filterAnnouncements,
  formatRate,
  hasFilters,
  isHttpsUrl,
  isLimitedAudience,
  istInputToIso,
  normalizeSeries,
  notificationFormFromTemplate,
  notificationProblems,
  notificationTemplatePayload,
  overviewSummary,
  previewModel,
  pushRoute,
  reachOf,
  readAccountHits,
  readPreview,
  recipientsLabel,
  statusCounts,
  templateProblems,
  toAnnouncementRow,
  toAudience,
  toCta,
  toIstInput,
  toNotificationRow,
  type AnnouncementForm,
  type AudienceForm,
  type NotificationForm,
} from "@/lib/notifications";
import { accountActions, accountStateOf, accountStatusLine, buildAccountStatusPayload, statusHistory, BLOCK_PHRASE } from "@/lib/accounts";
import { buildEntityStatusPayload } from "@/lib/console/actions";

const NOW = new Date("2026-11-24T06:30:00.000Z"); // 12:00 IST
const hours = (h: number) => new Date(NOW.getTime() + h * 3_600_000);
const aud = (over: Partial<AudienceForm> = {}): AudienceForm => ({ ...EMPTY_AUDIENCE, ...over });
const ann = (over: Partial<AnnouncementForm> = {}): AnnouncementForm => ({ ...EMPTY_ANNOUNCEMENT, title: "Welcome to PULSE", ...over });
const ntf = (over: Partial<NotificationForm> = {}): NotificationForm => ({ ...EMPTY_NOTIFICATION, title: "New this weekend", body: "Twelve new experiences near you.", reason: "Weekend promo", ...over });
const fields = (ps: Array<{ field: string }>) => ps.map((p) => p.field);

describe("audience → server object", () => {
  it("keeps only the keys that apply and drops empty filters", () => {
    expect(toAudience(aud())).toEqual({ type: "all" });
    expect(toAudience(aud({ type: "cities", cities: ["Hyderabad", " Hyderabad ", ""] }))).toEqual({ type: "cities", cities: ["Hyderabad"] });
    expect(toAudience(aud({ type: "users", people: [{ uid: "u1", displayName: "A" }, { uid: "u1", displayName: "A" }, { uid: "u2", displayName: null }] }))).toEqual({ type: "users", uids: ["u1", "u2"] });
    expect(toAudience(aud({ type: "orgs", orgs: [{ orgId: "o1", name: "Org" }] }))).toEqual({ type: "orgs", orgIds: ["o1"] });
    // A type's lists don't leak into another type.
    expect(toAudience(aud({ type: "all", cities: ["Pune"], people: [{ uid: "u1", displayName: null }] }))).toEqual({ type: "all" });
  });
  it("platform: one platform is a filter, both = no filter; builds and exclusions", () => {
    expect(toAudience(aud({ platforms: ["android", "ios"] }))).toEqual({ type: "all" });
    expect(toAudience(aud({ platforms: ["ios"], minBuild: "120", maxBuild: " 140 ", exclude: [{ uid: "x1", displayName: null }] }))).toEqual({ type: "all", platforms: ["ios"], minBuild: 120, maxBuild: 140, excludeUids: ["x1"] });
    expect(toAudience(aud({ minBuild: "abc" }))).toEqual({ type: "all" });
  });
  it("round-trips a stored audience into the builder", () => {
    const form = audienceFormFrom({ type: "users", uids: ["u1", 4, ""], platforms: ["android", "web"], minBuild: 7, excludeUids: ["x"] });
    expect(form.people).toEqual([{ uid: "u1", displayName: null }]);
    expect(form.platforms).toEqual(["android"]);
    expect(form.minBuild).toBe("7");
    expect(toAudience(form)).toEqual({ type: "users", uids: ["u1"], platforms: ["android"], minBuild: 7, excludeUids: ["x"] });
    expect(audienceFormFrom({ type: "nope" }).type).toBe("all");
  });
  it("problems: empty lists, caps, bad builds, min > max", () => {
    expect(audienceProblems(aud())).toEqual([]);
    expect(fields(audienceProblems(aud({ type: "cities" })))).toEqual(["audience"]);
    expect(fields(audienceProblems(aud({ type: "users" })))).toEqual(["audience"]);
    expect(fields(audienceProblems(aud({ type: "orgs" })))).toEqual(["audience"]);
    const many = Array.from({ length: 501 }, (_, i) => ({ uid: `u${i}`, displayName: null }));
    expect(audienceProblems(aud({ type: "users", people: many }))[0]!.message).toMatch(/500/);
    const orgs = Array.from({ length: 101 }, (_, i) => ({ orgId: `o${i}`, name: null }));
    expect(audienceProblems(aud({ type: "orgs", orgs }))[0]!.message).toMatch(/100/);
    expect(fields(audienceProblems(aud({ minBuild: "1.5" })))).toEqual(["minBuild"]);
    expect(fields(audienceProblems(aud({ minBuild: "200", maxBuild: "100" })))).toEqual(["maxBuild"]);
  });
});

describe("audience summary", () => {
  it("reads each audience type", () => {
    expect(audienceSummary({ type: "all" })).toBe("Everyone on PULSE");
    expect(audienceSummary({ type: "customers" })).toBe("Customers");
    expect(audienceSummary({ type: "organizers" })).toBe("Organizers");
    expect(audienceSummary({ type: "cities", cities: ["Hyderabad", "Pune"] })).toBe("People in Hyderabad, Pune");
    expect(audienceSummary({ type: "cities", cities: ["A", "B", "C", "D", "E"] })).toBe("People in A, B + 3 more");
    expect(audienceSummary({ type: "users", uids: ["a"] })).toBe("1 specific person");
    expect(audienceSummary({ type: "users", uids: ["a", "b"] })).toBe("2 specific people");
    expect(audienceSummary({ type: "orgs", orgIds: ["a", "b"] })).toBe("Members of 2 organizations");
    expect(audienceSummary(null)).toBe("—");
  });
  it("appends filters", () => {
    expect(audienceSummary({ type: "all", platforms: ["android"], minBuild: 120, excludeUids: ["a", "b"] })).toBe("Everyone on PULSE · Android only · build ≥ 120 · 2 excluded");
    expect(audienceSummary({ type: "customers", platforms: ["ios"], minBuild: 100, maxBuild: 140 })).toBe("Customers · iPhone only · builds 100–140");
    expect(audienceSummary({ type: "customers", maxBuild: 9 })).toBe("Customers · build ≤ 9");
    expect(audienceSummary({ type: "customers", minBuild: 9, maxBuild: 9 })).toBe("Customers · build 9");
  });
  it("routing: topic for all-without-filters and cities, per-user otherwise; the 3-a-day limit", () => {
    expect(pushRoute({ type: "all" })).toBe("topic");
    expect(pushRoute({ type: "all", platforms: ["ios"] })).toBe("per-user");
    expect(pushRoute({ type: "cities", cities: ["Pune"] })).toBe("topic");
    expect(pushRoute({ type: "users", uids: ["a"] })).toBe("per-user");
    expect(["all", "customers", "cities"].map((t) => isLimitedAudience({ type: t as "all" }))).toEqual([true, true, true]);
    expect(["organizers", "users", "orgs"].map((t) => isLimitedAudience({ type: t as "all" }))).toEqual([false, false, false]);
    expect(hasFilters({ type: "all" })).toBe(false);
    expect(hasFilters({ type: "all", excludeUids: ["x"] })).toBe(true);
  });
});

describe("links and time", () => {
  it("https only; images may use the local storage emulator", () => {
    expect(isHttpsUrl("https://pulse.app/x")).toBe(true);
    expect(isHttpsUrl("http://pulse.app/x")).toBe(false);
    expect(isHttpsUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpsUrl("not a url")).toBe(false);
    expect(isHttpsUrl("http://127.0.0.1:9199/v0/b/x/o/a.png", { allowEmulator: true })).toBe(true);
    expect(isHttpsUrl("http://127.0.0.1:9199/v0/b/x/o/a.png")).toBe(false);
  });
  it("datetime-local is read as India time", () => {
    expect(istInputToIso("2026-12-02T18:00")).toBe("2026-12-02T12:30:00.000Z");
    expect(istInputToIso("")).toBeNull();
    expect(istInputToIso("2026-12-02")).toBeNull();
    expect(toIstInput("2026-12-02T12:30:00.000Z")).toBe("2026-12-02T18:00");
    expect(toIstInput(null)).toBe("");
  });
  it("CTA rows → server objects", () => {
    expect(toCta(EMPTY_CTA)).toBeNull();
    expect(toCta({ ...EMPTY_CTA, label: " Explore " })).toEqual({ label: "Explore" });
    expect(toCta({ ...EMPTY_CTA, label: "Book", target: "link", linkType: "event", linkId: "ev_123456" })).toEqual({ label: "Book", link: { type: "event", id: "ev_123456" } });
    expect(toCta({ ...EMPTY_CTA, label: "Read", target: "url", url: "https://pulse.app/x" })).toEqual({ label: "Read", url: "https://pulse.app/x" });
    expect(ctaHint({ label: "x", link: { type: "trip-departure", id: "dep1" } })).toBe("Opens trip departure dep1");
    expect(ctaHint({ label: "x", url: "https://pulse.app/a" })).toBe("Opens pulse.app in the browser");
    expect(ctaHint({ label: "x" })).toBe("Closes the message");
  });
});

describe("announcement validation", () => {
  it("a minimal draft is valid", () => {
    expect(announcementProblems(ann(), { now: NOW, forPublish: true })).toEqual([]);
  });
  it("title, body, image and priority limits", () => {
    expect(fields(announcementProblems(ann({ title: "Hi" }), { now: NOW, forPublish: false }))).toEqual(["title"]);
    expect(fields(announcementProblems(ann({ title: "x".repeat(81) }), { now: NOW, forPublish: false }))).toEqual(["title"]);
    expect(fields(announcementProblems(ann({ body: "x".repeat(601) }), { now: NOW, forPublish: false }))).toEqual(["body"]);
    expect(fields(announcementProblems(ann({ imageUrl: "http://x.io/a.png" }), { now: NOW, forPublish: false }))).toEqual(["imageUrl"]);
    expect(fields(announcementProblems(ann({ priority: 101 }), { now: NOW, forPublish: false }))).toEqual(["priority"]);
  });
  it("CTA rules: label length, valid link id, https url, no second button without a first", () => {
    const bad = announcementProblems(ann({ primaryCta: { ...EMPTY_CTA, label: "Go", target: "link", linkId: "x" } }), { now: NOW, forPublish: false });
    expect(fields(bad)).toEqual(["primaryCta"]);
    const badUrl = announcementProblems(ann({ primaryCta: { ...EMPTY_CTA, label: "Go", target: "url", url: "ftp://x" } }), { now: NOW, forPublish: false });
    expect(badUrl[0]!.message).toMatch(/https/);
    const long = announcementProblems(ann({ primaryCta: { ...EMPTY_CTA, label: "x".repeat(31) } }), { now: NOW, forPublish: false });
    expect(fields(long)).toEqual(["primaryCta"]);
    const second = announcementProblems(ann({ secondaryCta: { ...EMPTY_CTA, label: "Later" } }), { now: NOW, forPublish: false });
    expect(fields(second)).toEqual(["secondaryCta"]);
  });
  it("can-close rule applies to popups only", () => {
    const stuck = { dismissible: false, requireAck: false, primaryCta: EMPTY_CTA, secondaryCta: EMPTY_CTA };
    expect(canClose({ ...stuck, format: "modal" })).toBe(false);
    expect(canClose({ ...stuck, format: "sheet" })).toBe(false);
    expect(canClose({ ...stuck, format: "fullscreen" })).toBe(false);
    expect(canClose({ ...stuck, format: "banner" })).toBe(true);
    expect(canClose({ ...stuck, format: "inbox" })).toBe(true);
    expect(canClose({ ...stuck, format: "modal", requireAck: true })).toBe(true);
    expect(canClose({ ...stuck, format: "modal", primaryCta: { ...EMPTY_CTA, label: "OK" } })).toBe(true);
    expect(fields(announcementProblems(ann({ ...stuck }), { now: NOW, forPublish: false }))).toEqual(["dismissible"]);
  });
  it("window: start time required when scheduled, end after start, end not passed at publish", () => {
    expect(fields(announcementProblems(ann({ startMode: "at", startsAt: "" }), { now: NOW, forPublish: false }))).toEqual(["startsAt"]);
    const before = announcementProblems(ann({ startMode: "at", startsAt: "2026-12-02T18:00", endsAt: "2026-12-02T17:00" }), { now: NOW, forPublish: false });
    expect(before[0]!.message).toMatch(/after it starts/);
    const passed = announcementProblems(ann({ endsAt: "2026-11-24T11:00" }), { now: NOW, forPublish: true });
    expect(fields(passed)).toContain("endsAt");
    expect(announcementProblems(ann({ endsAt: "2026-11-24T13:00" }), { now: NOW, forPublish: true })).toEqual([]);
  });
  it("a city push can't carry platform/build filters", () => {
    const p = announcementProblems(ann({ sendPush: true, audience: aud({ type: "cities", cities: ["Pune"], platforms: ["ios"] }) }), { now: NOW, forPublish: true });
    expect(fields(p)).toEqual(["sendPush"]);
    expect(announcementProblems(ann({ sendPush: false, audience: aud({ type: "cities", cities: ["Pune"], platforms: ["ios"] }) }), { now: NOW, forPublish: true })).toEqual([]);
  });
  it("payload: every contract field, ISO window, no second CTA without a first", () => {
    const p = buildAnnouncementPayload(
      ann({ tone: "promo", primaryCta: { ...EMPTY_CTA, label: "Explore" }, startMode: "at", startsAt: "2026-12-02T18:00", endsAt: "2026-12-03T18:00", audience: aud({ type: "customers" }), sendPush: true }),
      { requestId: "req-12345678", id: "ann1" },
    );
    expect(p).toEqual({
      requestId: "req-12345678",
      id: "ann1",
      title: "Welcome to PULSE",
      body: "",
      format: "modal",
      tone: "promo",
      imageUrl: null,
      primaryCta: { label: "Explore" },
      secondaryCta: null,
      dismissible: true,
      requireAck: false,
      frequency: "once",
      priority: 50,
      audience: { type: "customers" },
      startsAt: "2026-12-02T12:30:00.000Z",
      endsAt: "2026-12-03T12:30:00.000Z",
      sendPush: true,
    });
    expect(buildAnnouncementPayload(ann({ secondaryCta: { ...EMPTY_CTA, label: "Later" } }), { requestId: "req-12345678" })).toMatchObject({ secondaryCta: null, startsAt: null, endsAt: null });
    expect("id" in buildAnnouncementPayload(ann(), { requestId: "req-12345678" })).toBe(false);
  });
  it("a stored doc round-trips into the composer", () => {
    const form = announcementFormFrom({ title: "T", format: "sheet", tone: "warning", primaryCta: { label: "Go", link: { type: "event", id: "ev_1234" } }, priority: 77.4, dismissible: false, startsAt: "2026-12-02T12:30:00.000Z", audience: { type: "orgs", orgIds: ["o1"] } });
    expect(form.format).toBe("sheet");
    expect(form.tone).toBe("warning");
    expect(form.primaryCta).toMatchObject({ target: "link", linkType: "event", linkId: "ev_1234" });
    expect(form.priority).toBe(77);
    expect(form.dismissible).toBe(false);
    expect(form.startMode).toBe("at");
    expect(form.startsAt).toBe("2026-12-02T18:00");
    expect(form.audience.orgs).toEqual([{ orgId: "o1", name: null }]);
    expect(announcementFormFrom({ format: "weird", tone: "loud" })).toMatchObject({ format: "modal", tone: "info" });
  });
});

describe("format preview mapping", () => {
  it("every format has a placement; popups are modal / fullscreen / sheet", () => {
    expect(FORMATS.map((f) => FORMAT_META[f].placement)).toEqual(["center", "full", "bottom", "top", "inbox"]);
    expect(FORMATS.filter((f) => FORMAT_META[f].popup)).toEqual(["modal", "fullscreen", "sheet"]);
    expect(FORMAT_META.modal.label).toBe("Centre popup");
    expect(FORMAT_META.inbox.label).toBe("Inbox only");
  });
  it("every tone has an accent colour and an icon", () => {
    for (const t of TONES) {
      expect(TONE_META[t].accent).toMatch(/^#[0-9A-F]{6}$/i);
      expect(TONE_META[t].icon).toBeTruthy();
    }
    expect(TONE_META.promo.icon).toBe("sparkles");
    expect(TONE_META.critical.badge).toBe("err");
  });
  it("preview model reflects format, tone, buttons and closing", () => {
    const m = previewModel(ann({ format: "modal", tone: "promo", body: " Hello ", primaryCta: { ...EMPTY_CTA, label: "Explore" }, secondaryCta: { ...EMPTY_CTA, label: "Later" }, requireAck: true }));
    expect(m).toMatchObject({ placement: "center", popup: true, title: "Welcome to PULSE", body: "Hello", primary: "Explore", secondary: "Later", showClose: true, showAck: true, primaryHint: "Closes the message" });
    expect(m.tone.accent).toBe(TONE_META.promo.accent);
    expect(previewModel(ann({ format: "inbox", requireAck: true })).showAck).toBe(false);
    expect(previewModel(ann({ format: "inbox" })).showClose).toBe(false);
    expect(previewModel(ann({ format: "banner", dismissible: false })).showClose).toBe(false);
    expect(previewModel(ann({ title: "  " })).title).toBe("Your title");
    expect(previewModel(ann({ imageUrl: "http://evil" })).imageUrl).toBeNull();
    expect(previewModel(ann({ imageUrl: "https://x.io/a.png" })).imageUrl).toBe("https://x.io/a.png");
    expect(previewModel(ann({ secondaryCta: { ...EMPTY_CTA, label: "Later" } })).secondary).toBeNull();
  });
});

describe("status", () => {
  const start = hours(-1);
  const end = hours(2);
  it("effective status follows the window", () => {
    expect(effectiveStatus("live", start, end, NOW)).toBe("live");
    expect(effectiveStatus("live", start, hours(-0.5), NOW)).toBe("ended");
    expect(effectiveStatus("scheduled", hours(1), null, NOW)).toBe("scheduled");
    expect(effectiveStatus("scheduled", start, null, NOW)).toBe("live");
    expect(effectiveStatus("scheduled", hours(1), hours(-1), NOW)).toBe("ended");
    expect(effectiveStatus("paused", start, hours(-1), NOW)).toBe("paused");
    expect(effectiveStatus("draft", null, null, NOW)).toBe("draft");
    expect(effectiveStatus("bogus", null, null, NOW)).toBe("draft");
  });
  it("row actions per status (contract §5)", () => {
    expect(announcementActions("draft")).toEqual(["publish", "duplicate", "archive"]);
    expect(announcementActions("scheduled")).toEqual(["pause", "end", "duplicate", "archive"]);
    expect(announcementActions("live")).toEqual(["pause", "end", "duplicate", "archive"]);
    expect(announcementActions("paused")).toEqual(["resume", "end", "duplicate", "archive"]);
    expect(announcementActions("ended")).toEqual(["duplicate", "archive"]);
    expect(announcementActions("archived")).toEqual(["duplicate"]);
  });
  it("library filter and counts use the effective status; All hides archived", () => {
    const rows = [
      toAnnouncementRow("a", { title: "Live one", status: "live", startsAt: start }),
      toAnnouncementRow("b", { title: "Expired", status: "live", startsAt: start, endsAt: hours(-0.2) }),
      toAnnouncementRow("c", { title: "Draft promo", status: "draft" }),
      toAnnouncementRow("d", { title: "Old", status: "archived" }),
    ];
    expect(filterAnnouncements(rows, { status: "all", search: "", now: NOW }).map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(filterAnnouncements(rows, { status: "ended", search: "", now: NOW }).map((r) => r.id)).toEqual(["b"]);
    expect(filterAnnouncements(rows, { status: "archived", search: "", now: NOW }).map((r) => r.id)).toEqual(["d"]);
    expect(filterAnnouncements(rows, { status: "all", search: "PROMO", now: NOW }).map((r) => r.id)).toEqual(["c"]);
    expect(statusCounts(rows, NOW)).toMatchObject({ live: 1, ended: 1, draft: 1, archived: 1, paused: 0 });
  });
});

describe("stats", () => {
  it("CTR = clicks per viewer, falls back to shown; reach = viewers / targeted", () => {
    expect(ctrOf({ clicked: 5, viewers: 50, shown: 80 })).toBe(0.1);
    expect(ctrOf({ clicked: 5, viewers: 0, shown: 20 })).toBe(0.25);
    expect(ctrOf({ clicked: 0, viewers: 0, shown: 0 })).toBeNull();
    expect(ctrOf({ clicked: 9, viewers: 3, shown: 3 })).toBe(1);
    expect(formatRate(0.1)).toBe("10%");
    expect(formatRate(0.0123)).toBe("1.2%");
    expect(formatRate(0)).toBe("0%");
    expect(formatRate(null)).toBe("—");
    expect(reachOf({ viewers: 25, targeted: 100 })).toBe(0.25);
    expect(reachOf({ viewers: 25, targeted: 0 })).toBeNull();
  });
  it("series: 30 zero-filled days, oldest first", () => {
    const s = normalizeSeries([{ day: "2026-11-24", shown: 4, clicked: 1 }, { day: "2026-11-20", shown: 2 }, { nope: true }], "2026-11-24");
    expect(s).toHaveLength(30);
    expect(s[0]!.day).toBe("2026-10-26");
    expect(s[29]).toEqual({ day: "2026-11-24", shown: 4, clicked: 1, dismissed: 0, acked: 0 });
    expect(s[25]).toEqual({ day: "2026-11-20", shown: 2, clicked: 0, dismissed: 0, acked: 0 });
    expect(normalizeSeries(undefined, "2026-11-24", 3).map((p) => p.shown)).toEqual([0, 0, 0]);
  });
  it("reads previewAudience defensively", () => {
    expect(readPreview({ estimate: 12, exact: false, breakdown: { customers: 10, organizers: 2 }, sample: [{ uid: "u1", displayName: "Asha" }, { bad: 1 }], note: "City reach is decided on the phone." })).toEqual({
      estimate: 12,
      exact: false,
      breakdown: { customers: 10, organizers: 2 },
      sample: [{ uid: "u1", displayName: "Asha" }],
      note: "City reach is decided on the phone.",
    });
    expect(readPreview(null)).toEqual({ estimate: 0, exact: true, breakdown: { customers: 0, organizers: 0 }, sample: [], note: null });
  });
  it("reads searchAccounts whether it's a list or wrapped", () => {
    const hit = { uid: "u1", displayName: "Asha", phoneMasked: "+91 98•••••210", role: "organizer", orgs: [{ orgId: "o1", name: "Org" }], accountStatus: "paused", accountStatusUntil: "2026-12-02T12:30:00.000Z" };
    expect(readAccountHits([hit])[0]).toEqual(hit);
    expect(readAccountHits({ accounts: [hit] })).toHaveLength(1);
    expect(readAccountHits({ items: [{ uid: "u2", role: "x", accountStatus: "weird" }] })[0]).toMatchObject({ role: "customer", accountStatus: "active", displayName: null });
    expect(readAccountHits("nope")).toEqual([]);
  });
});

describe("notifications", () => {
  it("valid form; title/body/reason limits", () => {
    expect(notificationProblems(ntf(), NOW)).toEqual([]);
    expect(fields(notificationProblems(ntf({ title: "Hi" }), NOW))).toEqual(["title"]);
    expect(fields(notificationProblems(ntf({ title: "x".repeat(66) }), NOW))).toEqual(["title"]);
    expect(fields(notificationProblems(ntf({ body: "abcd" }), NOW))).toEqual(["body"]);
    expect(fields(notificationProblems(ntf({ body: "x".repeat(241) }), NOW))).toEqual(["body"]);
    expect(fields(notificationProblems(ntf({ reason: "no" }), NOW))).toEqual(["reason"]);
  });
  it("rich needs an image; links and URLs are checked", () => {
    expect(fields(notificationProblems(ntf({ style: "rich" }), NOW))).toEqual(["imageUrl"]);
    expect(notificationProblems(ntf({ style: "rich", imageUrl: "https://x.io/a.jpg" }), NOW)).toEqual([]);
    expect(fields(notificationProblems(ntf({ target: "link", linkId: "x" }), NOW))).toEqual(["linkId"]);
    expect(fields(notificationProblems(ntf({ target: "url", url: "http://x" }), NOW))).toEqual(["url"]);
  });
  it("cities can't be filtered; schedule 2 min .. 60 days ahead", () => {
    expect(fields(notificationProblems(ntf({ audience: aud({ type: "cities", cities: ["Pune"], exclude: [{ uid: "a", displayName: null }] }) }), NOW))).toEqual(["audience"]);
    expect(fields(notificationProblems(ntf({ when: "at", scheduleAt: "" }), NOW))).toEqual(["scheduleAt"]);
    expect(fields(notificationProblems(ntf({ when: "at", scheduleAt: "2026-11-24T12:01" }), NOW))).toEqual(["scheduleAt"]);
    expect(notificationProblems(ntf({ when: "at", scheduleAt: "2026-11-24T12:05" }), NOW)).toEqual([]);
    expect(fields(notificationProblems(ntf({ when: "at", scheduleAt: "2027-02-01T12:00" }), NOW))).toEqual(["scheduleAt"]);
  });
  it("payload: only the keys that are set", () => {
    expect(buildNotificationPayload(ntf(), "req-12345678")).toEqual({ requestId: "req-12345678", audience: { type: "all" }, title: "New this weekend", body: "Twelve new experiences near you.", style: "standard", reason: "Weekend promo" });
    expect(buildNotificationPayload(ntf({ target: "link", linkType: "event", linkId: "ev_1234", imageUrl: "https://x.io/a.jpg", style: "rich", when: "at", scheduleAt: "2026-11-25T09:00" }), "req-12345678")).toMatchObject({
      link: { type: "event", id: "ev_1234" },
      imageUrl: "https://x.io/a.jpg",
      style: "rich",
      scheduleAt: "2026-11-25T03:30:00.000Z",
    });
    expect(buildNotificationPayload(ntf({ target: "url", url: "https://pulse.app" }), "req-12345678")).toMatchObject({ url: "https://pulse.app" });
    expect("link" in buildNotificationPayload(ntf({ target: "url", url: "https://pulse.app", linkId: "ev_1234" }), "req-12345678")).toBe(false);
  });
  it("history rows and recipients copy", () => {
    const r = toNotificationRow("n1", { title: "T", status: "sent", recipients: 1204, audience: { type: "customers" }, link: { type: "event", id: "e1" } });
    expect(recipientsLabel(r)).toBe("1,204 people");
    expect(recipientsLabel(toNotificationRow("n2", { status: "sent", recipients: null, audience: { type: "cities", cities: ["Pune"] } }))).toBe("City topic push");
    expect(recipientsLabel(toNotificationRow("n3", { status: "scheduled", audience: { type: "users", uids: ["a"] } }))).toBe("At send time");
    expect(r.link).toEqual({ type: "event", id: "e1" });
  });
});

describe("templates", () => {
  it("announcement payload drops the schedule and round-trips (chip names kept)", () => {
    const form = ann({ tone: "success", startMode: "at", startsAt: "2026-12-02T18:00", endsAt: "2026-12-03T18:00", primaryCta: { ...EMPTY_CTA, label: "Go", target: "url", url: "https://x.io" }, audience: aud({ type: "users", people: [{ uid: "u1", displayName: "Asha" }] }) });
    const p = announcementTemplatePayload(form);
    expect(p).not.toHaveProperty("startsAt");
    expect(p).not.toHaveProperty("startMode");
    const back = announcementFormFromTemplate(p);
    expect(back.tone).toBe("success");
    expect(back.startMode).toBe("now");
    expect(back.primaryCta).toEqual({ ...EMPTY_CTA, label: "Go", target: "url", url: "https://x.io" });
    expect(back.audience.people).toEqual([{ uid: "u1", displayName: "Asha" }]);
  });
  it("notification payload drops schedule and reason and round-trips", () => {
    const p = notificationTemplatePayload(ntf({ when: "at", scheduleAt: "2026-11-25T09:00", target: "link", linkId: "ev_1234", audience: aud({ type: "orgs", orgs: [{ orgId: "o1", name: "Org" }] }) }));
    expect(p).not.toHaveProperty("reason");
    expect(p).not.toHaveProperty("scheduleAt");
    const back = notificationFormFromTemplate(p);
    expect(back).toMatchObject({ title: "New this weekend", target: "link", linkId: "ev_1234", reason: "", when: "now" });
    expect(back.audience.orgs).toEqual([{ orgId: "o1", name: "Org" }]);
    expect(notificationFormFromTemplate(null).title).toBe("");
  });
  it("name 3..60 and a 20 KB cap", () => {
    expect(templateProblems({ name: "Weekend promo", payload: {} })).toEqual([]);
    expect(fields(templateProblems({ name: "ab", payload: {} }))).toEqual(["name"]);
    expect(fields(templateProblems({ name: "Big", payload: { body: "x".repeat(21_000) } }))).toEqual(["payload"]);
  });
});

describe("overview", () => {
  it("live and scheduled by effective status, viewers, CTR and 7-day sends", () => {
    const anns = [
      toAnnouncementRow("a", { title: "A", status: "live", startsAt: hours(-5), priority: 10, stats: { viewers: 100, clicked: 10 } }),
      toAnnouncementRow("b", { title: "B", status: "live", startsAt: hours(-5), priority: 90, stats: { viewers: 100, clicked: 30 } }),
      toAnnouncementRow("c", { title: "C", status: "scheduled", startsAt: hours(3) }),
      toAnnouncementRow("d", { title: "D", status: "draft" }),
    ];
    const sends = [
      toNotificationRow("n1", { status: "sent", sentAt: hours(-24), recipients: 40 }),
      toNotificationRow("n2", { status: "sent", sentAt: hours(-24 * 9), recipients: 99 }),
      toNotificationRow("n3", { status: "scheduled", scheduleAt: hours(5) }),
    ];
    const s = overviewSummary(anns, sends, NOW);
    expect(s.live.map((r) => r.id)).toEqual(["b", "a"]);
    expect(s.scheduled.map((r) => r.id)).toEqual(["c"]);
    expect(s.drafts).toBe(1);
    expect(s.liveViewers).toBe(200);
    expect(s.liveCtr).toBe(0.2);
    expect(s.sends7d).toBe(1);
    expect(s.reached7d).toBe(40);
    expect(s.scheduledSends).toBe(1);
  });
  it("broad pushes used in the last 24 h", () => {
    expect(broadPushesUsed([{ raw: { createdAt: hours(-1) } }, { raw: { createdAt: hours(-23) } }, { raw: { createdAt: hours(-25) } }, { raw: {} }], NOW)).toBe(2);
  });
});

describe("account controls", () => {
  it("state: no doc = active; until passed = active again (lapsed)", () => {
    expect(accountStateOf(null, NOW)).toMatchObject({ status: "active", until: null, lapsed: false });
    expect(accountStateOf({ status: "paused", until: hours(48), messageToUser: " Call us " }, NOW)).toMatchObject({ status: "paused", messageToUser: "Call us", lapsed: false });
    expect(accountStateOf({ status: "blocked", until: hours(-1) }, NOW)).toMatchObject({ status: "active", lapsed: true });
    expect(accountStateOf({ status: "weird" }, NOW).status).toBe("active");
  });
  it("actions per status; block needs the typed phrase", () => {
    expect(accountActions("active").map((a) => a.status)).toEqual(["paused", "blocked"]);
    expect(accountActions("paused").map((a) => a.status)).toEqual(["active", "paused", "blocked"]);
    expect(accountActions("blocked").map((a) => a.status)).toEqual(["active", "paused", "blocked"]);
    expect(accountActions("active").find((a) => a.status === "blocked")!.phrase).toBe(BLOCK_PHRASE);
    expect(accountActions("active").find((a) => a.status === "paused")!.phrase).toBeNull();
  });
  it("payload: reason 10..2000, message ≤ 500, until future ≤ 2 years and only for pause/block", () => {
    const base = { requestId: "req-12345678", uid: "u1", status: "paused" as const, reason: "Chargeback investigation", messageToUser: "", until: null, now: NOW };
    expect(buildAccountStatusPayload(base)).toEqual({ requestId: "req-12345678", uid: "u1", status: "paused", reason: "Chargeback investigation" });
    expect(buildAccountStatusPayload({ ...base, messageToUser: " Hi ", until: hours(48).toISOString() })).toMatchObject({ messageToUser: "Hi", until: hours(48).toISOString() });
    expect(() => buildAccountStatusPayload({ ...base, reason: "short" })).toThrow(/10–2000/);
    expect(() => buildAccountStatusPayload({ ...base, messageToUser: "x".repeat(501) })).toThrow(/500/);
    expect(() => buildAccountStatusPayload({ ...base, until: hours(-1).toISOString() })).toThrow(/future/);
    expect(() => buildAccountStatusPayload({ ...base, until: new Date(NOW.getTime() + 3 * 365 * 86_400_000).toISOString() })).toThrow(/2 years/);
    expect(() => buildAccountStatusPayload({ ...base, status: "active", until: hours(5).toISOString() })).toThrow(/only applies/);
  });
  it("status line in India time", () => {
    expect(accountStatusLine({ status: "paused", until: new Date("2026-12-02T12:30:00.000Z") })).toMatch(/^Paused until 2 Dec 2026, 6:00\s?pm$/i);
    expect(accountStatusLine({ status: "blocked", until: null })).toBe("Blocked");
    expect(accountStatusLine({ status: "active", until: hours(4) })).toBe("Active");
  });
  it("history merges private entries with audit events (deduped), newest first", () => {
    const at1 = hours(-48);
    const at2 = hours(-2);
    const rows = statusHistory(
      { reason: "x", history: [{ status: "paused", reason: "Spam reviews", messageToUser: "Stop", at: at2, by: "admin-1" }] },
      [
        { id: "e1", raw: { action: "account.status-changed", at: new Date(at2.getTime() + 2000), after: { status: "paused" }, reason: "Spam reviews", actorUid: "admin-1" } },
        { id: "e2", raw: { action: "account.status-changed", at: at1, after: { status: "blocked" }, reason: "Fraud", actorUid: "admin-2" } },
        { id: "e3", raw: { action: "profile.updated", at: at1 } },
      ],
    );
    expect(rows.map((r) => [r.status, r.source])).toEqual([["paused", "private"], ["blocked", "audit"]]);
    expect(rows[0]!.messageToUser).toBe("Stop");
  });
});

describe("organizer status message", () => {
  it("setMarketplaceEntityStatus carries messageToOrganizer for organizers only", () => {
    const base = { requestId: "status-12345678", entityType: "organizer" as const, entityId: "org-1", expectedVersion: 2, status: "paused" as const, reason: "KYC re-verification pending" };
    expect(buildEntityStatusPayload({ ...base, messageToOrganizer: "  Upload your PAN again  " })).toMatchObject({ messageToOrganizer: "Upload your PAN again" });
    expect("messageToOrganizer" in buildEntityStatusPayload({ ...base, messageToOrganizer: "  " })).toBe(false);
    expect(() => buildEntityStatusPayload({ ...base, messageToOrganizer: "x".repeat(501) })).toThrow(/500/);
    expect(() => buildEntityStatusPayload({ ...base, entityType: "arena", messageToOrganizer: "hi" })).toThrow(/organizer/);
  });
});
