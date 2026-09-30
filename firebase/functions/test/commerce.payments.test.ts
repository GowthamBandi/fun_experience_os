/**
 * Payments: orders, verified confirmation, webhook, late capture, risk.
 */

import {
  book,
  call,
  callCode,
  callErr,
  capturedEvent,
  commerce,
  db,
  deliverWebhook,
  expectBalanced,
  fakePayId,
  getDoc,
  lapseHold,
  ledgerWhere,
  newCustomer,
  order,
  phoneCtx,
  refundEvent,
  reserve,
  rid,
  sum,
  world,
} from "./commerce-helpers";
import { paymentSignature, webhookSignature, providerIsEmulated, getPaymentProvider, RazorpayProvider } from "../src/commerce/provider";
import { releaseExpiredHolds } from "../src/commerce/holds";
import { settleCapturedPayment } from "../src/commerce/payments";

jest.setTimeout(120_000);

type Booking = { status: string; ticketIds: string[]; paymentId: string | null; spots: number };
type Payment = { status: string; amountMinor: number; commissionMinor: number; commissionBps: number; refundedMinor: number; providerPaymentId: string };
type Event = { occupancy: { activeReservationHolds: number; confirmedPaidBookings: number } };

describe("provider selection", () => {
  test("the emulator provider is used only because FUNCTIONS_EMULATOR=true", () => {
    expect(providerIsEmulated()).toBe(true);
    expect(getPaymentProvider().mode).toBe("emulator");
    const saved = process.env.FUNCTIONS_EMULATOR;
    process.env.FUNCTIONS_EMULATOR = "false";
    try {
      // FIRESTORE_EMULATOR_HOST is still set, yet the real provider is chosen.
      expect(getPaymentProvider()).toBeInstanceOf(RazorpayProvider);
    } finally {
      process.env.FUNCTIONS_EMULATOR = saved;
    }
  });
});

describe("createPaymentOrder", () => {
  test("idempotent per booking; amount comes from the booking, never the client", async () => {
    const { eventId } = await world({ priceMinor: 45_000 });
    const uid = await newCustomer();
    const r = await reserve(uid, eventId, 2);
    const a = await call<{ paymentId: string; providerOrderId: string; amountMinor: number }>(
      commerce.createPaymentOrder,
      { requestId: rid(), bookingId: r.bookingId, amountMinor: 1 },
      phoneCtx(uid)
    );
    const b = await order(uid, r.bookingId);
    expect(a.amountMinor).toBe(90_000);
    expect(b.paymentId).toBe(a.paymentId);
    expect(b.providerOrderId).toBe(a.providerOrderId);
    expect(a.providerOrderId).toMatch(/^order_emu_/);
    const pays = await db().collection("payments").where("bookingId", "==", r.bookingId).get();
    expect(pays.size).toBe(1);
  });

  test("refused once the hold has expired", async () => {
    const { eventId } = await world();
    const uid = await newCustomer();
    const r = await reserve(uid, eventId);
    await lapseHold(r.bookingId);
    expect(await callCode(commerce.createPaymentOrder, { requestId: rid(), bookingId: r.bookingId }, phoneCtx(uid))).toBe("PRECONDITION");
  });

  test("another customer cannot create an order for my booking", async () => {
    const { eventId } = await world();
    const me = await newCustomer();
    const thief = await newCustomer();
    const r = await reserve(me, eventId);
    expect(await callCode(commerce.createPaymentOrder, { requestId: rid(), bookingId: r.bookingId }, phoneCtx(thief))).toBe("NOT_FOUND");
  });
});

