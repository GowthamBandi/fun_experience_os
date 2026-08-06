"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { selectRefundList } from "@/lib/prototype/selectors/money";
import { inr } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable, type Column } from "@/components/ui/table";
import { StatusChip, Button } from "@/components/ui/primitives";
import type { Refund } from "@/lib/prototype/entities";

export default function RefundAuthorizationPage() {
  const {
    state,
    approveRefund,
    rejectRefund,
    approveRefundException,
    rejectRefundException,
    role
  } = useStore();

  const refunds = useMemo(() => selectRefundList(state), [state]);
  const exceptions = useMemo(() => (state.refundExceptions ?? []).filter((re) => re.status === "recommended"), [state]);

  const isFinanceRole = role.id === "finance" || role.id === "super-admin" || role.id === "ops-manager";

  const columns: Column<Refund>[] = [
    {
      key: "id",
      header: "Refund ID",
      render: (r) => <span className="font-mono font-bold text-amber-400">{r.id}</span>,
    },
    {
      key: "booking",
      header: "Booking Ref",
      render: (r) => (
        <Link href={`/bookings/${r.bookingId}`} className="font-mono text-emerald-400 hover:underline">
          {r.bookingId}
        </Link>
      ),
    },
    { key: "type", header: "Reason Type", render: (r) => <span className="font-mono text-slate-300">{r.type}</span> },
    { key: "amount", header: "Amount", align: "right", render: (r) => <span className="font-mono text-red-400 font-bold">{inr(r.amount)}</span> },
    { key: "status", header: "Status", render: (r) => <StatusChip value={r.status} /> },
    { key: "requestedAt", header: "Requested", render: (r) => <span className="font-mono text-slate-400 text-[11px]">{r.requestedAt}</span> },
    {
      key: "action",
      header: "Finance Authorization",
      align: "right",
      render: (r) => (
        <div className="flex items-center justify-end gap-1.5 font-mono">
          {(r.status === "requested" || r.status === "under-review") && (
            <>
              <button
                onClick={() => approveRefund(r.id, role.id)}
                className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded text-[10px]"
              >
                Approve & Settle
              </button>
              <button
                onClick={() => rejectRefund(r.id, "Policy non-compliance", role.id)}
                className="px-2 py-1 bg-red-950 hover:bg-red-900 text-red-300 border border-red-800 rounded text-[10px]"
              >
                Reject Request
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  const exceptionColumns: Column<any>[] = [
    {
      key: "id",
      header: "Exception ID",
      render: (re) => <span className="font-mono font-bold text-brand">{re.id}</span>,
    },
    {
      key: "booking",
      header: "Booking Ref",
      render: (re) => (
        <span className="font-mono text-slate-300">{re.bookingId || "Manual / Session"}</span>
      ),
    },
    { key: "reason", header: "Incident Reason", render: (re) => <span className="font-mono text-slate-300">{re.reason}</span> },
    { key: "amount", header: "Amount", align: "right", render: (re) => <span className="font-mono text-red-400 font-bold">{inr(re.amount)}</span> },
    { key: "status", header: "Status", render: (re) => <StatusChip value={re.status} /> },
    { key: "notes", header: "Justification", render: (re) => <span className="text-slate-400 max-w-xs truncate">{re.notes || "—"}</span> },
    {
      key: "action",
      header: "Finance Authorization",
      align: "right",
      render: (re) => (
        <div className="flex items-center justify-end gap-1.5 font-mono">
          <button
            onClick={() => {
              if (role.id !== "finance" && role.id !== "platform-owner") {
                alert("Finance clearance role required to approve exceptions.");
                return;
              }
              approveRefundException(re.id);
            }}
            className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded text-[10px]"
          >
            Approve Exception
          </button>
          <button
            onClick={() => rejectRefundException(re.id, "Rejected during financial audit")}
            className="px-2 py-1 bg-red-950 hover:bg-red-900 text-red-300 border border-red-800 rounded text-[10px]"
          >
            Reject Exception
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6 font-mono text-xs">
      <PageHeader
        overline="Financial Operations"
        title="Refund Authorization Workspace"
        sub="Role-restricted refund request review, approval workflows, and simulated customer reimbursements."
        right={
          <Link href="/money">
            <Button variant="ghost" className="h-8 px-3 text-xs">
              ← Return to Financial Operations
            </Button>
          </Link>
        }
      />

      {/* Role Disclaimer Banner */}
      <div className="bg-purple-950/40 border border-purple-800/60 rounded-lg p-3 text-purple-300 flex items-center justify-between">
        <span className="font-bold flex items-center gap-2">
          <span>🛡️ Active Role Simulator: {role.name} ({role.id})</span>
        </span>
        <span className="italic text-purple-400 text-[11px]">
          “Prototype role simulation — not production authorization.”
        </span>
      </div>

      <div className="space-y-6">
        <div className="space-y-3">
          <h3 className="font-bold text-slate-200 uppercase tracking-wider text-xs">
            Standard Refund Requests ({refunds.length})
          </h3>
          <DataTable columns={columns} rows={refunds} emptyTitle="No refund requests." emptyLine="Cancelled paid bookings automatically trigger refund requests." />
        </div>

        <div className="space-y-3 border-t border-white/5 pt-6">
          <h3 className="font-bold text-slate-200 uppercase tracking-wider text-xs text-brand">
            ⚠️ Recommended Refund Exceptions Awaiting Finance Approval ({exceptions.length})
          </h3>
          <DataTable columns={exceptionColumns} rows={exceptions} emptyTitle="No recommended exceptions." emptyLine="Incident or dispute exceptions recommended by dispatchers appear here." />
        </div>
      </div>
    </div>
  );
}
