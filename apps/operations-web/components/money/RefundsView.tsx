"use client";

import { Suspense, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight, Check, X } from "lucide-react";
import { Badge, Button, Card, CopyIdPill, DataTable, Drawer, Empty, ErrorState, PageHeader, Skeleton, SkeletonRows, Tabs, Truncated, type Column } from "@/components/pulse";
import { ReadOnly } from "@/components/trust/TrustBits";
import { PageContainer } from "@/components/shell/PageContainer";
import { useAdminSession } from "@/lib/firebase/auth";
import { RequestIdBook } from "@/lib/console/actions";
import { CALLABLE_CAPABILITY, can } from "@/lib/console/capabilities";
import { formatPaise } from "@/lib/console/money";
import { AWAITING_SECOND_APPROVER, refundOutcome } from "@/lib/console/outcomes";
import { decideRefund } from "@/lib/governance-api";
import { useNow } from "@/lib/hooks";
import {
  REFUND_REJECT_CONSEQUENCE,
  REFUND_TABS,
  filterRefunds,
  refundApproveConsequence,
  refundCounts,
  refundDecision,
  refundStageBadge,
  toRefundRow,
  waitingAmount,
  who,
  type RefundRow,
  type RefundTab,
} from "@/lib/money-views";
import { useGovernanceCollection } from "@/lib/use-governance";
import { useSearchParamSetter, useTabParam } from "@/lib/use-search-param";
import { Age, DecisionSheet, Field, Fields, Gone, Note, OrgLink, SectionTitle, When, useOrgNames, type DecisionSpec } from "./MoneyBits";

const TAB_IDS = REFUND_TABS.map((t) => t.id);

const EMPTY: Record<RefundTab, { emoji: string; title: string; body: string }> = {
  decide: { emoji: "🧾", title: "Nothing to decide", body: "Policy refunds are processed automatically; organizer requests and exceptions appear here." },
  second: { emoji: "🤝", title: "No second approvals waiting", body: "Refunds above ₹10,000 land here after the first admin approves them." },
  decided: { emoji: "🗂️", title: "Nothing decided yet", body: "Approved, rejected and completed refunds move here." },
  all: { emoji: "↩️", title: "No refunds yet", body: "Policy refunds are processed automatically; exceptions appear here." },
};

export function RefundsView() {
  return (
    <Suspense
      fallback={
        <PageContainer className="flex flex-col gap-6">
          <Skeleton className="h-10 w-64 rounded-pill" />
          <SkeletonRows rows={5} />
        </PageContainer>
      }
    >
      <Refunds />
    </Suspense>
  );
}

