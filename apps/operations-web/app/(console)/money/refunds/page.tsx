"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CircleCheck, HandCoins, RotateCcw, ShieldAlert } from "lucide-react";
import { useStore } from "@/lib/store";
import { inr } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/primitives";
import { MetricTile, PermissionDenied } from "@/components/ui/panels";
import { SearchInput } from "@/components/ui/fields";
import { DataTable, type Column } from "@/components/ui/table";
import type { Refund, RefundException } from "@/lib/prototype/entities";
import { sessionTitle } from "@/lib/prototype/selectors/lookups";
import { AWAITING_APPROVAL_REFUND_STATUSES, AWAITING_PAYOUT_REFUND_STATUSES, paymentMethodLabel } from "@/lib/prototype/selectors/money";
import { REFUND_APPROVER_ROLES } from "@/lib/prototype/services/money";
import {
  Breadcrumbs,
  ExceptionStatusChip,
  PageFrame,
  ProviderNotice,
  RefundStatusChip,
  Section,
  Segments,
  exceptionReasonLabel,
  formatWhen,
  refundTypeLabel,
  whenMillis,
} from "@/components/bookings/shared";
import { ApproveExceptionDialog, ApproveRefundDialog, PayoutDialog, ReasonDialog } from "@/components/bookings/dialogs";

type Filter = "approval" | "payout" | "paid" | "rejected" | "all";

const inFilter = (r: Refund, f: Filter) =>
  f === "all" ||
  (f === "approval" && AWAITING_APPROVAL_REFUND_STATUSES.has(r.status)) ||
  (f === "payout" && AWAITING_PAYOUT_REFUND_STATUSES.has(r.status)) ||
  (f === "paid" && r.status === "completed") ||
  (f === "rejected" && (r.status === "rejected" || r.status === "failed"));

