"use client";

import { useMemo, useState } from "react";
import { useStore, type CommandOutcome } from "@/lib/store";
import { refundExceptionRows, type RefundExceptionRow } from "@/lib/prototype/selectors/moderation";
import { formatAgo, formatWhen } from "@/lib/safety/time";
import { StatusChip } from "@/components/ui/primitives";
import { EmptyState } from "@/components/ui/panels";
import { Field, Select } from "@/components/ui/fields";
import { CommandDialog, GatedButton, PermissionNote, ReasonDialog, useSafetyGate } from "./shared";

const label = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, " ");
const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/** Refund exceptions raised from incidents and disputes. Finance (or an owner) decides them. */
export function RefundExceptionsTab({ territoryId }: { territoryId?: string }) {
  const { state, approveRefundException, rejectRefundException } = useStore();
  const gate = useSafetyGate();
  const rows = useMemo(() => refundExceptionRows(state, territoryId), [state, territoryId]);
  const [approving, setApproving] = useState<RefundExceptionRow | null>(null);
  const [rejecting, setRejecting] = useState<RefundExceptionRow | null>(null);
  const [bookingId, setBookingId] = useState("");
  const decide = gate("refund-exception.decide");
  const pending = rows.filter((r) => r.status === "recommended" || r.status === "under-review");

  return (
    <div>
      <div className="flex flex-col gap-2 border-b border-edge p-4 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-ink-mut">
          Refunds outside the cancellation policy, recommended from incidents and disputes. {pending.length} waiting for Finance.
        </p>
        <p className="text-xs text-ink-mut">Payment provider not connected — approved refunds are paid out and recorded manually in Money.</p>
      </div>
      {!decide.allowed && pending.length > 0 && (
        <div className="px-4 pt-4">
          <PermissionNote reason={`${decide.reason} You can see where each recommendation stands.`} />
        </div>
      )}
      {rows.length === 0 ? (
        <div className="p-6">
          <EmptyState title="No refund exceptions" line="Recommend one from an incident when the normal cancellation policy shouldn't apply." />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-edge bg-bg-sunken text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-mut">
                <th className="px-5 py-3">Exception</th>
                <th className="px-5 py-3">Reason</th>
                <th className="px-5 py-3">Linked to</th>
                <th className="px-5 py-3">Recommended</th>
                <th className="px-5 py-3 text-right">Amount</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const open = r.status === "recommended" || r.status === "under-review";
                return (
                  <tr key={r.id} className="border-b border-slate-100 align-top last:border-0">
                    <td className="px-5 py-3.5">
                      <span className="font-mono text-xs font-semibold text-ink-sec">{r.id}</span>
                      {r.notes && <p className="mt-1 max-w-[260px] text-xs text-ink-mut">{r.notes}</p>}
                    </td>
                    <td className="px-5 py-3.5 text-ink-lum">{label(r.reason)}</td>
                    <td className="px-5 py-3.5 text-ink-sec">{r.contextLabel}</td>
                    <td className="px-5 py-3.5 text-ink-sec">
                      {r.recommendedByName}
                      <span className="block text-xs text-ink-mut" title={formatWhen(r.recommendedAt)}>
                        {formatAgo(r.recommendedAt)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold tabular text-ink-lum">{rupees(r.amount)}</td>
                    <td className="px-5 py-3.5">
                      <StatusChip value={r.status} />
                      {r.decidedByName && <span className="mt-1 block text-xs text-ink-mut">by {r.decidedByName}</span>}
                      {r.rejectionReason && <span className="mt-1 block max-w-[200px] text-xs text-ink-mut">{r.rejectionReason}</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      {open && (
                        <div className="flex justify-end gap-2">
                          <GatedButton gate={decide} size="sm" variant="success" onClick={() => setApproving(r)}>
                            Approve
                          </GatedButton>
                          <GatedButton gate={decide} size="sm" variant="secondary" onClick={() => setRejecting(r)}>
                            Reject
                          </GatedButton>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <CommandDialog
        open={!!approving}
        onClose={() => {
          setApproving(null);
          setBookingId("");
        }}
        title="Approve refund exception"
        confirmLabel={approving ? `Approve ${rupees(approving.amount)}` : "Approve"}
        variant="success"
        success="Exception approved — the refund is ready to pay out in Money"
        canSubmit={!!approving && (!!approving.bookingId || !!bookingId)}
        onSubmit={(): CommandOutcome => (approving ? approveRefundException(approving.id, approving.bookingId ? undefined : bookingId) : {})}
      >
        {approving && (
          <>
            <p className="text-sm leading-6 text-ink-sec">
              Approving creates a refund of <strong>{rupees(approving.amount)}</strong> against{" "}
              {approving.bookingId ? `booking ${approving.bookingId}` : "the booking you choose below"}. Pay it out through your payment channel and record the
              payout in Money → Refunds.
            </p>
            {!approving.bookingId && (
              <Field label="Booking to refund" hint="This recommendation wasn't linked to a booking. Choose the booking the refund is for.">
                <Select value={bookingId} onChange={(e) => setBookingId(e.target.value)} required>
                  <option value="">Choose a booking…</option>
                  {state.bookings
                    .filter((b) => !approving.sessionId || b.sessionId === approving.sessionId)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.alias} · {b.bookingCode ?? b.id} · {rupees(b.amount)}
                      </option>
                    ))}
                </Select>
              </Field>
            )}
          </>
        )}
      </CommandDialog>
      <ReasonDialog
        open={!!rejecting}
        onClose={() => setRejecting(null)}
        title="Reject refund exception"
        consequence="The standard cancellation policy applies. The person who recommended it sees your reason."
        confirmLabel="Reject"
        variant="danger"
        success="Exception rejected"
        onSubmit={(reason): CommandOutcome => (rejecting ? rejectRefundException(rejecting.id, reason) : {})}
      />
    </div>
  );
}
