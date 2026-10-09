"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Banknote, Check, Hammer, PauseCircle, PlayCircle } from "lucide-react";
import { Badge, Button, Card, CopyIdPill, DataTable, Drawer, Empty, ErrorState, PageHeader, Skeleton, SkeletonRows, Tabs, Truncated, type Column } from "@/components/pulse";
import { ReadOnly } from "@/components/trust/TrustBits";
import { PageContainer } from "@/components/shell/PageContainer";
import { useAdminSession } from "@/lib/firebase/auth";
import { RequestIdBook, type SettlementAction } from "@/lib/console/actions";
import { CALLABLE_CAPABILITY, can } from "@/lib/console/capabilities";
import { settlementOutcome } from "@/lib/console/outcomes";
import { formatDate } from "@/lib/console/records";
import { cn, inrMinor } from "@/lib/format";
import { buildSettlement, decideSettlement } from "@/lib/governance-api";
import { useNow } from "@/lib/hooks";
import {
  BUILD_SETTLEMENT_CONSEQUENCE,
  SETTLEMENT_TABS,
  buildKey,
  filterSettlements,
  needsSecondPayer,
  needsSettlementAction,
  settlementButtons,
  settlementConsequence,
  settlementCounts,
  settlementKey,
  settlementStatusBadge,
  toSettlementRow,
  todayIst,
  who,
  type SettlementRow,
  type SettlementTab,
} from "@/lib/money-views";
import { useGovernanceCollection } from "@/lib/use-governance";
import { useSearchParamSetter, useTabParam } from "@/lib/use-search-param";
import { Age, DecisionSheet, Field, Fields, Gone, Note, OrgLink, OrgPicker, SectionTitle, When, useOrgNames, type DecisionSpec } from "./MoneyBits";

const TAB_IDS = SETTLEMENT_TABS.map((t) => t.id);

const EMPTY: Record<SettlementTab, { emoji: string; title: string; body: string }> = {
  approve: { emoji: "🧮", title: "Nothing to approve", body: "Settlements built from completed events wait here for approval." },
  pay: { emoji: "🏦", title: "No payouts to send", body: "Approved settlements wait here until the bank transfer is recorded." },
  held: { emoji: "⏸️", title: "Nothing on hold", body: "Settlements held for a fraud or dispute review appear here." },
  paid: { emoji: "✅", title: "Nothing paid yet", body: "Settlements marked paid, with their bank reference, move here." },
  all: { emoji: "🏦", title: "No settlements yet", body: "Build one for an organizer once their events are completed." },
};

const ICON: Record<SettlementAction, ReactNode> = { approve: <Check />, hold: <PauseCircle />, "release-hold": <PlayCircle />, "mark-paid": <Banknote /> };

export function SettlementsView() {
  return (
    <Suspense
      fallback={
        <PageContainer className="flex flex-col gap-6">
          <Skeleton className="h-10 w-64 rounded-pill" />
          <SkeletonRows rows={5} />
        </PageContainer>
      }
    >
      <Settlements />
    </Suspense>
  );
}

function Settlements() {
  const { consoleRole: role } = useAdminSession();
  const canBuild = can(role, CALLABLE_CAPABILITY.buildSettlement);
  const { records, loading, error, truncated, refresh } = useGovernanceCollection("settlements");
  const params = useSearchParams();
  const setParam = useSearchParamSetter();
  const [tab, setTab] = useTabParam(TAB_IDS, "approve");
  const now = useNow();
  const [building, setBuilding] = useState(false);
  const rows = useMemo(() => records.map((r) => toSettlementRow(r.id, r.raw)), [records]);
  const counts = useMemo(() => settlementCounts(rows), [rows]);
  const shown = useMemo(() => filterSettlements(rows, tab), [rows, tab]);
  const names = useOrgNames(useMemo(() => rows.map((r) => r.orgId), [rows]), "settlements");
  const attention = rows.filter(needsSettlementAction).length;
  const ready = !loading && !error;
  const selectedId = params.get("settlement");
  const selected = selectedId ? rows.find((r) => r.id === selectedId) ?? null : null;

  const columns: Array<Column<SettlementRow>> = [
    { key: "org", header: "Organizer", cell: (r) => <OrgLink id={r.orgId} names={names} className="text-[13px]" /> },
    { key: "period", header: "Period end", sort: (a, b) => (a.periodEnd?.getTime() ?? 0) - (b.periodEnd?.getTime() ?? 0), cell: (r) => <span className="whitespace-nowrap text-[13px] text-text-2">{formatDate(r.periodEnd)}</span> },
    {
      key: "net",
      header: "Net payable",
      align: "right",
      sort: (a, b) => (a.netMinor ?? -1) - (b.netMinor ?? -1),
      cell: (r) => <span className="num font-display text-[15px] font-bold text-text">{inrMinor(r.netMinor)}</span>,
    },
    { key: "entries", header: "Entries", align: "right", cell: (r) => <span className="num text-[13px] text-text-2">{r.entryCount ?? "—"}</span> },
    { key: "age", header: "Built", sort: (a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0), cell: (r) => <Age at={r.createdAt} now={now} /> },
    {
      key: "status",
      header: "Status",
      cell: (r) => {
        const b = settlementStatusBadge(r);
        return (
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge tone={b.tone}>{b.label}</Badge>
            {needsSecondPayer(r) ? <Badge tone="warn">Needs 2nd admin to pay</Badge> : null}
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
            Settlements
            {ready && attention > 0 ? (
              <>
                {" "}
                <em className="hl">{attention} need action</em>
              </>
            ) : null}
          </>
        }
        subtitle="Organizer payouts built from the ledger of completed events. Approve, hold, release or mark paid with the bank reference. Above ₹50,000 the admin who approved cannot also mark it paid."
        actions={
          canBuild ? (
            <Button variant="primary" icon={<Hammer />} onClick={() => setBuilding(true)}>
              Build settlement
            </Button>
          ) : null
        }
      />

      <Tabs label="Settlement stage" tabs={SETTLEMENT_TABS.map((t) => ({ ...t, count: ready ? counts[t.id] : undefined }))} value={tab} onChange={setTab} />

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
          onRowClick={(r) => setParam("settlement", r.id)}
          caption="Settlements, newest first"
          className="max-h-[70vh]"
          empty={<Empty {...EMPTY[tab]} />}
        />
      )}
      {ready && truncated ? <Truncated shown={records.length} /> : null}

      <SettlementDrawer open={!!selectedId} loading={loading} row={selected} names={names} now={now} onClose={() => setParam("settlement", null)} />
      <BuildSheet open={building} now={now} onClose={() => setBuilding(false)} />
    </PageContainer>
  );
}