describe("confirmPayment", () => {
  test("a forged signature is rejected and the booking stays held", async () => {
    const { eventId } = await world();
    const uid = await newCustomer();
    const r = await reserve(uid, eventId);
    const o = await order(uid, r.bookingId);
    const payId = fakePayId();
    const forged = paymentSignature(o.providerOrderId, payId).replace(/^./, (c) => (c === "a" ? "b" : "a"));
    const wrongPair = paymentSignature(o.providerOrderId, fakePayId());
    for (const sig of [forged, wrongPair, "0".repeat(64)]) {
      const e = await callErr(commerce.confirmPayment, { paymentId: o.paymentId, providerPaymentId: payId, providerSignature: sig }, phoneCtx(uid));
      expect(e.code).toBe("NOT_PERMITTED");
    }
    expect((await getDoc<Booking>(`bookings/${r.bookingId}`))!.status).toBe("held");
    expect((await getDoc<Payment>(`payments/${o.paymentId}`))!.status).toBe("created");
    expect((await db().collection("tickets").where("bookingId", "==", r.bookingId).get()).size).toBe(0);
    expect((await ledgerWhere("bookingId", r.bookingId)).length).toBe(0);
  });

  test("someone else's valid signature can't confirm my payment (owner check)", async () => {
    const { eventId } = await world();
    const me = await newCustomer();
    const other = await newCustomer();
    const r = await reserve(me, eventId);
    const o = await order(me, r.bookingId);
    const payId = fakePayId();
    expect(
      await callCode(commerce.confirmPayment, { paymentId: o.paymentId, providerPaymentId: payId, providerSignature: paymentSignature(o.providerOrderId, payId) }, phoneCtx(other))
    ).toBe("NOT_FOUND");
  });

  test("capture uses the commission snapshotted at reservation, even if the event's terms later disappear", async () => {
    const { eventId } = await world({ priceMinor: 80_000, commissionBps: 1_500 });
    const uid = await newCustomer();
    const r = await reserve(uid, eventId, 1);
    expect((await getDoc<{ commissionBps: number }>(`bookings/${r.bookingId}`))!.commissionBps).toBe(1_500);
    const o = await order(uid, r.bookingId);
    // e.g. the event reverted to draft (saveEvent deletes the commercial doc) while checkout was open
    await db().collection("eventCommercials").doc(eventId).delete();
    const payId = fakePayId();
    await call(commerce.confirmPayment, { paymentId: o.paymentId, providerPaymentId: payId, providerSignature: paymentSignature(o.providerOrderId, payId) }, phoneCtx(uid));
    const pay = (await getDoc<Payment>(`payments/${o.paymentId}`))!;
    expect(pay).toMatchObject({ status: "captured", commissionBps: 1_500, commissionMinor: 12_000 });
    expect(await getDoc(`riskAlerts/commission-missing_${o.paymentId}`)).toBeUndefined();
  });

  test("a capture with no commission anywhere is recorded but raises a high risk alert (never silently 0%)", async () => {
    const { eventId } = await world({ priceMinor: 50_000, commissionBps: 1_000 });
    const uid = await newCustomer();
    const r = await reserve(uid, eventId, 1);
    const o = await order(uid, r.bookingId);
    // a legacy booking without a snapshot, on an event whose terms are gone
    await db().collection("bookings").doc(r.bookingId).update({ commissionBps: null });
    await db().collection("eventCommercials").doc(eventId).delete();
    const payId = fakePayId();
    await call(commerce.confirmPayment, { paymentId: o.paymentId, providerPaymentId: payId, providerSignature: paymentSignature(o.providerOrderId, payId) }, phoneCtx(uid));
    expect((await getDoc<Payment>(`payments/${o.paymentId}`))!).toMatchObject({ status: "captured", commissionMinor: 0 });
    expect(await getDoc(`riskAlerts/commission-missing_${o.paymentId}`)).toMatchObject({ kind: "capture-without-commission-terms", severity: "high", status: "open" });
  });

  test("valid confirmation → confirmed, N tickets, balanced ledger with floor commission, notification", async () => {
    const { eventId, orgId } = await world({ priceMinor: 99_999, commissionBps: 1_250 });
    const uid = await newCustomer();
    const b = await book(uid, eventId, 3);
    expect(b.status).toBe("confirmed");
    expect(b.ticketIds).toHaveLength(3);

    const booking = (await getDoc<Booking>(`bookings/${b.bookingId}`))!;
    expect(booking.status).toBe("confirmed");
    const event = (await getDoc<Event>(`events/${eventId}`))!;
    expect(event.occupancy.activeReservationHolds).toBe(0);
    expect(event.occupancy.confirmedPaidBookings).toBe(3);

    const amount = 99_999 * 3; // 299,997
    const commission = Math.floor((amount * 1_250) / 10_000); // 37,499
    const pay = (await getDoc<Payment>(`payments/${b.paymentId}`))!;
    expect(pay.status).toBe("captured");
    expect(pay.commissionBps).toBe(1_250);
    expect(pay.commissionMinor).toBe(commission);

    const entries = await ledgerWhere("bookingId", b.bookingId);
    expect(expectBalanced(entries)).toBe(1);
    expect(entries.every((e) => e.orgId === orgId && e.settlementId === null)).toBe(true);
    expect(sum(entries, "customer_payments", "debit")).toBe(amount);
    expect(sum(entries, "platform_commission", "credit")).toBe(commission);
    expect(sum(entries, "organizer_payable", "credit")).toBe(amount - commission);

    const n = await getDoc(`userNotifications/booking-confirmed:${b.bookingId}:${uid}`);
    expect(n).toBeDefined();

    // Replaying the confirmation changes nothing.
    const again = await call<{ ticketIds: string[] }>(
      commerce.confirmPayment,
      { paymentId: b.paymentId, providerPaymentId: b.providerPaymentId, providerSignature: paymentSignature(b.providerOrderId!, b.providerPaymentId!) },
      phoneCtx(uid)
    );
    expect(again.ticketIds.sort()).toEqual([...b.ticketIds].sort());
    expect((await db().collection("tickets").where("bookingId", "==", b.bookingId).get()).size).toBe(3);
    expect((await ledgerWhere("bookingId", b.bookingId)).length).toBe(entries.length);
  });
});

