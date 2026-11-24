/**
 * Organizer-set cancellation rules, pure (docs/CANCELLATION_POLICY_CONTRACT.md):
 * validation, the three old presets, exact hour edges, refusals with facts,
 * plain words and reviewer flags. No emulator needed.
 */

import { Timestamp } from "firebase-admin/firestore";
import {
  cancelVerdict, cancellationFlags, cancellationLines, cancellationSummary, hoursLabel, parseCancellationRules,
  presetRules, refundPercentFor, resolveCancellation, type CancellationRules,
} from "../src/commerce/cancellation";
import { cancellationPercent } from "../src/commerce/policy";
import { quoteFor } from "../src/commerce/refunds";
import { parseCancellationInput } from "../src/catalog/experiences";
import type { BookingDoc, EventDoc } from "../src/bookings/reserveSeat";
import type { PaymentDoc } from "../src/commerce/types";

const H = 3_600_000;
const tiers = (...t: Array<[number, number]>) => t.map(([hoursBefore, refundPercent]) => ({ hoursBefore, refundPercent }));
const rules = (over: Omit<Partial<CancellationRules>, "tiers"> & { tiers?: unknown } = {}) => ({ allowed: true, cutoffHours: 0, tiers: tiers([48, 100], [24, 50]), preset: "custom", ...over });
const problem = (raw: unknown) => {
  const p = parseCancellationRules(raw);
  if (p.ok) throw new Error(`expected a problem, got ${JSON.stringify(p.rules)}`);
  return p;
};
const ok = (raw: unknown) => {
  const p = parseCancellationRules(raw);
  if (!p.ok) throw new Error(p.message);
  return p.rules;
};

/** The pre-change cancellationPercent, verbatim, to prove the presets still answer the same. */
function oldCancellationPercent(policy: string | undefined, hoursBefore: number): number {
  if (hoursBefore < 0) return 0;
  switch (policy) {
    case "flexible":
      return hoursBefore >= 24 ? 100 : 50;
    case "moderate":
      return hoursBefore >= 72 ? 100 : hoursBefore >= 24 ? 50 : 0;
    case "strict":
      return hoursBefore >= 168 ? 100 : 0;
    default:
      return hoursBefore >= 168 ? 100 : 0;
  }
}