function Refunds() {
  const { records, loading, error, truncated, refresh } = useGovernanceCollection("refunds");
  const params = useSearchParams();
  const setParam = useSearchParamSetter();
  const [tab, setTab] = useTabParam(TAB_IDS, "decide");
  const now = useNow();
  const rows = useMemo(() => records.map((r) => toRefundRow(r.id, r.raw)), [records]);
  const counts = useMemo(() => refundCounts(rows), [rows]);
  const shown = useMemo(() => filterRefunds(rows, tab), [rows, tab]);
  const names = useOrgNames(useMemo(() => rows.map((r) => r.orgId), [rows]), "refunds");
  const waiting = counts.decide + counts.second;
  const waitingMinor = waitingAmount(rows);
  const ready = !loading && !error;
  const selectedId = params.get("refund");
  const selected = selectedId ? rows.find((r) => r.id === selectedId) ?? null : null;

  const columns: Array<Column<RefundRow>> = [
    {
      key: "amount",
      header: "Amount",
      align: "right",
      sort: (a, b) => (a.amountMinor ?? -1) - (b.amountMinor ?? -1),
      cell: (r) => <span className="num font-display text-[15px] font-bold text-text">{formatPaise(r.amountMinor, r.currency)}</span>,
    },
    {
      key: "reason",
      header: "Reason",
      cell: (r) => (
        <div className="max-w-[320px]">
          <div className="text-[13px] font-semibold text-text">{r.reasonLabel}</div>
          {r.note ? <div className="mt-0.5 line-clamp-1 text-[12px] text-text-3">“{r.note}”</div> : null}
        </div>
      ),
    },
    { key: "org", header: "Organizer", cell: (r) => <OrgLink id={r.orgId} names={names} className="text-[13px]" /> },
    { key: "age", header: "Age", sort: (a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0), cell: (r) => <Age at={r.createdAt} now={now} /> },
    {
      key: "stage",
      header: "Stage",
      cell: (r) => {
        const b = refundStageBadge(r);
        return (
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge tone={b.tone}>{b.label}</Badge>
            {r.dual && r.stage === "needs-decision" ? <Badge tone="info">2 admins</Badge> : null}
          </span>
        );
      },
    },
  ];

  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader
        overline="Money"
        title={
          <>
            Refunds
            {ready && waiting > 0 ? (
              <>
                {" "}
                <em className="hl">{waiting} waiting</em>
              </>
            ) : null}
          </>
        }
        subtitle="Organizer-requested and out-of-policy refunds wait here for a platform decision. Organizers never approve refunds. Above ₹10,000 two different admins must approve (dual control)."
      />

      {ready && waiting > 0 ? (
        <ul aria-label="Refund summary" className="flex flex-wrap gap-2 text-[12px]">
          <li className="inline-flex items-center gap-2 rounded-pill border border-line-soft bg-[rgba(255,255,255,0.03)] px-3 py-1.5">
            <span className="text-text-3">Waiting on a decision</span>
            <b className="num text-[13px] text-text">{formatPaise(waitingMinor)}</b>
          </li>
        </ul>
      ) : null}

      <Tabs label="Refund stage" tabs={REFUND_TABS.map((t) => ({ ...t, count: ready ? counts[t.id] : undefined }))} value={tab} onChange={setTab} />

      {error ? (
        <Card>
          <ErrorState message={error} onRetry={refresh} />
        </Card>
      ) : (
        <DataTable
          rows={shown}
          columns={columns}
          rowKey={(r) => r.id}
          loading={loading}
          onRowClick={(r) => setParam("refund", r.id)}
          caption="Refunds, newest first"
          className="max-h-[70vh]"
          empty={<Empty {...EMPTY[tab]} />}
        />
      )}
      {ready && truncated ? <Truncated shown={records.length} /> : null}

      <RefundDrawer open={!!selectedId} loading={loading} row={selected} names={names} now={now} onClose={() => setParam("refund", null)} />
    </PageContainer>
  );
}

