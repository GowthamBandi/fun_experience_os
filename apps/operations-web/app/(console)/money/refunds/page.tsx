"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { selectRefundList } from "@/lib/prototype/selectors/money";
import { sessionTitle } from "@/lib/prototype/selectors/lookups";
import { inr } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable, type Column } from "@/components/ui/table";
import { Button } from "@/components/ui/primitives";
import type { Refund } from "@/lib/prototype/entities";
import { BookingBackNavigation, RefundStatusBadge, RoleGate } from "@/components/bookings/shared";
import { Stagger, Item } from "@/components/motion/Motion";

export default function RefundsPage() {
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

  const exceptionColumns: Column<any>[] = [
    {
      key: "id",
      header: "Exception",
      render: (re) => <span className="font-mono text-ink-mut">{re.id}</span>,
    },
    {
      key: "booking",
      header: "Booking",
      render: (re) => (
        <span className="text-ink-sec">{re.bookingId || "Manual"}</span>
      ),
    },
    { key: "reason", header: "Reason", render: (re) => <span className="text-ink-sec">{re.reason}</span> },
    { key: "amount", header: "Amount", align: "right", render: (re) => <span className="font-mono text-red-400 font-bold">{inr(re.amount)}</span> },
    { key: "status", header: "Status", render: (re) => <RefundStatusBadge status={re.status as string} /> },
    { key: "notes", header: "Notes", render: (re) => <span className="text-ink-mut max-w-xs truncate">{re.notes || "—"}</span> },
    {
      key: "action",
      header: "",
      align: "right",
      render: (re) => (
        <RoleGate allowedRoles={["finance", "super-admin", "ops-manager"]} currentRole={role.id} tooltip="Requires Finance role">
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="primary"
              onClick={() => approveRefundException(re.id)}
              className="h-8 px-3 text-xs"
            >
              Approve
            </Button>
            <Button
              variant="ghost"
              onClick={() => rejectRefundException(re.id, "Rejected")}
              className="h-8 px-3 text-xs text-red-400"
            >
              Reject
            </Button>
          </div>
        </RoleGate>
      ),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6">
      <BookingBackNavigation label="Back to Money" href="/money" />
      
      <PageHeader
        overline="Financial Operations"
        title="Refunds"
        sub="Review and complete money that must be returned."
      />

      <Stagger className="space-y-4 pt-4">
        {refunds.length === 0 ? (
          <div className="glass p-8 text-center text-ink-mut rounded-xl">
            No refund requests at this time.
          </div>
        ) : (
          refunds.map((r) => {
            const booking = state.bookings.find(b => b.id === r.bookingId);
            const sessionId = booking?.sessionId || "";
            const eventName = sessionId ? sessionTitle(state, sessionId) : "Unknown Event";
            
            return (
              <Item key={r.id}>
                <div className="glass p-5 rounded-xl flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl font-bold text-ink-lum">{inr(r.amount)}</span>
                      <RefundStatusBadge status={r.status as string} />
                    </div>
                    <div className="text-sm text-ink-sec font-medium">
                      {eventName}
                    </div>
                    <div className="text-xs text-ink-mut flex items-center gap-2">
                      <span>Reason: {r.type}</span>
                      <span>•</span>
                      <span>Requested: {r.requestedAt}</span>
                      <span>•</span>
                      <Link href={`/bookings/${r.bookingId}`} className="text-brand hover:underline">
                        View Booking
                      </Link>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                    {(r.status === "requested" || r.status === "under-review") && (
                      <RoleGate allowedRoles={["finance", "super-admin", "ops-manager"]} currentRole={role.id} tooltip="Requires Finance role">
                        <div className="flex items-center gap-2">
                           <Button
                             variant="primary"
                             onClick={() => approveRefund(r.id, role.id)}
                           >
                             Approve Refund
                           </Button>
                           <Button
                             variant="ghost"
                             className="text-red-400 hover:text-red-300 hover:bg-red-950/30"
                             onClick={() => rejectRefund(r.id, "Rejected", role.id)}
                           >
                             Reject
                           </Button>
                        </div>
                      </RoleGate>
                    )}
                    {r.status === "approved" && (
                      <Button variant="secondary" disabled>
                        Complete
                      </Button>
                    )}
                  </div>
                </div>
              </Item>
            );
          })
        )}
      </Stagger>

      {exceptions.length > 0 && (
        <div className="mt-12 space-y-4">
          <h3 className="font-medium text-ink-sec text-sm">
            Exception Refunds
          </h3>
          <DataTable columns={exceptionColumns} rows={exceptions} emptyTitle="No exceptions." emptyLine="" />
        </div>
      )}
    </div>
  );
}