describe("validation: each rule, with a plain message", () => {
  test.each([
    ["not an object", "flexible", /Set the cancellation rules/],
    ["allowed missing", { cutoffHours: 0, tiers: tiers([24, 100]) }, /Choose whether customers can cancel/],
    ["allowed not a boolean", { allowed: "yes", tiers: tiers([24, 100]) }, /Choose whether customers can cancel/],
    ["unknown preset", rules({ preset: "lenient" as never }), /preset isn't supported/],
    ["cut-off negative", rules({ cutoffHours: -1 }), /cut-off must be a whole number of hours from 0 to 720/],
    ["cut-off over 720", rules({ cutoffHours: 721 }), /from 0 to 720/],
    ["cut-off fractional", rules({ cutoffHours: 1.5 }), /from 0 to 720/],
    ["tiers not a list", rules({ tiers: { hoursBefore: 24, refundPercent: 100 } }), /Refund tiers must be a list/],
    ["no tiers", rules({ tiers: [] }), /Add at least one refund tier/],
    ["five tiers", rules({ tiers: tiers([96, 100], [72, 80], [48, 60], [24, 40], [0, 20]) }), /at most 4 refund tiers/],
    ["tier not an object", rules({ tiers: [5] }), /Refund tier 1 is incomplete/],
    ["hoursBefore over 720", rules({ tiers: tiers([721, 100]) }), /Refund tier 1: the hours before the start must be a whole number from 0 to 720/],
    ["hoursBefore negative", rules({ tiers: tiers([24, 100], [-1, 50]) }), /Refund tier 2: the hours before/],
    ["hoursBefore fractional", rules({ tiers: tiers([24.5, 100]) }), /Refund tier 1: the hours before/],
    ["refundPercent over 100", rules({ tiers: tiers([24, 101]) }), /Refund tier 1: the refund must be a whole percent from 0 to 100/],
    ["refundPercent negative", rules({ tiers: tiers([24, -5]) }), /whole percent from 0 to 100/],
    ["refundPercent fractional", rules({ tiers: tiers([24, 33.3]) }), /whole percent/],
    ["tiers going later to earlier", rules({ tiers: tiers([24, 100], [48, 50]) }), /^Refund tiers must go from earliest to latest\.$/],
    ["two tiers at the same hour", rules({ tiers: tiers([24, 100], [24, 50]) }), /can't start at the same time/],
    ["more back closer to the start", rules({ tiers: tiers([48, 50], [24, 100]) }), /can't give back more than an earlier one/],
  ])("%s", (_name, raw, message) => {
    expect(problem(raw).message).toMatch(message);
  });

  test("a problem in a tier names it (tier number in the facts)", () => {
    expect(problem(rules({ tiers: tiers([48, 100], [72, 50]) })).tier).toBe(2);
    expect(() => parseCancellationInput({ cancellation: rules({ tiers: tiers([48, 100], [24, 120]) }) })).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT", facts: { field: "cancellation", tier: 2 } })
    );
  });

  test("limits are inclusive: cut-off 720, tier at 720 and at 0, 0% and 100%, four tiers", () => {
    expect(ok(rules({ cutoffHours: 720, tiers: tiers([720, 100]) }))).toMatchObject({ cutoffHours: 720 });
    expect(ok(rules({ tiers: tiers([720, 100], [72, 50], [24, 10], [0, 0]) })).tiers).toHaveLength(4);
    expect(ok(rules({ tiers: tiers([0, 0]) })).tiers).toEqual(tiers([0, 0]));
    // Equal percents in a row are allowed (non-increasing).
    expect(ok(rules({ tiers: tiers([48, 100], [24, 100]) })).tiers).toHaveLength(2);
  });

  test("unknown keys are dropped; a missing cut-off means until the start", () => {
    const r = ok({ allowed: true, tiers: [{ hoursBefore: 24, refundPercent: 100, note: "x" }], extra: 1 });
    expect(r).toEqual({ allowed: true, cutoffHours: 0, tiers: tiers([24, 100]), preset: "custom" });
  });

  test("no cancellations: the cut-off and tiers don't apply and are stored empty", () => {
    expect(ok({ allowed: false, cutoffHours: 999, tiers: "junk", preset: "none" })).toEqual({ allowed: false, cutoffHours: 0, tiers: [], preset: "none" });
    expect(ok({ allowed: false })).toEqual(presetRules("none"));
  });

  test("preset is display-only: a changed preset becomes custom; a missing one is worked out", () => {
    expect(ok({ ...presetRules("flexible") }).preset).toBe("flexible");
    expect(ok({ ...presetRules("flexible"), cutoffHours: 2 }).preset).toBe("custom");
    expect(ok({ allowed: true, cutoffHours: 0, tiers: tiers([72, 100], [24, 50]) }).preset).toBe("moderate");
    expect(ok({ allowed: true, cutoffHours: 0, tiers: tiers([168, 100]), preset: "custom" }).preset).toBe("custom");
    expect(ok({ allowed: false, preset: "strict" }).preset).toBe("custom");
  });

  test("an older app's one-word preset is read as its rules; custom needs the rules", () => {
    for (const name of ["flexible", "moderate", "strict", "none"] as const) {
      expect(parseCancellationInput({ cancellationPolicy: name })).toEqual(presetRules(name));
    }
    expect(() => parseCancellationInput({ cancellationPolicy: "custom" })).toThrow(/Set the custom cancellation rules/);
    expect(() => parseCancellationInput({ cancellationPolicy: "lenient" })).toThrow(/Cancellation policy is not supported/);
    expect(() => parseCancellationInput({})).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
    // The object wins over the string when both are sent.
    expect(parseCancellationInput({ cancellationPolicy: "strict", cancellation: presetRules("none") }).allowed).toBe(false);
  });
});

describe("presets: old data quotes exactly as before", () => {
  test("the presets are what the contract says", () => {
    expect(presetRules("flexible")).toEqual({ allowed: true, cutoffHours: 0, tiers: tiers([24, 100], [0, 50]), preset: "flexible" });
    expect(presetRules("moderate")).toEqual({ allowed: true, cutoffHours: 0, tiers: tiers([72, 100], [24, 50]), preset: "moderate" });
    expect(presetRules("strict")).toEqual({ allowed: true, cutoffHours: 0, tiers: tiers([168, 100]), preset: "strict" });
    expect(presetRules("none")).toEqual({ allowed: false, cutoffHours: 0, tiers: [], preset: "none" });
  });

  test("cancellationPercent(string) matches the old switch at every quarter hour from -2 h to 9 days, and for unknown policies", () => {
    for (const policy of ["flexible", "moderate", "strict", undefined, "lenient", ""]) {
      for (let q = -8; q <= 9 * 24 * 4; q++) {
        const h = q / 4;
        expect([policy, h, cancellationPercent(policy, h)]).toEqual([policy, h, oldCancellationPercent(policy, h)]);
      }
      // ...and a millisecond either side of each boundary.
      for (const edge of [0, 24, 72, 168]) {
        for (const h of [edge - 1 / H, edge, edge + 1 / H]) expect(cancellationPercent(policy, h)).toBe(oldCancellationPercent(policy, h));
      }
    }
  });

  test("a document with only the string reads as that preset; unknown or missing reads as strict, label kept", () => {
    expect(resolveCancellation({ cancellationPolicy: "moderate" })).toMatchObject({ source: "preset", label: "moderate", rules: presetRules("moderate") });
    expect(resolveCancellation({ cancellationPolicy: "lenient" })).toMatchObject({ source: "fallback", label: "lenient", rules: presetRules("strict") });
    expect(resolveCancellation({})).toMatchObject({ source: "fallback", label: "strict" });
    expect(resolveCancellation(undefined)).toMatchObject({ source: "fallback", label: "strict" });
    // A malformed stored object falls back to the string.
    expect(resolveCancellation({ cancellation: { allowed: "?" }, cancellationPolicy: "flexible" })).toMatchObject({ source: "preset", label: "flexible" });
    expect(resolveCancellation({ cancellation: rules(), cancellationPolicy: "custom" })).toMatchObject({ source: "rules", label: "custom" });
  });
});

describe("custom tiers at exact hour edges", () => {
  const r = ok(rules({ cutoffHours: 12, tiers: tiers([72, 100], [48, 75], [24, 25]) }));

  test.each([
    [100, 100], [72, 100], [72 - 1 / H, 75], [48, 75], [48 - 1 / H, 25], [24, 25], [24 - 1 / H, 0], [12, 0],
  ])("%s h left → %s%%", (hours, pct) => {
    expect(cancelVerdict(r, hours)).toEqual({ ok: true, percent: pct });
  });

  test("inside the cut-off (one millisecond under 12 h) → refused with the cut-off", () => {
    expect(cancelVerdict(r, 12 - 1 / H)).toEqual({ ok: false, reason: "cutoff", cutoffHours: 12 });
    expect(cancelVerdict(r, 0.5)).toEqual({ ok: false, reason: "cutoff", cutoffHours: 12 });
  });

  test("not allowed → refused at any distance", () => {
    expect(cancelVerdict(presetRules("none"), 700)).toEqual({ ok: false, reason: "not-allowed" });
  });

  test("a tier at 0 covers until the start; none matching → 0%", () => {
    expect(refundPercentFor(presetRules("flexible"), 0)).toBe(50);
    expect(refundPercentFor({ tiers: tiers([24, 100]) }, 23.999)).toBe(0);
    expect(refundPercentFor({ tiers: tiers([24, 100]) }, -0.1)).toBe(0);
  });
});

describe("quoteFor: refusals with facts, frozen rules, free bookings", () => {
  const NOW = Date.UTC(2026, 10, 24, 6, 30);
  const event = (over: Partial<EventDoc> & Record<string, unknown> = {}) =>
    ({ status: "published", startsAt: Timestamp.fromMillis(NOW + 48 * H), capacity: {}, cancellationPolicy: "flexible", ...over }) as unknown as EventDoc;
  const booking = (over: Record<string, unknown> = {}) =>
    ({ id: "b1", status: "confirmed", amountMinor: 100_000, paymentId: "p1", ...over }) as unknown as BookingDoc;
  const paid = { status: "captured", amountMinor: 100_000, refundedMinor: 0 } as unknown as PaymentDoc;
  const at = (hoursLeft: number) => NOW + 48 * H - hoursLeft * H;
  const refusal = (fn: () => unknown) => {
    try {
      fn();
    } catch (e) {
      const d = e as { code: string; operatorMessage: string; facts?: unknown; nextStep?: string };
      return { code: d.code, message: d.operatorMessage, facts: d.facts, nextStep: d.nextStep };
    }
    throw new Error("expected a refusal");
  };

  test("an old booking (no frozen rules) on an old event (string only) quotes exactly as before", () => {
    for (const [policy, hours, pct] of [["flexible", 24, 100], ["flexible", 23, 50], ["moderate", 47, 50], ["moderate", 23, 0], ["strict", 47, 0]] as const) {
      const q = quoteFor(booking(), event({ cancellationPolicy: policy, startsAt: Timestamp.fromMillis(NOW + hours * H) }), paid, NOW);
      expect(q).toEqual({ percent: pct, amountMinor: pct * 1000, reason: pct === 0 ? `outside-policy:${policy}` : `policy:${policy}` });
    }
    // Unknown string: strict math, the old label in the reason.
    expect(quoteFor(booking(), event({ cancellationPolicy: "lenient" }), paid, NOW)).toEqual({ percent: 0, amountMinor: 0, reason: "outside-policy:lenient" });
    expect(quoteFor(booking(), event({ cancellationPolicy: undefined }), paid, NOW).reason).toBe("outside-policy:strict");
  });

  test("the rules frozen on the booking win over the event's (an organizer edit changes new bookings only)", () => {
    const frozen = ok(rules({ tiers: tiers([24, 100]) }));
    const ev = event({ cancellation: presetRules("none"), cancellationPolicy: "none" });
    expect(quoteFor(booking({ cancellation: frozen }), ev, paid, NOW)).toEqual({ percent: 100, amountMinor: 100_000, reason: "policy:custom" });
    // A new booking froze the event's rules: refused.
    expect(refusal(() => quoteFor(booking({ cancellation: presetRules("none") }), ev, paid, NOW)).facts).toEqual({ reason: "not-allowed" });
    // An old booking (nothing frozen) reads the event's.
    expect(refusal(() => quoteFor(booking(), ev, paid, NOW)).facts).toEqual({ reason: "not-allowed" });
  });

  test("not allowed → PRECONDITION, the contract's words, facts.reason not-allowed", () => {
    expect(refusal(() => quoteFor(booking({ cancellation: presetRules("none") }), event(), paid, NOW))).toEqual({
      code: "PRECONDITION",
      message: "This booking can't be cancelled — the organizer doesn't allow cancellations.",
      facts: { reason: "not-allowed" },
      nextStep: "If something has gone wrong, contact PULSE support.",
    });
  });

  test("inside the cut-off → PRECONDITION with cutoffHours; exactly at the cut-off it's still open", () => {
    const b = booking({ cancellation: ok(rules({ cutoffHours: 24, tiers: tiers([48, 100], [0, 50]) })) });
    expect(quoteFor(b, event(), paid, at(24))).toEqual({ percent: 50, amountMinor: 50_000, reason: "policy:custom" });
    expect(quoteFor(b, event(), paid, at(48))).toEqual({ percent: 100, amountMinor: 100_000, reason: "policy:custom" });
    expect(refusal(() => quoteFor(b, event(), paid, at(24) + 1))).toMatchObject({
      code: "PRECONDITION",
      message: "Cancelling closed 24 hours before the start.",
      facts: { reason: "cutoff", cutoffHours: 24 },
    });
    const week = booking({ cancellation: ok(rules({ cutoffHours: 168, tiers: tiers([336, 100], [168, 50]) })) });
    expect(refusal(() => quoteFor(week, event(), paid, NOW)).message).toBe("Cancelling closed 7 days before the start.");
  });

  test("free bookings: no money, but allowed and the cut-off still decide", () => {
    const free = (c: CancellationRules) => booking({ amountMinor: 0, paymentId: null, cancellation: c });
    expect(quoteFor(free(presetRules("flexible")), event(), null, NOW)).toEqual({ percent: 0, amountMinor: 0, reason: "free-booking" });
    expect(refusal(() => quoteFor(free(presetRules("none")), event(), null, NOW)).facts).toEqual({ reason: "not-allowed" });
    expect(refusal(() => quoteFor(free(ok(rules({ cutoffHours: 72 }))), event(), null, NOW)).facts).toEqual({ reason: "cutoff", cutoffHours: 72 });
  });

  test("an unpaid hold is always released; a started event is never quoted", () => {
    expect(quoteFor(booking({ status: "held", cancellation: presetRules("none") }), event(), null, NOW)).toMatchObject({ reason: "hold-release" });
    expect(quoteFor(booking({ cancellation: presetRules("none") }), event({ startsAt: Timestamp.fromMillis(NOW) }), paid, NOW)).toMatchObject({ reason: "event-started" });
  });

  test("a partly refunded payment refunds the percent of what's left, rounded down", () => {
    const part = { status: "partially-refunded", amountMinor: 99_999, refundedMinor: 1 } as unknown as PaymentDoc;
    const b = booking({ cancellation: ok(rules({ tiers: tiers([24, 33]) })) });
    expect(quoteFor(b, event(), part, NOW)).toEqual({ percent: 33, amountMinor: Math.floor((99_998 * 33) / 100), reason: "policy:custom" });
  });
});

describe("plain words", () => {
  test.each([
    ["flexible", "Full refund if you cancel 24+ hours before. 50% back in the last 24 hours."],
    ["moderate", "Full refund if you cancel 3+ days before. 50% back from 3 days to 24 hours. No refund in the last 24 hours."],
    ["strict", "Full refund if you cancel 7+ days before. No refund in the last 7 days."],
    ["none", "No cancellations. Once booked, a spot can't be cancelled."],
  ] as const)("%s", (name, text) => {
    expect(cancellationSummary(presetRules(name))).toBe(text);
  });

  test("the contract's example", () => {
    expect(cancellationSummary(ok(rules({ cutoffHours: 24, tiers: tiers([48, 100], [24, 50]) })))).toBe(
      "Full refund if you cancel 48+ hours before. 50% back from 48 to 24 hours. No cancelling in the last 24 hours."
    );
  });

  test("tiers inside the cut-off are clipped; equal neighbours merge; all-zero says so", () => {
    expect(cancellationLines(ok(rules({ cutoffHours: 48, tiers: tiers([24, 100]) })))).toEqual([
      "Full refund if you cancel 48+ hours before.",
      "No cancelling in the last 48 hours.",
    ]);
    expect(cancellationLines(ok(rules({ tiers: tiers([72, 100], [48, 100], [0, 50]) })))).toEqual([
      "Full refund if you cancel 48+ hours before.",
      "50% back in the last 48 hours.",
    ]);
    expect(cancellationSummary(ok(rules({ tiers: tiers([0, 100]) })))).toBe("Full refund if you cancel any time before the start.");
    expect(cancellationSummary(ok(rules({ tiers: tiers([0, 0]) })))).toBe("You can cancel any time before the start, but there's no refund.");
    expect(cancellationSummary(ok(rules({ cutoffHours: 6, tiers: tiers([24, 0]) })))).toBe("You can cancel until 6 hours before the start, but there's no refund.");
    expect(cancellationSummary(ok(rules({ cutoffHours: 2, tiers: tiers([168, 100], [48, 50]) })))).toBe(
      "Full refund if you cancel 7+ days before. 50% back from 7 days to 48 hours. No refund from 48 to 2 hours. No cancelling in the last 2 hours."
    );
  });

  test("hours read as days from 72 h in whole days", () => {
    expect([1, 2, 24, 48, 72, 96, 100, 168, 720].map(hoursLabel)).toEqual([
      "1 hour", "2 hours", "24 hours", "48 hours", "3 days", "4 days", "100 hours", "7 days", "30 days",
    ]);
  });
});

describe("reviewer flags", () => {
  test("No cancellations and cut-offs over 48 h are flagged; 48 h is not", () => {
    expect(cancellationFlags(presetRules("none"))).toEqual([{ key: "no-cancellations", label: "No cancellations" }]);
    expect(cancellationFlags(ok(rules({ cutoffHours: 72 })))).toEqual([{ key: "long-cutoff", label: "Cancelling closes 3 days before the start" }]);
    expect(cancellationFlags(ok(rules({ cutoffHours: 49 })))[0]!.key).toBe("long-cutoff");
    expect(cancellationFlags(ok(rules({ cutoffHours: 48 })))).toEqual([]);
    for (const p of ["flexible", "moderate", "strict"] as const) expect(cancellationFlags(presetRules(p))).toEqual([]);
  });
});
