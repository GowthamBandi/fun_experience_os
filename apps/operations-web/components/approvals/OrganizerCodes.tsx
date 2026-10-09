"use client";

import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { KeyRound, Search } from "lucide-react";
import { Badge, Button, Card, CopyIdPill, DataTable, Drawer, Empty, ErrorState, PageHeader, SkeletonRows, Truncated, type Column } from "@/components/pulse";
import { PageContainer } from "@/components/shell/PageContainer";
import { BackLink } from "@/components/shell/BackLink";
import { DecisionSheet, Field, Fields, Gone, Note, SectionTitle, type DecisionSpec } from "@/components/money/MoneyBits";
import { ReadOnly } from "@/components/trust/TrustBits";
import { ORGANIZER_CODE_WARNING, OrganizerCodeModal } from "@/components/governance/OrganizerCodeModal";
import { applicationActivation, reissueCodeKey } from "@/lib/approvals";
import { CONFIRM_PHRASES, RequestIdBook } from "@/lib/console/actions";
import { CALLABLE_CAPABILITY, can } from "@/lib/console/capabilities";
import { canReissueOrganizerCode, caseTargetFields, formatDateTime } from "@/lib/console/records";
import { useAdminSession } from "@/lib/firebase/auth";
import { reissueOrganizerCode, type LiveGovernanceRecord } from "@/lib/governance-api";
import { useGovernanceCollection } from "@/lib/use-governance";
import { useSearchParamSetter } from "@/lib/use-search-param";

type Code = { code: string; orgId: string | null; expiresAt: string | null; subject: string };

const INPUT = "field h-11 w-full rounded-control pl-10 pr-3.5 text-[14px] text-text placeholder:text-text-3";

/** Approved applicants whose Organizer Code was lost, expired or locked get a new one here. */
export function OrganizerCodes({ backHref }: { backHref: string }) {
  const { consoleRole: role } = useAdminSession();
  const canAct = can(role, CALLABLE_CAPABILITY.reissueOrganizerCode);
  const { records, loading, error, truncated, refresh, newest } = useGovernanceCollection("organizerApplications");
  const params = useSearchParams();
  const setParam = useSearchParamSetter();
  const [query, setQuery] = useState("");
  const [code, setCode] = useState<Code | null>(null);
  const book = useRef(new RequestIdBook("reissue"));

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? records.filter((r) => `${r.primary} ${r.secondary} ${r.id}`.toLowerCase().includes(q)) : records;
  }, [query, records]);
  const eligible = useMemo(() => records.filter((r) => canReissueOrganizerCode(r.raw)).length, [records]);
  const selectedId = params.get("application");
  const selected = selectedId ? records.find((r) => r.id === selectedId) ?? null : null;

  const columns: Array<Column<LiveGovernanceRecord>> = [
    {
      key: "applicant",
      header: "Applicant",
      sort: (a, b) => a.primary.localeCompare(b.primary),
      cell: (r) => (
        <div className="max-w-[340px]">
          <div className="truncate text-[14px] font-semibold text-text">{r.primary}</div>
          <div className="mt-0.5 truncate text-[12px] text-text-3">{r.secondary === "—" ? "Organizer application" : `${r.secondary.charAt(0).toUpperCase()}${r.secondary.slice(1)}`}</div>
        </div>
      ),
    },
    { key: "status", header: "Status", cell: (r) => <Badge tone={r.raw.status === "approved" ? "ok" : r.raw.status === "rejected" ? "err" : "warn"}>{r.status}</Badge> },
    {
      key: "activation",
      header: "Activation",
      cell: (r) => {
        const a = applicationActivation(r.raw);
        return <Badge tone={a.tone}>{a.label}</Badge>;
      },
    },
    { key: "decided", header: "Decided", cell: (r) => <span className="num whitespace-nowrap text-[13px] text-text-2">{formatDateTime(r.raw.decidedAt)}</span> },
  ];

  return (
    <PageContainer className="flex flex-col gap-6">
      <BackLink href={backHref} label="Approvals queue" />
      <PageHeader
        overline="Approvals"
        title={
          <>
            Organizer <em className="hl">codes</em>
          </>
        }
        subtitle="Applications are decided in the approvals queue. Approved applicants whose code was lost, expired or locked can be issued a new one-time Organizer Code here."
      />
      {!loading && !error ? (
        <ul aria-label="Application summary" className="flex flex-wrap gap-2 text-[12px]">
          <li className="rounded-pill border border-line-soft bg-surface px-3 py-1.5 text-text-2">
            Applications <span className="num ml-1 font-semibold text-text">{records.length}{truncated ? "+" : ""}</span>
          </li>
          <li className="rounded-pill border border-line-soft bg-surface px-3 py-1.5 text-text-2">
            Can get a new code <span className="num ml-1 font-semibold text-text">{eligible}</span>
          </li>
        </ul>
      ) : null}
      <label className="relative block max-w-[420px]">
        <span className="sr-only">Search applications</span>
        <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-3" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or application id" className={INPUT} />
      </label>
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
          onRowClick={(r) => setParam("application", r.id)}
          caption="Organizer applications"
          className="max-h-[70vh]"
          empty={
            records.length === 0 ? (
              <Empty emoji="🗝️" title="No organizer applications yet" body="Applications appear here once an organizer applies from the PULSE app." />
            ) : (
              <Empty emoji="🔎" title="No applications match" body="Try another name or id." />
            )
          }
        />
      )}
      {!loading && !error && truncated ? <Truncated shown={records.length} newest={newest} noun="applications" /> : null}

      <ApplicationDrawer
        open={!!selectedId}
        loading={loading}
        record={selected}
        canAct={canAct}
        role={role}
        book={book.current}
        onIssued={(c) => {
          setCode(c);
          refresh();
        }}
        onClose={() => setParam("application", null)}
      />
      {code ? <OrganizerCodeModal code={code.code} orgId={code.orgId} expiresAt={code.expiresAt} subject={code.subject} onClose={() => setCode(null)} /> : null}
    </PageContainer>
  );
}