function RefundDrawer({ open, loading, row, names, now, onClose }: { open: boolean; loading: boolean; row: RefundRow | null; names: Record<string, string | null>; now: Date | null; onClose: () => void }) {
  const { user, consoleRole: role } = useAdminSession();
  const permitted = can(role, CALLABLE_CAPABILITY.decideRefund);
  const book = useRef(new RequestIdBook("refund"));
  const [sheet, setSheet] = useState<"approve" | "reject" | null>(null);

  const amount = row ? formatPaise(row.amountMinor, row.currency) : "—";
  const d = row ? refundDecision(row, user?.uid) : null;
  const badge = row ? refundStageBadge(row) : null;

  const spec: DecisionSpec | null =
    row && d && sheet
      ? sheet === "approve"
        ? {
            idKey: `${row.id}-approve`,
            title: `${d.approveLabel} of ${amount}?`,
            consequence: refundApproveConsequence(row, amount),
            confirmLabel: d.approveLabel,
            tone: "volt",
            phrase: d.phrase,
            reasonMin: 10,
            execute: async (requestId, note) => {
              const result = await decideRefund({ requestId, refundId: row.id, decision: "approve", note });
              const out = refundOutcome(result.status, "approve");
              return { tone: out.tone === "info" ? "info" : "ok", title: out.tone === "info" ? AWAITING_SECOND_APPROVER : `Refund approved · ${amount}`, body: out.message };
            },
          }
        : {
            idKey: `${row.id}-reject`,
            title: `Reject the ${amount} refund?`,
            consequence: REFUND_REJECT_CONSEQUENCE,
            confirmLabel: "Reject refund",
            tone: "danger",
            reasonMin: 10,
            execute: async (requestId, note) => {
              const result = await decideRefund({ requestId, refundId: row.id, decision: "reject", note });
              const out = refundOutcome(result.status, "reject");
              return { tone: out.tone === "info" ? "info" : "ok", title: `Refund rejected · ${amount}`, body: out.message };
            },
          }
      : null;

  return (
    <>
      <Drawer open={open} title={row ? `Refund · ${row.reasonLabel}` : loading ? "Loading refund…" : "Refund unavailable"} onClose={onClose}>
        {!row && loading ? (
          <SkeletonRows rows={4} />
        ) : !row || !d || !badge ? (
          <Gone noun="refund" />
        ) : (
          <div className="flex flex-col gap-6">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={badge.tone}>{badge.label}</Badge>
                {row.dual ? <Badge tone="info">Dual control</Badge> : null}
                <CopyIdPill id={row.id} noun="refund" />
              </div>
              <p className="num mt-3 font-display text-[40px] font-bold leading-none tracking-[-0.03em] text-text">{amount}</p>
              <p className="mt-2 text-[14px] text-text-2">
                {row.reasonLabel}
                {row.note ? <span className="text-text-3"> · “{row.note}”</span> : null}
              </p>
            </div>

            {row.stage === "awaiting-second-approver" ? (
              <Note tone="warn">
                <strong>{AWAITING_SECOND_APPROVER}.</strong> One admin approved this refund. A different Platform Owner or Super Admin must give the second approval; the server refuses a second approval from the same admin.
              </Note>
            ) : null}
            {d.approvedByMe && row.stage === "awaiting-second-approver" ? <Note tone="warn">You gave the first approval. The server will refuse a second approval from your account.</Note> : null}
            {row.stage === "needs-decision" && row.dual ? <Note>Dual control applies: this refund is above ₹10,000 and needs approvals from two different admins.</Note> : null}

            <section aria-label="Approvals" className="flex items-center gap-3 rounded-control border border-line-soft px-4 py-3">
              <span className="text-[13px] text-text-3">Approvals</span>
              <span className="flex items-center gap-1.5" aria-hidden>
                {Array.from({ length: row.dual ? 2 : 1 }, (_, i) => (
                  <span key={i} className={i < row.approvals.length ? "h-2.5 w-6 rounded-pill bg-ok" : "h-2.5 w-6 rounded-pill bg-[rgba(255,255,255,0.1)]"} />
                ))}
              </span>
              <b className="num text-[13px] text-text">
                {row.approvals.length} of {row.dual ? 2 : 1}
              </b>
            </section>

            <section aria-label="Linked records" className="flex flex-wrap gap-2">
              {row.orgId ? (
                <span className="inline-flex h-9 items-center gap-2 rounded-pill border border-line bg-surface-high px-3.5 text-[13px]">
                  <span className="text-text-3">Organizer</span>
                  <OrgLink id={row.orgId} names={names} />
                </span>
              ) : null}
              {row.eventId ? (
                <Link
                  href={`/events/${encodeURIComponent(row.eventId)}${row.bookingId ? `?booking=${encodeURIComponent(row.bookingId)}` : ""}`}
                  className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-pill border border-line bg-surface-high px-3.5 text-[13px] font-semibold text-text hover:bg-surface-top"
                >
                  {row.bookingId ? "Booking" : "Event"}
                  <span className="max-w-[140px] truncate font-mono text-[11px] font-normal text-text-3">{row.bookingId ?? row.eventId}</span>
                  <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
                </Link>
              ) : null}
            </section>

            <Fields label="Refund details">
              <Field label="Status">{row.status ?? "—"}</Field>
              <Field label="Event" mono>{row.eventId ?? "—"}</Field>
              <Field label="Booking" mono>{row.bookingId ?? "—"}</Field>
              <Field label="Requested by" mono>{who(row.requestedBy, user?.uid)}</Field>
              <Field label="Approved by" mono>{row.approvals.length ? row.approvals.map((a) => who(a, user?.uid)).join(", ") : "—"}</Field>
              <Field label="Decided by" mono>{who(row.decidedBy, user?.uid)}</Field>
              <Field label="Provider refund" mono>{row.providerRefundId ?? "—"}</Field>
              <Field label="Last error">{row.lastError ?? "—"}</Field>
              <Field label="Created"><When at={row.createdAt} now={now} /></Field>
              <Field label="Updated"><When at={row.updatedAt} now={now} /></Field>
            </Fields>

            <section aria-label="Refund decision" className="flex flex-col gap-3">
              <SectionTitle>Decision</SectionTitle>
              {!permitted ? (
                <ReadOnly role={role} what="refunds" />
              ) : d.closed ? (
                <p className="text-[13px] text-text-3">{d.closed}</p>
              ) : (
                <div className="flex flex-wrap items-center gap-2" data-testid="refund-actions">
                  <Button variant="volt" icon={<Check />} onClick={() => setSheet("approve")}>
                    {d.approveLabel}
                  </Button>
                  <Button variant="danger" icon={<X />} onClick={() => setSheet("reject")}>
                    Reject refund
                  </Button>
                </div>
              )}
            </section>
          </div>
        )}
      </Drawer>
      <DecisionSheet spec={spec} book={book.current} onClose={() => setSheet(null)} />
    </>
  );
}
