"use client";

import { Suspense, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Handshake, X } from "lucide-react";
import { Badge, Button, Card, CopyIdPill, DataTable, Drawer, Empty, ErrorState, PageHeader, Skeleton, SkeletonRows, Tabs, Truncated, type Column } from "@/components/pulse";
import { ReadOnly } from "@/components/trust/TrustBits";
import { PageContainer } from "@/components/shell/PageContainer";
import { useAdminSession } from "@/lib/firebase/auth";
import { RequestIdBook } from "@/lib/console/actions";
import { CALLABLE_CAPABILITY, can } from "@/lib/console/capabilities";
import { decideCommercialAgreement } from "@/lib/governance-api";
import { useNow } from "@/lib/hooks";
import {
  AGREEMENT_TABS,
  agreementConsequence,
  agreementCounts,
  agreementDecision,
  agreementStatusBadge,
  filterAgreements,
  sortAgreements,
  termsInForce,
  toAgreementRow,
  who,
  type AgreementRow,
  type AgreementTab,
} from "@/lib/money-views";
import { commissionLabel } from "@/lib/organizers";
import { useGovernanceCollection } from "@/lib/use-governance";
import { useSearchParamSetter, useTabParam } from "@/lib/use-search-param";
import { Age, DecisionSheet, Field, Fields, Gone, Note, OrgLink, SectionTitle, When, useOrgNames, type DecisionSpec } from "./MoneyBits";
import { ProposeTermsSheet } from "./ProposeTermsSheet";

const TAB_IDS = AGREEMENT_TABS.map((t) => t.id);

const EMPTY: Record<AgreementTab, { emoji: string; title: string; body: string }> = {
  pending: { emoji: "🤝", title: "Nothing waiting", body: "Proposed terms wait here until a different admin approves or rejects them." },
  inforce: { emoji: "📄", title: "No terms in force", body: "An organizer can publish events only once their terms are approved." },
  history: { emoji: "🗂️", title: "No history yet", body: "Rejected and superseded versions are kept here." },
  all: { emoji: "📄", title: "No commercial terms yet", body: "Propose terms for an organizer once the agreement is signed." },
};

export function CommercialsView() {
  return (
    <Suspense
      fallback={
        <PageContainer className="flex flex-col gap-6">
          <Skeleton className="h-10 w-64 rounded-pill" />
          <SkeletonRows rows={5} />
        </PageContainer>
      }
    >
      <Commercials />
    </Suspense>
  );
}

function Commercials() {
  const { consoleRole: role } = useAdminSession();
  const canPropose = can(role, CALLABLE_CAPABILITY.proposeCommercialAgreement);
  const { records, loading, error, truncated, refresh } = useGovernanceCollection("commercialAgreements");
  const params = useSearchParams();
  const setParam = useSearchParamSetter();
  const [tab, setTab] = useTabParam(TAB_IDS, "pending");
  const now = useNow();
  const [proposing, setProposing] = useState(false);
  const rows = useMemo(() => sortAgreements(records.map((r) => toAgreementRow(r.id, r.raw))), [records]);
  const counts = useMemo(() => agreementCounts(rows), [rows]);
  const shown = useMemo(() => filterAgreements(rows, tab), [rows, tab]);
  const names = useOrgNames(useMemo(() => rows.map((r) => r.orgId), [rows]), "commercials");
  const ready = !loading && !error;
  const selectedId = params.get("agreement");
  const selected = selectedId ? rows.find((r) => r.id === selectedId) ?? null : null;

  const columns: Array<Column<AgreementRow>> = [
    { key: "org", header: "Organizer", cell: (r) => <OrgLink id={r.orgId} names={names} className="text-[13px]" /> },
    {
      key: "commission",
      header: "Commission",
      align: "right",
      sort: (a, b) => (a.commissionBps ?? -1) - (b.commissionBps ?? -1),
      cell: (r) => <span className="num font-display text-[15px] font-bold text-text">{commissionLabel(r.commissionBps)}</span>,
    },
    { key: "cadence", header: "Payout", cell: (r) => <span className="text-[13px] capitalize text-text-2">{r.cadence ?? "—"}</span> },
    { key: "age", header: "Proposed", sort: (a, b) => (a.proposedAt?.getTime() ?? 0) - (b.proposedAt?.getTime() ?? 0), cell: (r) => <Age at={r.proposedAt} now={now} /> },
    {
      key: "status",
      header: "Status",
      cell: (r) => {
        const b = agreementStatusBadge(r);
        return <Badge tone={b.tone}>{b.label}</Badge>;
      },
    },
  ];

  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader
        overline="Money"
        title={
          <>
            Commercial terms
            {ready && counts.pending > 0 ? (
              <>
                {" "}
                <em className="hl">{counts.pending} pending</em>
              </>
            ) : null}
          </>
        }
        subtitle="Versioned commission and payout terms per organizer. An organizer can publish events only with approved terms; the commission is copied onto each event when it's published. One admin proposes, a different admin approves."
        actions={
          canPropose ? (
            <Button variant="primary" icon={<Handshake />} onClick={() => setProposing(true)}>
              Propose terms
            </Button>
          ) : null
        }
      />

      <Tabs label="Terms status" tabs={AGREEMENT_TABS.map((t) => ({ ...t, count: ready ? counts[t.id] : undefined }))} value={tab} onChange={setTab} />

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
          onRowClick={(r) => setParam("agreement", r.id)}
          caption="Commercial terms, pending first"
          className="max-h-[70vh]"
          empty={<Empty {...EMPTY[tab]} />}
        />
      )}
      {ready && truncated ? <Truncated shown={records.length} /> : null}

      <AgreementDrawer open={!!selectedId} loading={loading} row={selected} names={names} now={now} onClose={() => setParam("agreement", null)} />
      <ProposeTermsSheet open={proposing} terms={(orgId) => termsInForce(rows, orgId)} reasonLabel="Basis (signed agreement reference)" onClose={() => setProposing(false)} />
    </PageContainer>
  );
}

