/**
 * Failure modes, through the REAL exported callables (`.run`):
 *
 *  F1  a revoked staff member holding every permission is refused by EVERY
 *      staff-callable — fresh requests and replays of requestIds they used
 *      while active — and nothing changes
 *  F2  malformed payloads (wrong types, null, huge strings, deep nesting,
 *      extra / prototype-polluting fields) to every public callable come back
 *      as business errors (INVALID_INPUT for bad shapes), never INTERNAL
 *  F3  missing configuration: outside the emulator every secret read fails
 *      closed, and the paths built on them (codes, tickets, payments,
 *      webhooks) refuse instead of degrading
 */

import { getAuth } from "firebase-admin/auth";
import {
  adminCtx,
  approveCase,
  bookAndPay,
  call,
  catalog,
  codeOf,
  commerce,
  completeProfile,
  count,
  customer,
  db,
  decideCase,
  eventInput,
  experienceInput,
  fingerprint,
  getDoc,
  hireStaff,
  identity,
  organizerWorld,
  person,
  rid,
  setMarketplaceEntityStatus,
  sideEffectCounts,
  ticketPayloads,
  uniq,
  uniquePhone,
} from "./e2e-helpers";
import * as ch from "./commerce-helpers";
import { PERMISSIONS } from "../src/access/permissions";
import { setOperatorAccess } from "../src/auth/operatorAccess";
import { registerPushToken } from "../src/identity/push";
import { reissueOrganizerCode } from "../src/governance/callables";
import { SECRET_NAMES, hashCode, isEmulator, secret } from "../src/platform/security";
import { DomainError } from "../src/platform/errors";
import { getPaymentProvider, paymentSignature, verifyWebhookSignature, webhookSignature } from "../src/commerce/provider";
import { ticketSignature } from "../src/commerce/tickets";
import { handleRazorpayWebhook } from "../src/commerce/webhook";

jest.setTimeout(600_000);

type Json = Record<string, any>;
const BAD = /^(INTERNAL|UNEXPECTED)/;

/* ============================================================== F1 */