function BuildSheet({ open, now, onClose }: { open: boolean; now: Date | null; onClose: () => void }) {
  // Its own book: a build never shares an id with a drawer decision.
  const book = useRef(new RequestIdBook("build"));
  const [orgId, setOrgId] = useState("");
  const [date, setDate] = useState("");
  const today = now ? todayIst(now) : undefined;
  useEffect(() => {
    if (!open) return;
    setOrgId("");
    setDate(todayIst(new Date()));
  }, [open]);

  const spec: DecisionSpec | null = open
    ? {
        idKey: buildKey(orgId, date),
        title: "Build settlement",
        consequence: BUILD_SETTLEMENT_CONSEQUENCE,
        confirmLabel: "Build settlement",
        tone: "volt",
        reasonMin: 0,
        validate: () => (!orgId.trim() ? "Choose the organizer to settle." : !date ? "Choose the period end date." : null),
        fields: (
          <div className="flex flex-col gap-4">
            <OrgPicker value={orgId} onChange={setOrgId} enabled={open} />
            <label className="block">
              <span className="text-[12px] font-semibold text-text-3">Period end (inclusive, IST)</span>
              <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className="field mt-1.5 h-11 w-full rounded-control px-3.5 text-[14px] text-text [color-scheme:dark]" />
              <span className="mt-1.5 block text-[12px] text-text-3">Must not be in the future. Today is clamped to the current time.</span>
            </label>
          </div>
        ),
        execute: async (requestId) => {
          const result = await buildSettlement({ requestId, orgId, periodEndDate: date });
          if (!result.settlementId || result.status === "empty") {
            return { tone: "info", title: "Nothing to settle", body: "Nothing to settle: there are no unsettled ledger entries from completed events for this organizer up to that date." };
          }
          return { tone: "ok", title: "Settlement built", body: `Settlement ${result.settlementId} built: ${result.entryCount} entries, net ${inrMinor(result.netMinor)} (status: ${result.status}).` };
        },
      }
    : null;

  return <DecisionSheet spec={spec} book={book.current} onClose={onClose} />;
}

function MoneyTile({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("rounded-control border px-4 py-3", strong ? "border-[rgba(142,114,255,0.35)] bg-[rgba(142,114,255,0.1)]" : "border-line-soft bg-[rgba(255,255,255,0.02)]")}>
      <div className="text-[12px] text-text-3">{label}</div>
      <div className={cn("num mt-1 font-display font-bold text-text", strong ? "text-[20px]" : "text-[16px]")}>{value}</div>
    </div>
  );
}