function AgreementDrawer({ open, loading, row, names, now, onClose }: { open: boolean; loading: boolean; row: AgreementRow | null; names: Record<string, string | null>; now: Date | null; onClose: () => void }) {
  const { user, consoleRole: role } = useAdminSession();
  const permitted = can(role, CALLABLE_CAPABILITY.decideCommercialAgreement);
  const book = useRef(new RequestIdBook("agreement"));
  const [action, setAction] = useState<"approve" | "reject" | null>(null);

  const percent = row ? commissionLabel(row.commissionBps) : "—";
  const d = row ? agreementDecision(row, user?.uid) : null;
  const badge = row ? agreementStatusBadge(row) : null;

  const spec: DecisionSpec | null =
    row && action
      ? {
          idKey: `${row.id}-${action}`,
          title: action === "approve" ? `Approve ${percent} commission?` : `Reject ${percent} commission?`,
          consequence: agreementConsequence(action, percent),
          confirmLabel: action === "approve" ? "Approve terms" : "Reject terms",
          tone: action === "approve" ? "volt" : "danger",
          reasonMin: 10,
          execute: async (requestId, note) => {
            const result = await decideCommercialAgreement({ requestId, agreementId: row.id, action, note });
            return result.status === "approved"
              ? { tone: "ok", title: `Terms approved · ${percent}`, body: `Terms approved${result.supersededId ? `; ${result.supersededId} superseded` : ""}.` }
              : { tone: "ok", title: `Terms rejected · ${percent}`, body: "Terms rejected." };
          },
        }
      : null;

  return (
    <>
      <Drawer open={open} title={row ? `Terms · ${percent} commission` : loading ? "Loading terms…" : "Terms unavailable"} onClose={onClose}>
        {!row && loading ? (
          <SkeletonRows rows={4} />
        ) : !row || !d || !badge ? (
          <Gone noun="agreement" />
        ) : (
          <div className="flex flex-col gap-6">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={badge.tone}>{badge.label}</Badge>
                <CopyIdPill id={row.id} noun="agreement" />
              </div>
              <p className="num mt-3 font-display text-[40px] font-bold leading-none tracking-[-0.03em] text-text">{percent}</p>
              <p className="mt-2 flex flex-wrap items-center gap-x-2 text-[14px] text-text-2">
                <span>Commission for</span>
                <OrgLink id={row.orgId} names={names} />
                <span className="text-text-3">· paid out {row.cadence ?? "—"}</span>
              </p>
            </div>

            {d.pending && d.proposedByMe ? <Note tone="warn">You proposed these terms, so the server will refuse a decision from your account.</Note> : null}

            <Fields label="Terms details">
              <Field label="Commission">{percent}</Field>
              <Field label="Payout cadence">{row.cadence ?? "—"}</Field>
              <Field label="Status">{row.status ?? "—"}</Field>
              <Field label="Basis">{row.note ?? "—"}</Field>
              <Field label="Proposed by" mono>{who(row.proposedBy, user?.uid)}</Field>
              <Field label="Proposed"><When at={row.proposedAt} now={now} /></Field>
              <Field label="Decided by" mono>{who(row.decidedBy, user?.uid)}</Field>
              <Field label="Decision note">{row.decisionNote ?? "—"}</Field>
              <Field label="Superseded by" mono>{row.supersededBy ?? "—"}</Field>
            </Fields>

            <section aria-label="Terms decision" className="flex flex-col gap-3">
              <SectionTitle>Decision</SectionTitle>
              {!permitted ? (
                <ReadOnly role={role} what="commercial terms" />
              ) : !d.pending ? (
                <p className="text-[13px] text-text-3">No decisions are available while these terms are {row.status ?? "—"}.</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2" data-testid="agreement-actions">
                    <Button variant="volt" icon={<Check />} disabled={!!d.blocked} onClick={() => setAction("approve")}>
                      Approve terms
                    </Button>
                    <Button variant="danger" icon={<X />} disabled={!!d.blocked} onClick={() => setAction("reject")}>
                      Reject terms
                    </Button>
                  </div>
                  {d.blocked ? <p className="text-[12px] text-text-3">{d.blocked}</p> : null}
                </>
              )}
            </section>
          </div>
        )}
      </Drawer>
      <DecisionSheet spec={spec} book={book.current} onClose={() => setAction(null)} />
    </>
  );
}