describe("F1 revoked staff", () => {
  test("every staff-callable refuses a revoked member (fresh + replayed requestIds) with no side effects", async () => {
    const W = await organizerWorld("rvk", [{}, {}]);
    const { owner, orgId, experienceId } = W;
    const [e1, e2] = W.eventIds as [string, string];
    const S = person("rvk-staff");
    const T1 = person("rvk-t1");
    const T2 = person("rvk-t2");
    for (const p of [S, T1, T2]) await completeProfile(p);
    await hireStaff(owner, orgId, S, [...PERMISSIONS], "all");
    await hireStaff(owner, orgId, T1, ["tickets.scan"], "all");
    await hireStaff(owner, orgId, T2, ["tickets.scan"], "all");
    const bk = await bookAndPay(await customer("rvk-c1"), e1, 2);
    const bk2 = await bookAndPay(await customer("rvk-c2"), e1, 2);
    const [p1] = await ticketPayloads(bk.ticketIds);
    const [q1] = await ticketPayloads(bk2.ticketIds);

    // ---- while ACTIVE, S can do every one of these (proves the grant suffices).
    const used: Record<string, [unknown, Json]> = {};
    const run = async (name: string, fn: unknown, payload: Json) => {
      used[name] = [fn, payload];
      return call(fn, payload, S.ctx);
    };
    const draft = await run("saveExperience", catalog.saveExperience, experienceInput(orgId));
    await run("submitExperience", catalog.submitExperience, { requestId: rid("sx"), orgId, experienceId: draft.experienceId });
    const ev3 = await run("saveEvent", catalog.saveEvent, eventInput(orgId, experienceId, owner.uid));
    const sub = await run("submitEvent", catalog.submitEvent, { requestId: rid("se"), orgId, eventId: ev3.eventId });
    await approveCase(String(sub.caseId));
    await run("publishEvent", catalog.publishEvent, { requestId: rid("pe"), orgId, eventId: ev3.eventId });
    await run("setEventResponsibility", catalog.setEventResponsibility, { requestId: rid("sr"), orgId, eventId: e2, primaryUid: owner.uid, staffUids: [] });
    await run("setEventPhase", catalog.setEventPhase, { requestId: rid("ph"), orgId, eventId: e2, phase: "booking-closed" });
    await run("cancelEvent", catalog.cancelEvent, { requestId: rid("ce"), orgId, eventId: ev3.eventId, reason: "Venue double-booked by mistake" });
    const inv = await run("inviteStaff", identity.inviteStaff, {
      requestId: rid("inv"), orgId, phone: uniquePhone(), title: "Helper", permissions: ["tickets.scan"], eventScope: "all",
    });
    await run("listStaff", identity.listStaff, { orgId });
    await run("updateStaff", identity.updateStaff, { requestId: rid("us"), orgId, uid: T1.uid, title: "Gate lead" });
    await run("revokeStaff", identity.revokeStaff, { requestId: rid("rs"), orgId, uid: T2.uid, reason: "Season over" });
    await run("reissueStaffCode", identity.reissueStaffCode, { requestId: rid("ri"), orgId, inviteId: inv.inviteId });
    await run("requestRefund", commerce.requestRefund, { requestId: rid("rr"), orgId, bookingId: bk.bookingId, amountMinor: 100, reason: "Late start" });
    await run("scanTicket", commerce.scanTicket, { requestId: rid("sc"), eventId: e1, payload: p1 });
    await run("checkInManually", commerce.checkInManually, { requestId: rid("mc"), eventId: e1, ticketId: bk.ticketIds[1], reason: "QR screen cracked badly" });
    await run("listEventAttendees", commerce.listEventAttendees, { orgId, eventId: e1 });

    // Fresh, valid targets the owner prepares for the post-revocation attempts.
    const d2 = await call(catalog.saveExperience, experienceInput(orgId), owner.ctx);
    const ev4 = await call(catalog.saveEvent, eventInput(orgId, experienceId, owner.uid), owner.ctx);
    const ev5 = await call(catalog.saveEvent, eventInput(orgId, experienceId, owner.uid), owner.ctx);
    const sub5 = await call(catalog.submitEvent, { requestId: rid("se"), orgId, eventId: ev5.eventId }, owner.ctx);
    await approveCase(String(sub5.caseId));

    // ---- revoke S.
    await call(identity.revokeStaff, { requestId: rid("rv"), orgId, uid: S.uid, reason: "Left the team" }, owner.ctx);

    const fresh: Record<string, [unknown, Json]> = {
      saveExperience: [catalog.saveExperience, experienceInput(orgId)],
      submitExperience: [catalog.submitExperience, { requestId: rid("sx"), orgId, experienceId: d2.experienceId }],
      saveEvent: [catalog.saveEvent, eventInput(orgId, experienceId, owner.uid)],
      submitEvent: [catalog.submitEvent, { requestId: rid("se"), orgId, eventId: ev4.eventId }],
      publishEvent: [catalog.publishEvent, { requestId: rid("pe"), orgId, eventId: ev5.eventId }],
      setEventResponsibility: [catalog.setEventResponsibility, { requestId: rid("sr"), orgId, eventId: e1, primaryUid: owner.uid, staffUids: [] }],
      setEventPhase: [catalog.setEventPhase, { requestId: rid("ph"), orgId, eventId: e1, phase: "booking-closed" }],
      cancelEvent: [catalog.cancelEvent, { requestId: rid("ce"), orgId, eventId: e2, reason: "Venue double-booked by mistake" }],
      inviteStaff: [identity.inviteStaff, { requestId: rid("inv"), orgId, phone: uniquePhone(), title: "Helper", permissions: ["tickets.scan"], eventScope: "all" }],
      listStaff: [identity.listStaff, { orgId }],
      updateStaff: [identity.updateStaff, { requestId: rid("us"), orgId, uid: T1.uid, title: "Gate boss" }],
      revokeStaff: [identity.revokeStaff, { requestId: rid("rs"), orgId, uid: T1.uid, reason: "Season over" }],
      reissueStaffCode: [identity.reissueStaffCode, { requestId: rid("ri"), orgId, inviteId: inv.inviteId }],
      requestRefund: [commerce.requestRefund, { requestId: rid("rr"), orgId, bookingId: bk2.bookingId, amountMinor: 100, reason: "Late start" }],
      scanTicket: [commerce.scanTicket, { requestId: rid("sc"), eventId: e1, payload: q1 }],
      checkInManually: [commerce.checkInManually, { requestId: rid("mc"), eventId: e1, ticketId: bk2.ticketIds[1], reason: "QR screen cracked badly" }],
      listEventAttendees: [commerce.listEventAttendees, { orgId, eventId: e1 }],
    };
    expect(Object.keys(fresh).sort()).toEqual(Object.keys(used).sort());

    const paths = [
      `events/${e1}`, `events/${e2}`, `events/${ev4.eventId}`, `events/${ev5.eventId}`, `experiences/${d2.experienceId}`,
      `memberships/${orgId}__${T1.uid}`, `memberships/${orgId}__${S.uid}`, `staffInvites/${inv.inviteId}`,
      `tickets/${bk2.ticketIds[0]}`, `tickets/${bk2.ticketIds[1]}`, `bookings/${bk2.bookingId}`,
    ];
    const state = async () => ({
      docs: await fingerprint(paths),
      counts: await sideEffectCounts(orgId),
      experiences: await count("experiences", "orgId", orgId),
      events: await count("events", "orgId", orgId),
      cases: await count("governanceCases", "orgId", orgId),
    });
    const before = await state();

    const got: Record<string, { fresh: string; replay: string }> = {};
    for (const name of Object.keys(fresh)) {
      const [fn, payload] = fresh[name]!;
      const [rfn, rpayload] = used[name]!;
      got[name] = { fresh: await codeOf(call(fn, payload, S.ctx)), replay: await codeOf(call(rfn, rpayload, S.ctx)) };
    }
    const expected = Object.fromEntries(Object.keys(fresh).map((n) => [n, { fresh: "NOT_PERMITTED", replay: "NOT_PERMITTED" }]));
    expect(got).toEqual(expected);
    expect(await state()).toEqual(before);
  });
});