function SettlementDrawer({
  open,
  loading,
  row,
  names,
  now,
  onClose,
}: {
  open: boolean;
  loading: boolean;
  row: SettlementRow | null;
  names: Record<string, string | null>;
  now: Date | null;
  onClose: () => void;
}) {
  const { user, consoleRole: role } = useAdminSession();
  const permitted = can(role, CALLABLE_CAPABILITY.decideSettlement);
  const book = useRef(new RequestIdBook("settlement"));
  const [action, setAction] = useState<SettlementAction | null>(null);
  const [payoutRef, setPayoutRef] = useState("");
  useEffect(() => setPayoutRef(""), [action]);

  const net = row ? inrMinor(row.netMinor) : "—";
  const buttons = row ? settlementButtons(row.status) : [];
  const chosen = buttons.find((b) => b.action === action) ?? null;
  const approvedByMe = !!row && !!user && row.approvedBy === user.uid;
  const badge = row ? settlementStatusBadge(row) : null;

  const spec: DecisionSpec | null =
    row && chosen
      ? {
          idKey: settlementKey(row, chosen.action, payoutRef),
          title: `${chosen.label} · ${net}?`,
          consequence: settlementConsequence(chosen.action, net, row.dual),
          confirmLabel: chosen.label,
          tone: chosen.tone,
          phrase: chosen.phrase,
          reasonMin: 10,
          validate: chosen.action === "mark-paid" ? () => (payoutRef.trim() ? null : "Enter the bank or payout reference (3–100 characters).") : undefined,
          fields:
            chosen.action === "mark-paid" ? (
              <label className="block">
                <span className="text-[12px] font-semibold text-text-3">Payout / bank reference (UTR)</span>
                <input value={payoutRef} onChange={(e) => setPayoutRef(e.target.value)} placeholder="e.g. UTR123456789" autoComplete="off" spellCheck={false} className="field mt-1.5 h-11 w-full rounded-control px-3.5 font-mono text-[14px] text-text" />
              </label>
            ) : undefined,
          execute: async (requestId, note) => {
            const result = await decideSettlement({ requestId, settlementId: row.id, action: chosen.action, note, payoutReference: chosen.action === "mark-paid" ? payoutRef : undefined });
            return { tone: "ok", title: `${chosen.label} · ${net}`, body: settlementOutcome(chosen.action, result.status) };
          },
        }
      : null;

  return (
    <>
      <Drawer open={open} title={row ? `Settlement · ${formatDate(row.periodEnd)}` : loading ? "Loading settlement…" : "Settlement unavailable"} onClose={onClose}>
        {!row && loading ? (
          <SkeletonRows rows={4} />
        ) : !row || !badge ? (
          <Gone noun="settlement" />
        ) : (
          <div className="flex flex-col gap-6">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={badge.tone}>{badge.label}</Badge>
                {row.dual ? <Badge tone="info">Dual control</Badge> : null}
                <CopyIdPill id={row.id} noun="settlement" />
              </div>
              <p className="num mt-3 font-display text-[40px] font-bold leading-none tracking-[-0.03em] text-text">{net}</p>
              <p className="mt-2 flex flex-wrap items-center gap-x-2 text-[14px] text-text-2">
                <span>Net payable to</span>
                <OrgLink id={row.orgId} names={names} />
                <span className="text-text-3">· period ending {formatDate(row.periodEnd)}</span>
              </p>
            </div>

            {row.status === "approved" && row.dual && approvedByMe ? (
              <Note tone="warn">You approved this settlement. It is above ₹50,000, so a different admin must mark it paid; the server will refuse it from your account.</Note>
            ) : null}
            {needsSecondPayer(row) && !approvedByMe ? <Note>Above ₹50,000: the admin who approved it can’t also mark it paid.</Note> : null}

            <section aria-label="Money split" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MoneyTile label="Gross" value={inrMinor(row.grossMinor)} />
              <MoneyTile label="Commission" value={inrMinor(row.commissionMinor)} />
              <MoneyTile label="Refunds" value={inrMinor(row.refundsMinor)} />
              <MoneyTile label="Net payable" value={net} strong />
            </section>

            <Fields label="Settlement details">
              <Field label="Ledger entries">{row.entryCount ?? "—"}</Field>
              <Field label="Status">{row.status ?? "—"}</Field>
              <Field label="Held from">{row.heldFrom ?? "—"}</Field>
              <Field label="Built by" mono>{who(row.builtBy, user?.uid)}</Field>
              <Field label="Approved by" mono>{who(row.approvedBy, user?.uid)}</Field>
              <Field label="Paid by" mono>{who(row.paidBy, user?.uid)}</Field>
              <Field label="Payout reference" mono>{row.payoutReference ?? "—"}</Field>
              <Field label="Created"><When at={row.createdAt} now={now} /></Field>
            </Fields>

            <section aria-label="Settlement decision" className="flex flex-col gap-3">
              <SectionTitle>Decision</SectionTitle>
              {!permitted ? (
                <ReadOnly role={role} what="settlements" />
              ) : buttons.length === 0 ? (
                <p className="text-[13px] text-text-3">No decisions are available while the settlement is {row.status ?? "—"}.</p>
              ) : (
                <div className="flex flex-wrap items-center gap-2" data-testid="settlement-actions">
                  {buttons.map((b) => (
                    <Button key={b.action} variant={b.variant} icon={ICON[b.action]} onClick={() => setAction(b.action)}>
                      {b.label}
                    </Button>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </Drawer>
      <DecisionSheet spec={spec} book={book.current} onClose={() => setAction(null)} />
    </>
  );
}