describe("razorpayWebhook", () => {
  test("bad signature → 400 and nothing recorded; tampered body → 400", async () => {
    const { eventId } = await world();
    const uid = await newCustomer();
    const r = await reserve(uid, eventId);
    const o = await order(uid, r.bookingId);
    const body = capturedEvent({ providerPaymentId: fakePayId(), orderId: o.providerOrderId, paymentId: o.paymentId, amount: o.amountMinor });
    const evId = `evt_bad_${rid()}`;
    const bad = await deliverWebhook(body, { eventId: evId, signature: "f".repeat(64) });
    expect(bad.statusCode).toBe(400);
    const tampered = await deliverWebhook(body, {
      tamper: (raw) => Buffer.from(raw.toString().replace(`"amount":${o.amountMinor}`, `"amount":1`)),
    });
    expect(tampered.statusCode).toBe(400);
    const missing = await deliverWebhook(body, { signature: "" });
    expect(missing.statusCode).toBe(400);
    expect(await getDoc(`paymentEvents/${evId}`)).toBeUndefined();
    expect((await getDoc<Booking>(`bookings/${r.bookingId}`))!.status).toBe("held");
  });

  test("capture webhook confirms; replays (same event id, new event id, concurrent) settle once", async () => {
    const { eventId } = await world({ priceMinor: 50_000 });
    const uid = await newCustomer();
    const r = await reserve(uid, eventId, 2);
    const o = await order(uid, r.bookingId);
    const payId = fakePayId();
    const body = capturedEvent({ providerPaymentId: payId, orderId: o.providerOrderId, paymentId: o.paymentId, amount: 100_000 });

    const first = await deliverWebhook(body, { eventId: "evt_cap_1_" + payId });
    expect(first.statusCode).toBe(200);
    expect(first.body).toMatchObject({ ok: true, outcome: "confirmed" });

    const dup = await deliverWebhook(body, { eventId: "evt_cap_1_" + payId });
    expect(dup.statusCode).toBe(200);
    expect(dup.body).toMatchObject({ duplicate: true });

    const storm = await Promise.all([1, 2, 3].map((i) => deliverWebhook(body, { eventId: `evt_cap_${i + 1}_${payId}` })));
    for (const s of storm) expect(s.statusCode).toBe(200);

    // The client confirmation racing the webhook is also a no-op.
    await call(commerce.confirmPayment, { paymentId: o.paymentId, providerPaymentId: payId, providerSignature: paymentSignature(o.providerOrderId, payId) }, phoneCtx(uid));

    expect((await db().collection("tickets").where("bookingId", "==", r.bookingId).get()).size).toBe(2);
    const entries = await ledgerWhere("bookingId", r.bookingId);
    expect(expectBalanced(entries)).toBe(1);
    const ev = (await getDoc<Event>(`events/${eventId}`))!;
    expect(ev.occupancy.confirmedPaidBookings).toBe(2);
    expect(ev.occupancy.activeReservationHolds).toBe(0);
    expect(await getDoc(`paymentEvents/evt_cap_1_${payId}`)).toBeDefined();
  });

  test("a second, different capture on an already-paid order is refunded automatically", async () => {
    const { eventId } = await world();
    const uid = await newCustomer();
    const b = await book(uid, eventId);
    const secondPay = fakePayId();
    const res = await deliverWebhook(capturedEvent({ providerPaymentId: secondPay, orderId: b.providerOrderId!, paymentId: b.paymentId!, amount: 99_900 }));
    expect(res.body).toMatchObject({ outcome: "duplicate-capture" });
    const refund = (await getDoc<{ status: string; amountMinor: number; ledgerPosted: boolean }>(`refunds/dup_${secondPay}`))!;
    expect(refund.status).toBe("processing");
    expect(refund.ledgerPosted).toBe(false);
    expect((await db().collection("tickets").where("bookingId", "==", b.bookingId).get()).size).toBe(1);
  });

  test("amount mismatch → not confirmed, risk alert raised", async () => {
    const { eventId } = await world({ priceMinor: 80_000 });
    const uid = await newCustomer();
    const r = await reserve(uid, eventId);
    const o = await order(uid, r.bookingId);
    const payId = fakePayId();
    const res = await deliverWebhook(capturedEvent({ providerPaymentId: payId, orderId: o.providerOrderId, paymentId: o.paymentId, amount: 100 }));
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ outcome: "amount-mismatch" });
    expect((await getDoc<Booking>(`bookings/${r.bookingId}`))!.status).toBe("held");
    const alert = (await getDoc<{ kind: string; severity: string; detail: { expectedMinor: number; receivedMinor: number } }>(`riskAlerts/amount-mismatch_${payId}`))!;
    expect(alert.kind).toBe("payment-amount-mismatch");
    expect(alert.detail).toMatchObject({ expectedMinor: 80_000, receivedMinor: 100 });
    expect((await ledgerWhere("bookingId", r.bookingId)).length).toBe(0);
    // Currency mismatch is caught the same way.
    const res2 = await deliverWebhook(capturedEvent({ providerPaymentId: fakePayId(), orderId: o.providerOrderId, paymentId: o.paymentId, amount: 80_000, currency: "USD" }));
    expect(res2.body).toMatchObject({ outcome: "amount-mismatch" });
  });

  test("payment.failed marks the payment failed and notifies; the customer can retry with a new order", async () => {
    const { eventId } = await world();
    const uid = await newCustomer();
    const r = await reserve(uid, eventId);
    const o = await order(uid, r.bookingId);
    const payId = fakePayId();
    const res = await deliverWebhook({
      event: "payment.failed",
      payload: { payment: { entity: { id: payId, order_id: o.providerOrderId, amount: o.amountMinor, currency: "INR", notes: { paymentId: o.paymentId }, error_description: "Card declined" } } },
    });
    expect(res.body).toMatchObject({ outcome: "failed" });
    expect((await getDoc<Payment>(`payments/${o.paymentId}`))!.status).toBe("failed");
    expect(await getDoc(`userNotifications/payment-failed:${payId}:${uid}`)).toBeDefined();
    const retry = await order(uid, r.bookingId);
    expect(retry.paymentId).not.toBe(o.paymentId);
  });

  test("capture after hold expiry is re-admitted when capacity allows", async () => {
    const { eventId } = await world({ capacity: 3 });
    const uid = await newCustomer();
    const r = await reserve(uid, eventId, 2);
    const o = await order(uid, r.bookingId);
    await lapseHold(r.bookingId);
    await releaseExpiredHolds();
    expect((await getDoc<Booking>(`bookings/${r.bookingId}`))!.status).toBe("expired");
    expect((await getDoc<Event>(`events/${eventId}`))!.occupancy.activeReservationHolds).toBe(0);

    const res = await deliverWebhook(capturedEvent({ providerPaymentId: fakePayId(), orderId: o.providerOrderId, paymentId: o.paymentId, amount: o.amountMinor }));
    expect(res.body).toMatchObject({ outcome: "readmitted" });
    const booking = (await getDoc<Booking>(`bookings/${r.bookingId}`))!;
    expect(booking.status).toBe("confirmed");
    expect(booking.ticketIds).toHaveLength(2);
    expect((await getDoc<Event>(`events/${eventId}`))!.occupancy.confirmedPaidBookings).toBe(2);
  });

  test("capture after expiry with no room → payment-orphaned + automatic full refund; refund.processed completes it", async () => {
    const { eventId, orgId } = await world({ capacity: 1, priceMinor: 70_001, commissionBps: 1_500 });
    const late = await newCustomer();
    const other = await newCustomer();
    const r = await reserve(late, eventId);
    const o = await order(late, r.bookingId);
    await lapseHold(r.bookingId);
    await releaseExpiredHolds();
    await reserve(other, eventId); // takes the only seat

    const payId = fakePayId();
    const res = await deliverWebhook(capturedEvent({ providerPaymentId: payId, orderId: o.providerOrderId, paymentId: o.paymentId, amount: 70_001 }));
    expect(res.body).toMatchObject({ outcome: "orphaned" });

    const booking = (await getDoc<Booking>(`bookings/${r.bookingId}`))!;
    expect(booking.status).toBe("payment-orphaned");
    expect((await db().collection("tickets").where("bookingId", "==", r.bookingId).get()).size).toBe(0);
    const ev = (await getDoc<Event & { occupancy: { activeReservationHolds: number } }>(`events/${eventId}`))!;
    expect(ev.occupancy.activeReservationHolds).toBe(1); // the other customer's hold, untouched
    expect(ev.occupancy.confirmedPaidBookings).toBe(0);

    const refund = (await getDoc<{ status: string; amountMinor: number; reason: string; providerRefundId: string; orgId: string }>(`refunds/orph_${o.paymentId}`))!;
    expect(refund).toMatchObject({ status: "processing", amountMinor: 70_001, reason: "payment-orphaned", orgId });
    expect(refund.providerRefundId).toMatch(/^rfnd_emu_/);
    const pay = (await getDoc<Payment>(`payments/${o.paymentId}`))!;
    expect(pay.status).toBe("refunded");
    expect(pay.refundedMinor).toBe(70_001);

    const entries = await ledgerWhere("bookingId", r.bookingId);
    expect(expectBalanced(entries)).toBe(2);
    // Net effect for the organizer and platform is exactly zero.
    expect(sum(entries, "organizer_payable", "credit") - sum(entries, "organizer_payable", "debit")).toBe(0);
    expect(sum(entries, "platform_commission", "credit") - sum(entries, "platform_commission", "debit")).toBe(0);
    expect(sum(entries, "customer_refunds", "credit")).toBe(70_001);

    const done = await deliverWebhook(refundEvent("refund.processed", { providerRefundId: refund.providerRefundId, refundId: `orph_${o.paymentId}`, amount: 70_001 }));
    expect(done.body).toMatchObject({ outcome: "completed" });
    expect((await getDoc<{ status: string }>(`refunds/orph_${o.paymentId}`))!.status).toBe("completed");

    // Replayed capture after all that: no-op.
    const again = await settleCapturedPayment({ paymentId: o.paymentId, providerOrderId: o.providerOrderId, providerPaymentId: payId, amountMinor: 70_001, currency: "INR", source: "webhook" });
    expect(again.outcome).toBe("already-settled");
    expect((await ledgerWhere("bookingId", r.bookingId)).length).toBe(entries.length);
  });

  test("capture for a booking whose customer already re-booked is orphaned (one live booking rule)", async () => {
    const { eventId } = await world({ capacity: 5 });
    const uid = await newCustomer();
    const r1 = await reserve(uid, eventId);
    const o1 = await order(uid, r1.bookingId);
    await lapseHold(r1.bookingId);
    await reserve(uid, eventId); // lazily expires r1, holds a new seat
    const res = await deliverWebhook(capturedEvent({ providerPaymentId: fakePayId(), orderId: o1.providerOrderId, paymentId: o1.paymentId, amount: o1.amountMinor }));
    expect(res.body).toMatchObject({ outcome: "orphaned" });
  });

  test("unknown event types and unknown payments are acknowledged without effect", async () => {
    const r1 = await deliverWebhook({ event: "order.paid", payload: {} });
    expect(r1.statusCode).toBe(200);
    const r2 = await deliverWebhook(capturedEvent({ providerPaymentId: fakePayId(), orderId: "order_nope", paymentId: "nope1234", amount: 1 }));
    expect(r2.body).toMatchObject({ outcome: "ignored:unknown-payment" });
  });

  test("the deployed onRequest function verifies the signature too", async () => {
    const raw = Buffer.from(JSON.stringify({ event: "order.paid", payload: {} }));
    const mk = (sig: string) => {
      const headers: Record<string, string> = { "x-razorpay-signature": sig, "x-razorpay-event-id": `evt_${rid()}` };
      return { method: "POST", rawBody: raw, body: {}, headers, header: (n: string) => headers[n.toLowerCase()], get: (n: string) => headers[n.toLowerCase()] };
    };
    const { fakeRes } = await import("./commerce-helpers");
    const bad = fakeRes();
    await (commerce.razorpayWebhook as unknown as (a: unknown, b: unknown) => Promise<void>)(mk("0".repeat(64)), bad);
    expect(bad.statusCode).toBe(400);
    const good = fakeRes();
    await (commerce.razorpayWebhook as unknown as (a: unknown, b: unknown) => Promise<void>)(mk(webhookSignature(raw)), good);
    expect(good.statusCode).toBe(200);
  });
});