/* ============================================================== F2 */

const HUGE = "x".repeat(100_000);
const deep = (n: number): Json => (n === 0 ? { leaf: 1 } : { a: deep(n - 1) });

/** Values substituted for one field at a time. */
const JUNK: Record<string, unknown> = {
  null: null,
  number: 12345,
  float: -1.5,
  bool: true,
  huge: HUGE,
  array: ["a", 1, null],
  object: { nested: { deep: [1, 2, 3] } },
  deep: deep(40),
  empty: "",
  nul: "ab\u0000cd",
  bidi: "ab\u202ecd",
  loneSurrogate: "ab\uD800cd",
};

/** Whole-payload junk. */
const PAYLOAD_JUNK: Record<string, unknown> = {
  undefined: undefined,
  null: null,
  string: "hello",
  huge: HUGE,
  number: 42,
  bool: false,
  array: [],
  arrayOfObject: [{ requestId: "abcdefgh1" }],
  deep: deep(60),
};

/**
 * Fields a callable legitimately accepts as absent/null (or clamps), so a
 * junk value there may pass validation and yield a business error or OK.
 * Everything else must answer INVALID_INPUT for every junk value.
 */
const LENIENT: Record<string, string[]> = {
  updateMyProfile: ["bio"],
  submitOrganizerApplication: ["contactEmail"],
  saveExperience: ["experienceId", "tagline", "highlights", "rules", "bring", "config", "format", "activity", "idRequired", "safety"],
  saveEvent: ["eventId", "staffUids", "currency"],
  setEventResponsibility: ["staffUids"],
  updateStaff: ["permissions", "eventScope", "title"],
  revokeStaff: ["uid", "inviteId"],
  reissueOrganizerCode: ["reason"],
  submitReview: ["comment"],
  reserveSeat: ["spots"],
  decideSettlement: ["payoutReference"],
  decideCase: ["note"],
  registerPushToken: [],
};

const ORG = "org-fuzz-0001";
const EVT = "evt-fuzz-0001";
const UID = "user-fuzz-0001";
const past = () => new Date(Date.now() - 3_600_000).toISOString();