function ApplicationDrawer({
  open,
  loading,
  record,
  canAct,
  role,
  book,
  onIssued,
  onClose,
}: {
  open: boolean;
  loading: boolean;
  record: LiveGovernanceRecord | null;
  canAct: boolean;
  role: ReturnType<typeof useAdminSession>["consoleRole"];
  book: RequestIdBook;
  onIssued: (code: Code) => void;
  onClose: () => void;
}) {
  const [reissuing, setReissuing] = useState(false);
  const eligible = record ? canReissueOrganizerCode(record.raw) : false;
  const why = !record || eligible ? null : record.raw.status !== "approved" ? "Only approved applications can get a code." : "This organizer has already activated their account.";
  const spec: DecisionSpec | null =
    record && reissuing && eligible
      ? {
          idKey: reissueCodeKey(record),
          title: `Re-issue the code for ${record.primary}?`,
          consequence: "Generates a new one-time Organizer Code and immediately invalidates the previous one. Only do this after confirming the applicant's identity through their registered phone or email.",
          confirmLabel: "Re-issue code",
          tone: "danger",
          phrase: CONFIRM_PHRASES.reissueCode,
          reasonMin: 10,
          execute: async (requestId, reason) => {
            const result = await reissueOrganizerCode({ requestId, applicantUid: record.id, reason });
            if (!result.organizerCode) {
              return { tone: "info", title: "Code already issued", body: "A code was already issued for this request and can't be shown again. Start a new re-issue if it wasn't delivered." };
            }
            onIssued({ code: result.organizerCode, orgId: result.orgId ?? null, expiresAt: result.codeExpiresAt ?? null, subject: record.primary });
            return { tone: "ok", title: `New code issued · ${record.primary}`, body: "The previous code no longer works." };
          },
        }
      : null;
  const activation = record ? applicationActivation(record.raw) : null;

  return (
    <>
      <Drawer open={open} title={record ? record.primary : loading ? "Loading application…" : "Application unavailable"} onClose={onClose}>
        {!record && loading ? (
          <SkeletonRows rows={4} />
        ) : !record ? (
          <Gone noun="application" />
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={record.raw.status === "approved" ? "ok" : "warn"}>{record.status}</Badge>
              {activation ? <Badge tone={activation.tone}>{activation.label}</Badge> : null}
              <CopyIdPill id={record.id} noun="application" />
            </div>
            <Fields label="Application">
              {caseTargetFields("organizer-kyc", record.raw).map((f) => (
                <Field key={f.label} label={f.label}>{f.value}</Field>
              ))}
              <Field label="Organizer ID" mono>{typeof record.raw.orgId === "string" ? record.raw.orgId : "—"}</Field>
              <Field label="Decided">{formatDateTime(record.raw.decidedAt)}</Field>
            </Fields>
            <Note tone="warn">{ORGANIZER_CODE_WARNING} The server records the re-issue in the audit trail; your reason is sent with the request.</Note>
            <section aria-label="Organizer code" className="flex flex-col gap-3">
              <SectionTitle>Organizer code</SectionTitle>
              {!canAct ? (
                <ReadOnly role={role} what="organizer applications" />
              ) : (
                <div>
                  <Button variant="danger" icon={<KeyRound />} disabled={!eligible} onClick={() => setReissuing(true)}>
                    Re-issue Organizer Code
                  </Button>
                  {why ? <p className="mt-2 text-[12px] text-text-3">{why}</p> : null}
                </div>
              )}
            </section>
          </div>
        )}
      </Drawer>
      <DecisionSheet spec={spec} book={book} onClose={() => setReissuing(false)} />
    </>
  );
}
