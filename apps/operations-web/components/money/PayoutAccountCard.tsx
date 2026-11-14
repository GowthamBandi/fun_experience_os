"use client";

import { useState } from "react";
import { BadgeCheck, Eye, Landmark, XCircle } from "lucide-react";
import { Badge, Button, Card, Sheet, useToast, type BadgeTone } from "@/components/pulse";
import { useAdminSession } from "@/lib/firebase/auth";
import { can } from "@/lib/console/capabilities";
import { newRequestId } from "@/lib/console/actions";
import { formatDateTime } from "@/lib/console/records";
import { decidePayoutAccount, revealPayoutAccount, type RevealedPayoutAccount } from "@/lib/governance-api";
import { useLiveDocument } from "@/lib/use-governance";

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  "pending-verification": { label: "Needs verification", tone: "warn" },
  verified: { label: "Verified", tone: "ok" },
  rejected: { label: "Rejected", tone: "err" },
};

type OpenSheet = "verify" | "reject" | "reveal" | null;

/**
 * The organizer's payout account (backend: commerce/payoutAccounts.ts).
 * Shows only the masked projection. Ops verify it against the organizer's
 * documents; settlements can be marked paid only to a verified account.
 * A Platform Owner can reveal the full details for one look — never stored
 * in the console, and every reveal is audited.
 */
export function PayoutAccountCard({ orgId }: { orgId: string }) {
  const { consoleRole } = useAdminSession();
  const toast = useToast();
  const live = useLiveDocument("payoutAccounts", orgId);
  const [sheet, setSheet] = useState<OpenSheet>(null);
  const [revealed, setRevealed] = useState<RevealedPayoutAccount | null>(null);
  const a = live.data;
  const status = typeof a?.status === "string" ? a.status : null;
  const decide = can(consoleRole, "governance.decide");
  const reveal = can(consoleRole, "payouts.reveal");

  const run = async (outcome: "verified" | "rejected", note: string) => {
    await decidePayoutAccount({ requestId: newRequestId("payout"), orgId, expectedVersion: Number(a?.version ?? 0), outcome, note });
    setRevealed(null);
    toast.show({ tone: "ok", title: outcome === "verified" ? "Payout account verified" : "Payout account rejected", body: "The organizer has been notified." });
  };

  return (
    <Card className="p-5" data-testid="payout-account-card">
      <div className="flex flex-wrap items-center gap-3">
        <Landmark aria-hidden className="h-5 w-5 text-text-3" />
        <h3 className="mr-auto font-display text-[17px] font-bold text-text">Payout account</h3>
        {status ? <Badge tone={STATUS[status]?.tone ?? "muted"}>{STATUS[status]?.label ?? status}</Badge> : null}
      </div>

      {live.loading ? <p className="mt-3 text-[13px] text-text-3">Loading…</p> : null}
      {live.error ? <p className="mt-3 text-[13px] text-err">{live.error}</p> : null}
      {!live.loading && !a ? (
        <p className="mt-3 text-[13px] text-text-2">The organizer hasn’t added a payout account yet. Settlements can’t be marked paid until they do and it’s verified.</p>
      ) : null}

      {a ? (
        <>
          <dl className="mt-4 grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
            <div><dt className="text-text-3">Method</dt><dd className="font-semibold text-text">{a.method === "upi" ? "UPI" : "Bank account"}</dd></div>
            <div><dt className="text-text-3">Account</dt><dd className="font-semibold text-text" data-testid="payout-masked">{String(a.masked ?? "—")}{a.ifsc ? ` · ${String(a.ifsc)}` : ""}</dd></div>
            <div><dt className="text-text-3">Holder</dt><dd className="font-semibold text-text">{String(a.holderName ?? "—")}</dd></div>
            <div><dt className="text-text-3">Submitted</dt><dd className="text-text">{formatDateTime(a.submittedAt)} · v{Number(a.version ?? 0)}</dd></div>
            {typeof a.note === "string" && a.note ? <div className="sm:col-span-2"><dt className="text-text-3">Note to organizer</dt><dd className="text-text">{a.note}</dd></div> : null}
          </dl>

          {revealed ? (
            <div className="mt-4 rounded-control border border-[rgba(255,184,77,0.4)] bg-[rgba(255,184,77,0.08)] p-3 text-[13px]" data-testid="payout-revealed">
              <p className="font-semibold text-text">
                {revealed.method === "bank" ? `${revealed.accountNumber} · ${revealed.ifsc}` : revealed.upiId}
              </p>
              <p className="mt-1 text-text-3">Shown once for this check. This reveal is in the audit trail.</p>
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => setRevealed(null)}>Hide</Button>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            {reveal && !revealed ? (
              <Button variant="ghost" size="sm" icon={<Eye />} onClick={() => setSheet("reveal")}>Show full details</Button>
            ) : null}
            {decide && status === "pending-verification" ? (
              <>
                <Button variant="danger" size="sm" icon={<XCircle />} onClick={() => setSheet("reject")}>Reject</Button>
                <Button variant="volt" size="sm" icon={<BadgeCheck />} onClick={() => setSheet("verify")}>Verify</Button>
              </>
            ) : null}
          </div>
        </>
      ) : null}

      <Sheet
        open={sheet === "verify"}
        title="Verify this payout account?"
        description={`Settlements for this organizer will be paid to ${String(a?.masked ?? "")}. Check the holder name against the PAN and a cancelled cheque or bank statement first.`}
        confirmLabel="Verify account"
        tone="volt"
        reasonLabel="How you checked it (optional)"
        onConfirm={(note) => run("verified", note)}
        onClose={() => setSheet(null)}
      />
      <Sheet
        open={sheet === "reject"}
        title="Reject this payout account?"
        description="The organizer is told why and can add a new account."
        confirmLabel="Reject account"
        tone="danger"
        requireReason
        minReason={5}
        reasonLabel="What the organizer should fix"
        onConfirm={(note) => run("rejected", note)}
        onClose={() => setSheet(null)}
      />
      <Sheet
        open={sheet === "reveal"}
        title="Show the full payout details?"
        description="Only for checking the account or paying a settlement. Your name and reason go in the audit trail."
        confirmLabel="Show details"
        tone="volt"
        requireReason
        minReason={5}
        reasonLabel="Reason"
        onConfirm={async (reason) => setRevealed(await revealPayoutAccount({ orgId, reason }))}
        onClose={() => setSheet(null)}
      />
    </Card>
  );
}