describe("F2 malformed payloads", () => {
  test("every public callable answers bad shapes with INVALID_INPUT (or another business code), never INTERNAL", async () => {
    // A real auth user so setOperatorAccess' happy path is valid.
    db(); // initialises the default admin app
    const opTarget = uniq("op-target");
    await getAuth().createUser({ uid: opTarget, email: `${opTarget}@ops.test` });
    const owner = { auth: { uid: uniq("owner"), token: { roleId: "platform-owner", email_verified: true, email: "o@ops.test" } }, rawRequest: {} } as never;

    type Case = { fn: unknown; base: Json | null; ctx: "phone" | "admin" | "owner" };
    const r = () => rid("fz");
    const cases: Record<string, Case> = {
      myAccess: { fn: identity.myAccess, base: null, ctx: "phone" },
      updateMyProfile: { fn: identity.updateMyProfile, base: { displayName: "Asha K", birthDate: "1995-05-20", gender: "woman", bio: "Hi" }, ctx: "phone" },
      submitOrganizerApplication: {
        fn: identity.submitOrganizerApplication,
        base: { requestId: r(), kind: "business", displayName: "Deccan Club", legalName: "Deccan Club Pvt Ltd", city: "Hyderabad", categories: ["sports"], about: "Weekend sports for all levels.", contactEmail: "a@b.in" },
        ctx: "phone",
      },
      redeemOrganizerCode: { fn: identity.redeemOrganizerCode, base: { code: "ABCD-EFGH-JK" }, ctx: "phone" },
      inviteStaff: { fn: identity.inviteStaff, base: { requestId: r(), orgId: ORG, phone: "+919876543210", title: "Door team", permissions: ["tickets.scan"], eventScope: "all" }, ctx: "phone" },
      listStaff: { fn: identity.listStaff, base: { orgId: ORG }, ctx: "phone" },
      redeemStaffCode: { fn: identity.redeemStaffCode, base: { code: "ABCD2345JK" }, ctx: "phone" },
      updateStaff: { fn: identity.updateStaff, base: { requestId: r(), orgId: ORG, uid: UID, title: "Lead" }, ctx: "phone" },
      revokeStaff: { fn: identity.revokeStaff, base: { requestId: r(), orgId: ORG, uid: UID, reason: "Left team" }, ctx: "phone" },
      reissueStaffCode: { fn: identity.reissueStaffCode, base: { requestId: r(), orgId: ORG, inviteId: "invite-fuzz-0001" }, ctx: "phone" },
      registerPushToken: { fn: registerPushToken, base: { token: "t".repeat(40), platform: "android" }, ctx: "phone" },
      reissueOrganizerCode: { fn: reissueOrganizerCode, base: { requestId: r(), applicantUid: UID, reason: "Lost the code on the way" }, ctx: "admin" },
      saveExperience: { fn: catalog.saveExperience, base: experienceInput(ORG), ctx: "phone" },
      submitExperience: { fn: catalog.submitExperience, base: { requestId: r(), orgId: ORG, experienceId: "exp-fuzz-0001" }, ctx: "phone" },
      saveEvent: { fn: catalog.saveEvent, base: eventInput(ORG, "exp-fuzz-0001", UID), ctx: "phone" },
      submitEvent: { fn: catalog.submitEvent, base: { requestId: r(), orgId: ORG, eventId: EVT }, ctx: "phone" },
      publishEvent: { fn: catalog.publishEvent, base: { requestId: r(), orgId: ORG, eventId: EVT }, ctx: "phone" },
      setEventResponsibility: { fn: catalog.setEventResponsibility, base: { requestId: r(), orgId: ORG, eventId: EVT, primaryUid: UID, staffUids: [] }, ctx: "phone" },
      setEventPhase: { fn: catalog.setEventPhase, base: { requestId: r(), orgId: ORG, eventId: EVT, phase: "live" }, ctx: "phone" },
      cancelEvent: { fn: catalog.cancelEvent, base: { requestId: r(), orgId: ORG, eventId: EVT, reason: "Venue flooded badly" }, ctx: "phone" },
      adminCancelEvent: { fn: catalog.adminCancelEvent, base: { requestId: r(), eventId: EVT, reason: "Venue flooded badly" }, ctx: "admin" },
      submitReview: { fn: catalog.submitReview, base: { requestId: r(), eventId: EVT, rating: 5, comment: "Great fun" }, ctx: "phone" },
      moderateReview: { fn: catalog.moderateReview, base: { requestId: r(), reviewId: `${EVT}__${UID}`, status: "hidden", reason: "Spam here" }, ctx: "admin" },
      reserveSeat: { fn: commerce.reserveSeat, base: { requestId: r(), eventId: EVT, spots: 1, alias: "Asha" }, ctx: "phone" },
      createPaymentOrder: { fn: commerce.createPaymentOrder, base: { requestId: r(), bookingId: "bkg-fuzz-0001" }, ctx: "phone" },
      confirmPayment: { fn: commerce.confirmPayment, base: { paymentId: "pay-fuzz-0001", providerPaymentId: "pay_abc123", providerSignature: "a".repeat(64) }, ctx: "phone" },
      quoteCancellation: { fn: commerce.quoteCancellation, base: { bookingId: "bkg-fuzz-0001" }, ctx: "phone" },
      cancelBooking: { fn: commerce.cancelBooking, base: { requestId: r(), bookingId: "bkg-fuzz-0001" }, ctx: "phone" },
      requestRefund: { fn: commerce.requestRefund, base: { requestId: r(), orgId: ORG, bookingId: "bkg-fuzz-0001", amountMinor: 100, reason: "Late start" }, ctx: "phone" },
      scanTicket: { fn: commerce.scanTicket, base: { requestId: r(), eventId: EVT, payload: "PT1.abc.def" }, ctx: "phone" },
      checkInManually: { fn: commerce.checkInManually, base: { requestId: r(), eventId: EVT, ticketId: "tkt-fuzz-0001", reason: "QR screen cracked" }, ctx: "phone" },
      listEventAttendees: { fn: commerce.listEventAttendees, base: { orgId: ORG, eventId: EVT }, ctx: "phone" },
      decideRefund: { fn: commerce.decideRefund, base: { requestId: r(), refundId: "req_fuzz_0001", decision: "approve", note: "ok fine" }, ctx: "admin" },
      buildSettlement: { fn: commerce.buildSettlement, base: { requestId: r(), orgId: ORG, periodEnd: past() }, ctx: "admin" },
      decideSettlement: { fn: commerce.decideSettlement, base: { requestId: r(), settlementId: "stl_fuzz_0001", action: "approve", note: "ok", payoutReference: "UTR1" }, ctx: "admin" },
      proposeCommercialAgreement: { fn: commerce.proposeCommercialAgreement, base: { requestId: r(), orgId: ORG, commissionBps: 1200, payoutCadence: "weekly", note: "ok fine" }, ctx: "admin" },
      decideCommercialAgreement: { fn: commerce.decideCommercialAgreement, base: { requestId: r(), agreementId: "ca-fuzz-0001", action: "approve", note: "ok fine" }, ctx: "admin" },
      decideCase: { fn: decideCase, base: { requestId: r(), caseId: "case-fuzz-0001", expectedVersion: 0, outcome: "approved", note: "" }, ctx: "admin" },
      setMarketplaceEntityStatus: {
        fn: setMarketplaceEntityStatus,
        base: { requestId: r(), entityType: "organizer", entityId: ORG, expectedVersion: 0, status: "paused", reason: "Many complaints this week" },
        ctx: "admin",
      },
      setOperatorAccess: { fn: setOperatorAccess, base: { uid: opTarget, roleId: "auditor", status: "active", reason: "Needs audit access now" }, ctx: "owner" },
    };

    const failures: string[] = [];
    const notInvalid: string[] = [];
    const tally: Record<string, number> = {};
    for (const [name, c] of Object.entries(cases)) {
      // A fresh identity per attempt: several services rate-limit per uid
      // BEFORE validating, which would otherwise mask the validation answer.
      const freshCtx = () => (c.ctx === "phone" ? person("fz").ctx : c.ctx === "admin" ? adminCtx(uniq("fz-admin")) : owner);
      const attempt = async (label: string, payload: unknown, strict: boolean, mutated?: string) => {
        // Fresh requestId per attempt so a passing mutation never replays another.
        const data = payload && typeof payload === "object" && !Array.isArray(payload) && "requestId" in (payload as Json) && mutated !== "requestId"
          ? { ...(payload as Json), requestId: r() }
          : payload;
        const code = await codeOf(call(c.fn, data, freshCtx()));
        tally[code] = (tally[code] ?? 0) + 1;
        if (BAD.test(code)) failures.push(`${name} ${label}: ${code}`);
        else if (strict && code !== "INVALID_INPUT") notInvalid.push(`${name} ${label}: ${code}`);
      };

      // Whole-payload junk.
      for (const [k, v] of Object.entries(PAYLOAD_JUNK)) await attempt(`payload=${k}`, v, c.base !== null);
      if (!c.base) continue;
      // Extra / prototype-polluting fields: never INTERNAL, never pollution.
      await attempt("extra-fields", { ...c.base, extra: HUGE, $where: "1==1", nested: deep(30) }, false);
      await attempt("proto", JSON.parse(`{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},${JSON.stringify(c.base).slice(1)}`), false);
      // One field at a time, including one level into nested objects.
      const lenient = new Set(LENIENT[name] ?? []);
      for (const key of Object.keys(c.base)) {
        const v = c.base[key];
        const kind = (x: unknown) => (x === null ? "null" : Array.isArray(x) ? "array" : typeof x);
        for (const [jk, jv] of Object.entries(JUNK)) {
          // Strict = the junk is the wrong JSON type for this field, or a string
          // outside any sane length. Same-type junk (e.g. 12345 for a number,
          // control characters in a string) only has to avoid INTERNAL.
          const wrong = kind(jv) !== kind(v) || jk === "huge" || (jk === "empty" && typeof v === "string" && v !== "");
          await attempt(`${key}=${jk}`, { ...c.base, [key]: jv }, wrong && !lenient.has(key), key);
        }
        await attempt(`${key}=missing`, Object.fromEntries(Object.entries(c.base).filter(([k]) => k !== key)), !lenient.has(key), key);
        if (v && typeof v === "object" && !Array.isArray(v)) {
          for (const sub of Object.keys(v)) {
            for (const [jk, jv] of Object.entries(JUNK)) {
              await attempt(`${key}.${sub}=${jk}`, { ...c.base, [key]: { ...v, [sub]: jv } }, false, key);
            }
          }
        }
      }
    }
    expect(({} as Json).polluted).toBeUndefined();
    // eslint-disable-next-line no-console
    if (notInvalid.length) console.log(`non-INVALID_INPUT answers to bad shapes on strict fields:\n${notInvalid.join("\n")}`);
    expect(failures).toEqual([]);
    expect(notInvalid).toEqual([]);
    expect(Object.keys(tally)).toContain("INVALID_INPUT");
  });

  /**
   * Formerly a known bug: `str()` (platform/callable.ts) and `text()`
   * (governance/model.ts) accepted strings that are not well-formed Unicode,
   * so Firestore later threw and the caller got INTERNAL. Validation now
   * rejects lone surrogates as INVALID_INPUT.
   */
  test("strings with lone UTF-16 surrogates are rejected as INVALID_INPUT", async () => {
    const who = person("fz-surrogate");
    const profile = await codeOf(call(identity.updateMyProfile, { displayName: "Asha K", birthDate: "1995-05-20", gender: "woman", bio: "ab\uD800cd" }, who.ctx));
    const refund = await codeOf(call(commerce.decideRefund, { requestId: rid("fz"), refundId: "ab\uD800cd", decision: "approve", note: "ok fine" }, adminCtx(uniq("fz-admin"))));
    expect({ profile, refund }).toEqual({ profile: "INVALID_INPUT", refund: "INVALID_INPUT" });
  });
});

