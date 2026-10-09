"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, KeyRound, ShieldAlert } from "lucide-react";
import { Button, Empty, Kbd, PageHeader, Sheet, Skeleton, SkeletonRows, useToast } from "@/components/pulse";
import { OrganizerCodeModal } from "@/components/governance/OrganizerCodeModal";
import { CaseList } from "./CaseList";
import { CaseDetail } from "./CaseDetail";
import { OrganizerCodes } from "./OrganizerCodes";
import { isTypingTarget, laneCounts, laneRecords, neighbourId, stepSelection, type Lane } from "@/lib/approvals";
import { CONFIRM_PHRASES, RequestIdBook, isConfirmed, type CaseOutcome } from "@/lib/console/actions";
import { isOpenCase } from "@/lib/console/attention";
import { ROLE_LABEL, can } from "@/lib/console/capabilities";
import { mapConsoleError, type ConsoleError } from "@/lib/console/errors";
import { caseOutcome } from "@/lib/console/outcomes";
import { useAdminSession } from "@/lib/firebase/auth";
import { cn } from "@/lib/format";
import { decideCase, type LiveGovernanceRecord } from "@/lib/governance-api";
import { useNow } from "@/lib/hooks";
import { useGovernanceCollection } from "@/lib/use-governance";

const PAGE = "mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-5 pb-8 pt-2 lg:px-7";

type OrganizerCode = { code: string; orgId?: string | null; expiresAt?: string | null; subject: string };
type Flagged = { caseId: string; error: ConsoleError } | null;

function consequence(kind: string, outcome: CaseOutcome): string {
  if (outcome === "information-requested") return "Sends the case back to the submitter with your reason.";
  if (outcome === "rejected") return "Rejects the submission. The submitter is notified with your reason.";
  if (kind === "organizer-kyc") return "Creates the organizer account and issues a one-time Organizer Code. The code is shown once; the applicant activates hosting with it.";
  if (kind === "event-approval") return "Marks the event approved. The organizer can then publish it (only with an approved experience, active organizer, commercial terms and a responsible person).";
  if (kind === "experience-approval") return "Marks the experience approved so the organizer can schedule events from it.";
  return "Records an approval decision on this case.";
}

const TOAST_TITLE: Record<CaseOutcome, string> = { approved: "Approved", rejected: "Rejected", "information-requested": "Changes requested" };

