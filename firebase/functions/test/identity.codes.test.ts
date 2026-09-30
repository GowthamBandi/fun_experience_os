/**
 * Access-code redemption edge cases:
 *  - a staff invite expired by the retention sweep still answers "This code
 *    has expired" (not "invalid"), and is not charged as a guess;
 *  - the `security.code-failed` log line is emitted once per refused attempt,
 *    after the audit write commits, even when the transaction is retried.
 */

import * as functions from "firebase-functions/v1";
import { Firestore, Timestamp } from "firebase-admin/firestore";
import { ROLE_TEMPLATES } from "../src/access/permissions";
import { parseCode, parseInviteStaff } from "../src/identity/model";
import { inviteStaff, redeemStaffCode } from "../src/identity/staff";
import { redeemOrganizerCode } from "../src/identity/organizer";
import { runRetention } from "../src/platform/retention";
import { phoneActor, seedOrg, seedUser, useEmulator } from "./identity-fixtures";

const h = useEmulator("identity-codes-tests");

const ORG = "org-codes";
const owner = phoneActor("owner-code-01", "+919800000101");
const newbie = phoneActor("newbie-code-01", "+919876500001");

let seq = 0;
const rid = (p = "req") => `${p}-${String(++seq).padStart(6, "0")}`;
const invite = (phone = "98765 00001") =>
  inviteStaff(
    parseInviteStaff({ requestId: rid("invite"), orgId: ORG, phone, title: "Gate crew", permissions: ROLE_TEMPLATES["check-in"]!, eventScope: "all" }),
    owner
  ) as Promise<{ inviteId: string; code: string }>;
const redeem = (code: string, who = newbie) => redeemStaffCode(parseCode({ code }), who);

async function refusal(p: Promise<unknown>): Promise<{ code: string; message: string }> {
  try {
    await p;
  } catch (e) {
    const err = e as { code: string; operatorMessage?: string; message: string };
    return { code: err.code, message: err.operatorMessage ?? err.message };
  }
  throw new Error("expected a refusal");
}

const failedAudits = async () =>
  (await h.firestore().collection("auditEvents").where("action", "==", "access.code-failed").get()).docs.map((d) => d.data());

beforeEach(async () => {
  const f = h.firestore();
  await seedOrg(f, ORG, owner.uid);
  for (const a of [owner, newbie]) await seedUser(f, a.uid, a.phone, a.uid);
});

describe("staff invite expired by the retention sweep", () => {
  test("its real code answers 'This code has expired', and no pending invite is charged an attempt", async () => {
    const lapsed = await invite();
    const f = h.firestore();
    await f.doc(`staffInvites/${lapsed.inviteId}`).update({ expiresAt: Timestamp.fromMillis(Date.now() - 10 * 24 * 3_600_000) });
    await runRetention({ deleteStorage: async () => 0 });
    const doc = (await f.doc(`staffInvites/${lapsed.inviteId}`).get()).data()!;
    expect(doc.status).toBe("expired");
    expect(typeof doc.codeHash).toBe("string");

    // A new, live invite for the same person from the same organizer.
    const live = await invite();
    const r = await refusal(redeem(lapsed.code));
    expect(r).toEqual({ code: "PRECONDITION", message: "This code has expired." });
    expect((await f.doc(`staffInvites/${live.inviteId}`).get()).data()!.attempts).toBe(0);
    const audits = await failedAudits();
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ reason: "expired", resourceId: lapsed.inviteId, orgId: ORG });

    // The expired code grants nothing; a wrong code is still a counted guess;
    // the live code still works.
    expect((await f.doc(`memberships/${ORG}__${newbie.uid}`).get()).exists).toBe(false);
    expect((await refusal(redeem("ZZZZZZZZ"))).code).toBe("INVALID_INPUT");
    expect((await f.doc(`staffInvites/${live.inviteId}`).get()).data()!.attempts).toBe(1);
    expect(await redeem(live.code)).toEqual({ orgId: ORG });
  });

  test("an invite superseded after expiry (re-invite) also answers 'expired' for its old code", async () => {
    const old = await invite();
    const f = h.firestore();
    await f.doc(`staffInvites/${old.inviteId}`).update({ expiresAt: Timestamp.fromMillis(Date.now() - 60_000) });
    await invite(); // marks the lapsed one expired
    expect((await f.doc(`staffInvites/${old.inviteId}`).get()).data()!.status).toBe("expired");
    expect(await refusal(redeem(old.code))).toEqual({ code: "PRECONDITION", message: "This code has expired." });
  });

  test("with no invite at all, a code is still just invalid", async () => {
    expect((await refusal(redeem("ZZZZZZZZ"))).code).toBe("INVALID_INPUT");
    expect((await failedAudits())[0]).toMatchObject({ reason: "no-invite" });
  });
});

describe("security.code-failed logging", () => {
  /**
   * Makes every transaction's first attempt fail with ABORTED after its
   * callback ran, exactly like real contention: the SDK retries it.
   */
  function forceOneRetryPerTransaction() {
    const original = Firestore.prototype.runTransaction;
    return jest.spyOn(Firestore.prototype, "runTransaction").mockImplementation(function (this: Firestore, fn: any, opts?: any) {
      let first = true;
      return original.call(
        this,
        async (tx: any) => {
          const out = await fn(tx);
          if (first) {
            first = false;
            throw Object.assign(new Error("simulated contention"), { code: 10 });
          }
          return out;
        },
        opts
      );
    } as any);
  }

  test("is logged once per refused attempt even when the transaction is retried (staff and organizer)", async () => {
    const lines: string[] = [];
    const write = jest.spyOn(functions.logger, "write").mockImplementation((entry: { message?: string }) => {
      if (entry.message) lines.push(entry.message);
    });
    const retry = forceOneRetryPerTransaction();
    try {
      await invite();
      lines.length = 0;
      expect((await refusal(redeem("ZZZZZZZZ"))).code).toBe("INVALID_INPUT");
      expect(lines.filter((l) => l === "security.code-failed")).toHaveLength(1);
      expect(await failedAudits()).toHaveLength(1);

      lines.length = 0;
      expect((await refusal(redeemOrganizerCode(parseCode({ code: "ZZZZZZZZZZ" }), newbie))).code).toBe("INVALID_INPUT");
      expect(lines.filter((l) => l === "security.code-failed")).toHaveLength(1);
      expect(await failedAudits()).toHaveLength(2);
      // The retry really happened (the callback ran twice for each).
      expect(retry).toHaveBeenCalled();
    } finally {
      retry.mockRestore();
      write.mockRestore();
    }
  });
});