/* ============================================================== F3 */

describe("F3 missing configuration fails closed", () => {
  const SECRET_VARS = Object.values(SECRET_NAMES);
  const KEYS = ["FUNCTIONS_EMULATOR", "K_SERVICE", "FUNCTION_TARGET", ...SECRET_VARS];
  let saved: Record<string, string | undefined> = {};

  /** Looks like a deployed function with no secrets bound (and a stray emulator host). */
  function productionWithoutSecrets() {
    delete process.env.FUNCTIONS_EMULATOR;
    process.env.K_SERVICE = "reserveseat";
    for (const n of SECRET_VARS) delete process.env[n];
  }

  beforeEach(() => {
    saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    jest.restoreAllMocks();
    // The suite keeps running in emulator mode.
    expect(isEmulator()).toBe(true);
  });

  const expectInternal = (fn: () => unknown, name: string) => {
    let err: unknown;
    try {
      fn();
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(DomainError);
    const d = err as DomainError;
    expect(d.code).toBe("INTERNAL");
    expect(d.detail).toEqual({ missingSecret: name });
    // The operator-facing payload never names the secret.
    expect(JSON.stringify(d.toOperatorPayload())).not.toContain(name);
  };

  test("secret() throws for every secret, even with a stray FIRESTORE_EMULATOR_HOST, and for empty values", () => {
    productionWithoutSecrets();
    expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy();
    expect(isEmulator()).toBe(false);
    for (const n of SECRET_VARS) expectInternal(() => secret(n), n);
    for (const n of SECRET_VARS) {
      process.env[n] = "";
      expectInternal(() => secret(n), n);
    }
    // FUNCTION_TARGET alone also marks a deployment.
    delete process.env.K_SERVICE;
    process.env.FUNCTION_TARGET = "reserveSeat";
    expect(isEmulator()).toBe(false);
    expectInternal(() => secret(SECRET_NAMES.ticketKey), SECRET_NAMES.ticketKey);
    // A bound secret is returned verbatim; no dev fallback leaks in.
    process.env[SECRET_NAMES.ticketKey] = "real-key";
    expect(secret(SECRET_NAMES.ticketKey)).toBe("real-key");
  });

  test("code hashing, ticket signing, payment and webhook signatures refuse instead of using a guessable key", () => {
    productionWithoutSecrets();
    expectInternal(() => hashCode("staff", "ABCD2345JK"), SECRET_NAMES.codePepper);
    expectInternal(() => ticketSignature("t1", "e1", "b1"), SECRET_NAMES.ticketKey);
    expectInternal(() => paymentSignature("order_1", "pay_1"), SECRET_NAMES.razorpayKeySecret);
    expectInternal(() => webhookSignature(Buffer.from("{}")), SECRET_NAMES.razorpayWebhookSecret);
    expectInternal(() => verifyWebhookSignature(Buffer.from("{}"), "a".repeat(64)), SECRET_NAMES.razorpayWebhookSecret);
  });

  test("the real payment provider is selected and refuses before any network call", async () => {
    productionWithoutSecrets();
    const fetchSpy = jest.spyOn(globalThis, "fetch");
    const p = getPaymentProvider();
    expect(p.constructor.name).toBe("RazorpayProvider");
    await expect(p.createOrder({ amountMinor: 100, currency: "INR", receipt: "rcpt_1", notes: {} } as never)).rejects.toMatchObject({ code: "INTERNAL" });
    await expect(p.refund({ providerPaymentId: "pay_1", amountMinor: 100, refundId: "r1", notes: {} } as never)).rejects.toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("the webhook never accepts (or records) an event it can't verify", async () => {
    productionWithoutSecrets();
    const eventId = uniq("evt_rzp");
    const raw = Buffer.from(JSON.stringify({ event: "payment.captured", payload: {} }));
    const res = { statusCode: 200, status(c: number) { res.statusCode = c; return res; }, json() { return res; }, send() { return res; } };
    let threw = false;
    try {
      await handleRazorpayWebhook({ method: "POST", rawBody: raw, body: {}, headers: { "x-razorpay-signature": "a".repeat(64), "x-razorpay-event-id": eventId } }, res);
    } catch {
      threw = true; // surfaces as a 500 → Razorpay retries once the secret is bound
    }
    expect(threw || res.statusCode >= 400).toBe(true);
    expect(await getDoc(`paymentEvents/${eventId}`)).toBeUndefined();
  });

  test("callables that need a secret answer INTERNAL 'not configured' and write nothing", async () => {
    // Seed while still in emulator mode.
    const { eventId } = await ch.world({ priceMinor: 0, capacity: 4 });
    const cust = await ch.newCustomer();
    const occBefore = (await getDoc<Json>(`events/${eventId}`))!.occupancy;
    const staffPerson = person("cfg-staff");

    productionWithoutSecrets();
    // A free booking must sign tickets → the whole transaction aborts.
    const reserveErr = await ch.callErr(commerce.reserveSeat, { requestId: rid("rs"), eventId, spots: 2, alias: "Asha" }, ch.phoneCtx(cust));
    expect(reserveErr.code).toBe("INTERNAL");
    expect(reserveErr.message).toBe("This service isn't configured yet.");
    expect(reserveErr.message).not.toMatch(/TICKET_SIGNING_KEY|secret/i);
    // Staff code redemption must hash with the pepper.
    const redeemErr = await ch.callErr(identity.redeemStaffCode, { code: "ABCD2345" }, staffPerson.ctx);
    expect(redeemErr.code).toBe("INTERNAL");
    expect(redeemErr.message).not.toMatch(/CODE_PEPPER/);

    // Back in emulator mode: nothing was written.
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    const bookings = await db().collection("bookings").where("eventId", "==", eventId).get();
    expect(bookings.size).toBe(0);
    expect((await getDoc<Json>(`events/${eventId}`))!.occupancy).toEqual(occBefore);
    expect(await count("tickets", "eventId", eventId)).toBe(0);
  });
});
