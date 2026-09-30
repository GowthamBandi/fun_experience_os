/**
 * Log hygiene (platform/log.ts, platform/jobs.ts): phone numbers are redacted
 * wherever they appear, but identifiers and timestamps are left readable.
 * Pure unit tests: no emulator needed.
 */

import * as functions from "firebase-functions/v1";
import { redactPhones, sanitize } from "../src/platform/log";
import { errorMessage } from "../src/platform/jobs";
import { callable } from "../src/platform/callable";
import { DomainError } from "../src/platform/errors";

describe("phone redaction", () => {
  test.each([
    "+919812345678",
    "+91 98123 45678",
    "+91-98123-45678",
    "919812345678",
    "09812345678",
    "9812345678",
    "98123 45678",
    "98123-45678",
  ])("redacts the phone shape %s", (p) => {
    expect(redactPhones(`call ${p} now`)).toBe("call [redacted] now");
  });

  test.each([
    // Cloud Trace ids (hex, long digit runs), request/document ids, ISO dates, epoch ms, amounts.
    "4bf92f3577b34da6a3ce929d0e0e4736",
    "105445aa7843bc8bf206b12000100000",
    "12345678901234567890",
    "req_9812345678abcdef",
    "bkg-9812345678",
    "2026-09-30T12:34:56.789Z",
    "2026-09-30 12:34:56",
    "1727700000000",
    "5812345678",
    "98123456789",
  ])("leaves the non-phone %s alone", (v) => {
    expect(redactPhones(v)).toBe(v);
  });

  test("sanitize exempts id / timestamp keys from value-shape scrubbing but still redacts free text", () => {
    const out = sanitize({
      event: "x",
      correlationId: "9812345678",
      requestId: "9812345678",
      trace: "9812345678",
      bookingId: "9812345678",
      refundIds: ["9812345678"],
      startedAt: "2026-09-30T12:34:56.789Z",
      time: "9812345678",
      uid: "9812345678",
      note: "customer 9812345678 called",
      error: "failed for +91 98123 45678",
      phone: "not-even-a-number",
      nested: { eventId: "9812345678", message: "9812345678" },
    });
    expect(out).toMatchObject({
      correlationId: "9812345678",
      requestId: "9812345678",
      trace: "9812345678",
      bookingId: "9812345678",
      refundIds: ["9812345678"],
      startedAt: "2026-09-30T12:34:56.789Z",
      time: "9812345678",
      uid: "9812345678",
      note: "customer [redacted] called",
      error: "failed for [redacted]",
      phone: "[redacted]",
      nested: { eventId: "9812345678", message: "[redacted]" },
    });
  });

  test("a trace id / ISO date inside free text survives; a phone next to it does not", () => {
    const s = "trace 4bf92f3577b34da6a3ce929d0e0e4736 at 2026-09-30T12:34:56Z for 9812345678";
    expect(redactPhones(s)).toBe("trace 4bf92f3577b34da6a3ce929d0e0e4736 at 2026-09-30T12:34:56Z for [redacted]");
  });

  test("jobs errorMessage redacts phones, keeps ids/dates, truncates", () => {
    expect(errorMessage(new Error("KYC purge failed for app-12345678901234 on 2026-09-30T03:17:00Z: +919812345678"))).toBe(
      "KYC purge failed for app-12345678901234 on 2026-09-30T03:17:00Z: [redacted]"
    );
    expect(errorMessage("x".repeat(400))).toHaveLength(300);
  });
});

describe("callable failure logging", () => {
  type Runnable = { run: (data: unknown, ctx: unknown) => Promise<unknown> };
  const ctx = { auth: { uid: "u-log", token: {} }, rawRequest: {} };

  test("a throwing logger never replaces the mapped business error", async () => {
    const spy = jest.spyOn(functions.logger, "write").mockImplementation(() => {
      throw new Error("logger transport down");
    });
    try {
      const fn = callable(async () => {
        throw new DomainError("CONFLICT", "Already done.");
      }) as unknown as Runnable;
      const err = await fn.run({ requestId: "req_12345678" }, ctx).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(functions.https.HttpsError);
      expect((err as functions.https.HttpsError).code).toBe("aborted");
      expect((err as { details?: { code?: string } }).details?.code).toBe("CONFLICT");

      const internal = callable(async () => {
        throw new TypeError("boom");
      }) as unknown as Runnable;
      const e2 = await internal.run({}, ctx).catch((e: unknown) => e);
      expect((e2 as functions.https.HttpsError).code).toBe("internal");
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

describe("long numbers", () => {
  test("card, Aadhaar and account-shaped numbers are redacted; ids and dates are not", () => {
    expect(redactPhones("card 4111 1111 1111 1111 ok")).toBe("card [redacted] ok");
    expect(redactPhones("aadhaar 1234-5678-9012")).toBe("aadhaar [redacted]");
    expect(redactPhones("acct 001234567890123")).toBe("acct [redacted]");
    expect(redactPhones("on 2026-09-30T10:00:00Z")).toBe("on 2026-09-30T10:00:00Z");
    expect(redactPhones("trace 105445aa7843bc8bf206b12000100000")).toBe("trace 105445aa7843bc8bf206b12000100000");
    expect(redactPhones("amount 99900 paise")).toBe("amount 99900 paise");
  });
});