export default function RefundsPage() {
  const { state, role, territory, canAccess, rejectRefund, rejectRefundException } = useStore();
  const [filter, setFilter] = useState<Filter>("approval");
  const [query, setQuery] = useState("");
  const [approving, setApproving] = useState<Refund>();
  const [payingOut, setPayingOut] = useState<Refund>();
  const [rejecting, setRejecting] = useState<Refund>();
  const [approvingEx, setApprovingEx] = useState<RefundException>();
  const [rejectingEx, setRejectingEx] = useState<RefundException>();

  const canDecide = REFUND_APPROVER_ROLES.has(role.id);
  const bookings = useMemo(() => new Map(state.bookings.map((b) => [b.id, b])), [state.bookings]);
  const inTerritory = useMemo(() => new Set(state.sessions.filter((s) => s.territoryId === territory.id).map((s) => s.id)), [state.sessions, territory.id]);
  const refunds = useMemo(
    () => (state.refunds ?? []).filter((r) => inTerritory.has(r.sessionId)).sort((a, b) => whenMillis(b.requestedAt) - whenMillis(a.requestedAt)),
    [state.refunds, inTerritory]
  );
  const exceptions = useMemo(
    () => (state.refundExceptions ?? []).filter((e) => (e.status === "recommended" || e.status === "under-review") && (!e.sessionId || inTerritory.has(e.sessionId))),
    [state.refundExceptions, inTerritory]
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return refunds.filter((r) => {
      const b = bookings.get(r.bookingId);
      return inFilter(r, filter) && (!q || `${r.id} ${r.reason} ${b?.alias ?? ""} ${b?.bookingCode ?? ""} ${r.payoutReference ?? ""}`.toLowerCase().includes(q));
    });
  }, [refunds, filter, query, bookings]);

  if (!canAccess("/money/refunds")) return <PermissionDenied module="Money" />;

  const total = (f: Filter) => refunds.filter((r) => inFilter(r, f)).reduce((a, r) => a + r.amount, 0);
  const count = (f: Filter) => refunds.filter((r) => inFilter(r, f)).length;

  const columns: Array<Column<Refund>> = [
    {
      key: "who",
      header: "Booking",
      render: (r) => {
        const b = bookings.get(r.bookingId);
        return (
          <div className="max-w-[220px]">
            {b ? (
              <Link href={`/bookings/${b.id}`} className="font-semibold text-ink-lum hover:text-brand">
                {b.alias}
              </Link>
            ) : (
              <span className="text-ink-mut">Booking removed</span>
            )}
            <p className="truncate text-xs text-ink-mut">{sessionTitle(state, r.sessionId)}</p>
          </div>
        );
      },
    },
    {
      key: "why",
      header: "Type · reason",
      render: (r) => (
        <div className="min-w-[200px] max-w-[300px] text-xs">
          <p className="font-medium text-ink-sec">{refundTypeLabel(r.type)}</p>
          <p className="line-clamp-2 text-ink-mut">{r.reason}</p>
          {r.status === "rejected" && r.failureReason && <p className="text-red-600">Rejected: {r.failureReason}</p>}
          {r.payoutReference && (
            <p className="text-ink-mut">
              {paymentMethodLabel(r.payoutMethod)} · <span className="font-mono">{r.payoutReference}</span>
            </p>
          )}
        </div>
      ),
    },
    { key: "when", header: "Requested", render: (r) => <span className="whitespace-nowrap text-xs text-ink-sec">{formatWhen(r.requestedAt)}</span> },
    { key: "status", header: "Status", render: (r) => <RefundStatusChip status={r.status} /> },
    { key: "amount", header: "Amount", align: "right", render: (r) => <span className="font-semibold text-ink-lum">{inr(r.amount)}</span> },
    {
      key: "act",
      header: "",
      align: "right",
      render: (r) => {
        if (!canDecide) return null;
        if (AWAITING_APPROVAL_REFUND_STATUSES.has(r.status))
          return (
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="success" onClick={() => setApproving(r)}>
                Approve
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setRejecting(r)}>
                Reject
              </Button>
            </div>
          );
        if (AWAITING_PAYOUT_REFUND_STATUSES.has(r.status))
          return (
            <Button size="sm" variant="success" onClick={() => setPayingOut(r)}>
              Record payout
            </Button>
          );
        return null;
      },
    },
  ];

  return (
    <PageFrame>
      <Breadcrumbs items={[{ label: "Money", href: "/money" }, { label: "Refunds" }]} />
      <PageHeader
        overline={`Finance · ${territory.name}`}
        title="Refunds"
        sub="Each refund is requested, approved by Finance, then paid out and recorded with its reference. Nothing can be refunded beyond what the customer paid."
      />
      <ProviderNotice>Payment provider not connected — send the refund from your bank or UPI app, then record the payout reference here.</ProviderNotice>
      {!canDecide && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-800">
          You can see refunds, but only Finance, a Super Admin or a Platform Owner can approve, reject or pay them out.
        </p>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="Awaiting approval" value={inr(total("approval"))} detail={`${count("approval")} request${count("approval") === 1 ? "" : "s"}`} icon={<RotateCcw className="h-4 w-4" />} tone="amber" onClick={() => setFilter("approval")} />
        <MetricTile label="Approved, to pay out" value={inr(total("payout"))} detail={`${count("payout")} refund${count("payout") === 1 ? "" : "s"}`} icon={<HandCoins className="h-4 w-4" />} tone="sky" onClick={() => setFilter("payout")} />
        <MetricTile label="Paid out" value={inr(total("paid"))} detail={`${count("paid")} refunds`} icon={<CircleCheck className="h-4 w-4" />} tone="emerald" onClick={() => setFilter("paid")} />
        <MetricTile label="Exceptions to review" value={exceptions.length} detail={exceptions.length ? inr(exceptions.reduce((a, e) => a + e.amount, 0)) : "None waiting"} icon={<ShieldAlert className="h-4 w-4" />} tone="rose" />
      </section>

      {exceptions.length > 0 && (
        <Section title="Exception refunds" sub="Refunds outside the normal policy, recommended by Safety or Operations. Approving creates an approved refund that is paid out below.">
          <ul className="divide-y divide-slate-100">
            {exceptions.map((e) => {
              const b = e.bookingId ? bookings.get(e.bookingId) : undefined;
              return (
                <li key={e.id} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink-lum">
                      {inr(e.amount)} · {exceptionReasonLabel(e.reason)} <ExceptionStatusChip status={e.status} />
                    </p>
                    <p className="text-xs text-ink-mut">
                      {b ? `${b.alias} · ` : "No booking linked yet · "}
                      {e.sessionId ? sessionTitle(state, e.sessionId) : "No session"} · recommended {formatWhen(e.recommendedAt)}
                    </p>
                    {e.notes && <p className="mt-1 text-xs text-ink-sec">{e.notes}</p>}
                  </div>
                  {canDecide && (
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="success" onClick={() => setApprovingEx(e)}>
                        Approve
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setRejectingEx(e)}>
                        Reject
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      <section className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 overflow-x-auto pb-1">
            <Segments
              label="Filter refunds"
              value={filter}
              onChange={setFilter}
              options={[
                { id: "approval", label: "Awaiting approval", count: count("approval") },
                { id: "payout", label: "To pay out", count: count("payout") },
                { id: "paid", label: "Paid out", count: count("paid") },
                { id: "rejected", label: "Rejected", count: count("rejected") },
                { id: "all", label: "All", count: count("all") },
              ]}
            />
          </div>
          <div className="lg:w-80">
            <SearchInput value={query} onChange={setQuery} placeholder="Search name, reason or reference" />
          </div>
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          emptyTitle={filter === "approval" ? "No refunds waiting for approval" : filter === "payout" ? "Nothing to pay out" : "No refunds here"}
          emptyLine={refunds.length ? "Choose another filter to see other refunds." : `Refunds for ${territory.name} appear here when bookings are cancelled or refunds are requested.`}
        />
      </section>

      <ApproveRefundDialog refund={approving} open={Boolean(approving)} onClose={() => setApproving(undefined)} />
      <PayoutDialog refund={payingOut} open={Boolean(payingOut)} onClose={() => setPayingOut(undefined)} />
      <ReasonDialog
        open={Boolean(rejecting)}
        onClose={() => setRejecting(undefined)}
        title="Reject this refund?"
        description={<>The {rejecting ? inr(rejecting.amount) : ""} refund will not be paid and the customer keeps what they paid for. The reason is recorded on the booking.</>}
        placeholder="e.g. Cancelled after the 24-hour refund window"
        confirmLabel="Reject refund"
        onConfirm={(reason) => (rejecting ? rejectRefund(rejecting.id, reason) : undefined)}
        successTitle="Refund rejected"
      />
      <ApproveExceptionDialog exception={approvingEx} open={Boolean(approvingEx)} onClose={() => setApprovingEx(undefined)} />
      <ReasonDialog
        open={Boolean(rejectingEx)}
        onClose={() => setRejectingEx(undefined)}
        title="Reject this exception?"
        description={<>No exception refund of {rejectingEx ? inr(rejectingEx.amount) : ""} will be made. The team that recommended it will see your reason.</>}
        placeholder="e.g. Standard cancellation policy applies"
        confirmLabel="Reject exception"
        onConfirm={(reason) => (rejectingEx ? rejectRefundException(rejectingEx.id, reason) : undefined)}
        successTitle="Exception rejected"
      />
    </PageFrame>
  );
}