function DecisionSheet({
  decision,
  record,
  onConfirm,
  onClose,
}: {
  decision: CaseOutcome | null;
  record: LiveGovernanceRecord | null;
  onConfirm: (outcome: CaseOutcome, note: string, typed: string) => Promise<void>;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  useEffect(() => setTyped(""), [decision, record?.id]);
  const kind = String(record?.raw.kind ?? "");
  const organizer = kind === "organizer-kyc" && decision === "approved";
  const phrase = CONFIRM_PHRASES.approveOrganizer;
  const subject = record?.primary ?? "this case";
  const copy =
    decision === "approved"
      ? { title: organizer ? `Approve ${subject} as a host?` : `Approve ${subject}?`, confirm: organizer ? "Approve organizer" : "Approve", label: "Note for the audit trail", min: 5 }
      : decision === "rejected"
        ? { title: `Reject ${subject}?`, confirm: "Reject", label: "Reason (the submitter sees this)", min: 10 }
        : { title: "Request changes", confirm: "Send back", label: "What needs to change? (the submitter sees this)", min: 10 };

  return (
    <Sheet
      open={!!decision && !!record}
      title={copy.title}
      description={organizer ? undefined : decision ? consequence(kind, decision) : undefined}
      confirmLabel={copy.confirm}
      tone={decision === "rejected" ? "danger" : "volt"}
      requireReason
      reasonLabel={copy.label}
      minReason={copy.min}
      extra={
        organizer ? (
          <div className="rounded-control border border-[rgba(255,97,120,0.3)] bg-[rgba(255,97,120,0.07)] p-4">
            <p className="flex items-center gap-2 font-display text-[14px] font-bold text-err">
              <ShieldAlert aria-hidden className="h-4 w-4" />
              High-risk action
            </p>
            <p className="mt-1 text-[13px] leading-[1.5] text-text-2">{consequence(kind, "approved")}</p>
            <label className="mt-3 block">
              <span className="text-[12px] font-semibold text-text-3">
                Type <code className="rounded-[6px] bg-[rgba(0,0,0,0.3)] px-1.5 py-0.5 font-mono text-text">{phrase}</code> to confirm
              </span>
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                aria-label={`Type ${phrase} to confirm`}
                className={cn("field mt-2 h-11 w-full rounded-control px-3.5 font-mono text-[14px] text-text", isConfirmed(typed, phrase) && "!border-[rgba(63,221,154,0.5)]")}
              />
            </label>
          </div>
        ) : undefined
      }
      onConfirm={(note) => (decision ? onConfirm(decision, note, typed) : Promise.resolve())}
      onClose={onClose}
    />
  );
}

function Queue() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname() ?? "/approvals";
  const toast = useToast();
  const now = useNow(60_000);
  const { consoleRole } = useAdminSession();
  const permitted = can(consoleRole, "governance.decide");
  const { records, loading, error, truncated, refresh } = useGovernanceCollection("governanceCases");

  const [lane, setLane] = useState<Lane>("all");
  const [decision, setDecision] = useState<{ outcome: CaseOutcome; caseId: string } | null>(null);
  const [conflict, setConflict] = useState<Flagged>(null);
  const [dual, setDual] = useState<Flagged>(null);
  const [code, setCode] = useState<OrganizerCode | null>(null);
  const book = useRef(new RequestIdBook("governanceCases"));

  const counts = useMemo(() => laneCounts(records), [records]);
  const list = useMemo(() => laneRecords(records, lane), [records, lane]);
  const ids = useMemo(() => list.map((r) => r.id), [list]);
  const caseParam = params.get("case");
  const selectedId = caseParam ?? ids[0] ?? null;
  // Always the live version: versions move under us.
  const selected = selectedId ? records.find((r) => r.id === selectedId) ?? null : null;

  const select = useCallback(
    (id: string) => {
      const next = new URLSearchParams(params.toString());
      next.set("case", id);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  const changeLane = (next: Lane) => {
    setLane(next);
    const nextIds = laneRecords(records, next).map((r) => r.id);
    if (nextIds.length && (!selectedId || !nextIds.includes(selectedId))) select(nextIds[0]);
  };

  const openDecision = useCallback(
    (outcome: CaseOutcome) => {
      if (!permitted || !selected || !isOpenCase(selected.raw)) return;
      setDecision({ outcome, caseId: selected.id });
    },
    [permitted, selected],
  );

  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    if (decision || code) return;
    if (isTypingTarget(e.target as HTMLElement | null) || isTypingTarget(document.activeElement as HTMLElement | null)) return;
    if (document.querySelector('[aria-modal="true"]')) return;
    const k = e.key.toLowerCase();
    if (k === "j" || k === "k") {
      const next = stepSelection(ids, selectedId, k === "j" ? 1 : -1);
      if (next) {
        e.preventDefault();
        if (next !== selectedId) select(next);
      }
      return;
    }
    const outcome: CaseOutcome | null = k === "a" ? "approved" : k === "c" ? "information-requested" : k === "r" ? "rejected" : null;
    if (outcome && permitted && selected && isOpenCase(selected.raw)) {
      e.preventDefault();
      openDecision(outcome);
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const decided = decision ? records.find((r) => r.id === decision.caseId) ?? null : null;

  const confirm = async (outcome: CaseOutcome, note: string, typed: string) => {
    // The live version of the case the sheet was opened for.
    const record = decided;
    if (!record) throw new Error("This case is no longer in the live list. Refresh and try again.");
    const kind = String(record.raw.kind ?? "");
    if (kind === "organizer-kyc" && outcome === "approved" && !isConfirmed(typed, CONFIRM_PHRASES.approveOrganizer)) {
      throw new Error(`Type ${CONFIRM_PHRASES.approveOrganizer} to confirm.`);
    }
    setConflict(null);
    setDual(null);
    try {
      const requestId = book.current.idFor(`${record.id}-${outcome}`);
      const result = await decideCase({ requestId, caseId: record.id, expectedVersion: record.version, outcome, note });
      book.current.reset();
      const mapped = caseOutcome(kind, outcome, result);
      toast.show({ tone: mapped.tone === "info" ? "info" : "ok", title: `${TOAST_TITLE[outcome]} · ${record.primary}`, body: mapped.message });
      // Never keep the one-time code anywhere but the modal's own props.
      if (mapped.showCode && result.organizerCode) {
        setCode({ code: result.organizerCode, orgId: result.orgId ?? null, expiresAt: result.codeExpiresAt ?? null, subject: record.primary });
      }
      const next = neighbourId(ids, record.id);
      if (next) select(next);
    } catch (cause) {
      const mapped = mapConsoleError(cause);
      // A definitive server answer ends this attempt; only transport failures keep the requestId so a retry replays.
      if (mapped.kind !== "unavailable" && mapped.kind !== "unknown") book.current.reset();
      if (mapped.kind === "conflict") {
        setConflict({ caseId: record.id, error: mapped });
        return;
      }
      if (mapped.kind === "dual-control") {
        setDual({ caseId: record.id, error: mapped });
        throw new Error(`Needs a second admin. ${mapped.message}${mapped.nextStep ? ` ${mapped.nextStep}` : ""}`);
      }
      throw new Error(mapped.nextStep ? `${mapped.message} ${mapped.nextStep}` : mapped.message);
    }
  };

  const refreshCase = () => {
    book.current.reset();
    setConflict(null);
    setDual(null);
    refresh();
  };

  const inboxZero = !loading && !error && counts.all === 0 && !caseParam;

  let detail: ReactNode;
  if (loading) {
    detail = (
      <div className="flex flex-col gap-5" aria-busy="true">
        <Skeleton className="h-[180px] rounded-card" />
        <Skeleton className="h-[320px] rounded-card" />
      </div>
    );
  } else if (error) {
    detail = null;
  } else if (selected) {
    detail = (
      <CaseDetail
        key={selected.id}
        record={selected}
        permitted={permitted}
        roleLabel={consoleRole ? ROLE_LABEL[consoleRole] : "no console role"}
        conflict={conflict?.caseId === selected.id ? conflict.error : null}
        dual={dual?.caseId === selected.id ? dual.error : null}
        onRefresh={refreshCase}
        onAction={openDecision}
      />
    );
  } else if (caseParam) {
    detail = (
      <div className="rounded-card border border-line-soft bg-[rgba(26,23,38,0.55)]">
        <Empty
          emoji="🔎"
          title="Case not found"
          body="It may be older than the newest 250 cases, or it no longer exists."
          action={<Button variant="ghost" icon={<ArrowLeft />} onClick={() => router.replace(pathname, { scroll: false })}>Back to the queue</Button>}
        />
      </div>
    );
  } else {
    detail = (
      <div className="rounded-card border border-line-soft bg-[rgba(26,23,38,0.55)]">
        <Empty emoji="🎉" title="Nothing in this lane" body="Pick another lane to keep going." />
      </div>
    );
  }

  return (
    <div className={PAGE}>
      <PageHeader
        overline="Marketplace"
        title={
          <>
            Approvals
            {!loading && !error && counts.all > 0 ? (
              <>
                {" "}
                <em className="hl">{counts.all} waiting</em>
              </>
            ) : null}
          </>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[14px]">
            <span>Hosts and experiences waiting for a decision.</span>
            <span className="hidden items-center gap-1.5 text-[12.5px] text-text-3 md:inline-flex">
              <Kbd>J</Kbd>
              <Kbd>K</Kbd> move · <Kbd>A</Kbd> approve · <Kbd>C</Kbd> changes · <Kbd>R</Kbd> reject
            </span>
          </span>
        }
        actions={
          <Button variant="ghost" icon={<KeyRound />} onClick={() => router.push(`${pathname}?view=codes`)}>
            Organizer codes
          </Button>
        }
      />

      {inboxZero ? (
        <div className="rounded-card border border-line-soft bg-[rgba(26,23,38,0.55)] py-10">
          <Empty emoji="📭" title="Inbox zero 🎉" body="No one is waiting for approval." />
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start">
          <div className="lg:sticky lg:top-2 lg:h-[calc(100vh-76px-24px)]">
            <CaseList
              lane={lane}
              onLane={changeLane}
              counts={counts}
              records={list}
              selectedId={selectedId}
              onSelect={select}
              loading={loading}
              error={error}
              onRetry={refresh}
              truncated={truncated}
              shown={records.length}
              now={now}
            />
          </div>
          <div className="min-w-0">{detail}</div>
        </div>
      )}

      <DecisionSheet decision={decision?.outcome ?? null} record={decided} onConfirm={confirm} onClose={() => setDecision(null)} />
      {code && <OrganizerCodeModal code={code.code} orgId={code.orgId} expiresAt={code.expiresAt} subject={code.subject} onClose={() => setCode(null)} />}
    </div>
  );
}

function Codes() {
  const router = useRouter();
  const pathname = usePathname() ?? "/approvals";
  return (
    <div>
      <div className="mx-auto w-full max-w-[1440px] px-5 pt-4 lg:px-8">
        <Button variant="quiet" size="sm" icon={<ArrowLeft />} onClick={() => router.push(pathname)}>
          Back to the queue
        </Button>
      </div>
      <OrganizerCodes />
    </div>
  );
}

function Route() {
  const params = useSearchParams();
  return params.get("view") === "codes" ? <Codes /> : <Queue />;
}

export function ApprovalsView() {
  return (
    <Suspense
      fallback={
        <div className={PAGE}>
          <Skeleton className="h-10 w-64 rounded-pill" />
          <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
            <SkeletonRows rows={5} />
            <Skeleton className="h-[420px] rounded-card" />
          </div>
        </div>
      }
    >
      <Route />
    </Suspense>
  );
}
