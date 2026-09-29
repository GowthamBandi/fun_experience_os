"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useStore } from "@/lib/store";
import { disputeDetail, disputeRows } from "@/lib/prototype/selectors/disputes";
import { canPerformSafetyAction } from "@/lib/safety/access";
import { formatAgo, formatWhen } from "@/lib/safety/time";
import type { DisputeOutcome } from "@/lib/prototype/validators/disputeValidation";
import { Badge, StatusChip } from "@/components/ui/primitives";
import { Drawer } from "@/components/ui/overlays";
import { Field, Input, Select } from "@/components/ui/fields";
import { EmptyState } from "@/components/ui/panels";
import { cn } from "@/lib/format";
import { useCommandFeedback } from "@/components/ui/toast";
import { CommandDialog, DetailRow, DrawerSection, GatedButton, PermissionNote, ReasonDialog, TextArea, useSafetyGate } from "./shared";

type Filter = "open" | "decided" | "all";
const OPEN = ["submitted", "under-review", "evidence-requested", "decision-pending"];
const DECIDED = ["upheld", "partially-upheld", "rejected"];
const label = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, " ");

export function DisputesTab({ territoryId }: { territoryId?: string }) {
  const { state } = useStore();
  const [filter, setFilter] = useState<Filter>("open");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const rows = useMemo(() => disputeRows(state, territoryId), [state, territoryId]);
  const filtered = rows.filter((r) => {
    if (filter === "open" && !OPEN.includes(r.status)) return false;
    if (filter === "decided" && OPEN.includes(r.status)) return false;
    const needle = q.trim().toLowerCase();
    return !needle || `${r.id} ${r.type} ${r.reason} ${r.submittedBy} ${r.contextLabel}`.toLowerCase().includes(needle);
  });

  return (
    <div>
      <div className="flex flex-col gap-3 border-b border-edge p-4 lg:flex-row lg:items-center">
        <div className="inline-flex rounded-xl border border-edge bg-bg-sunken p-1" role="group" aria-label="Filter disputes">
          {(["open", "decided", "all"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold capitalize",
                filter === f ? "bg-white text-brand-ink shadow-lift ring-1 ring-edge" : "text-ink-mut hover:text-ink-lum",
              )}
            >
              {f === "decided" ? "Decided & closed" : f}
            </button>
          ))}
        </div>
        <label className="relative lg:ml-auto lg:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mut" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search disputes…"
            aria-label="Search disputes"
            className="field h-10 w-full rounded-xl pl-9 pr-3 text-sm"
          />
        </label>
      </div>
      {filtered.length === 0 ? (
        <div className="p-6">
          <EmptyState
            title={rows.length ? "No disputes match this filter" : "No disputes logged"}
            line={rows.length ? "Switch the filter to see decided disputes." : "Disputes raised by teams, customers or staff appear here for review."}
          />
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {filtered.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => setSelected(r.id)}
                className="flex w-full flex-col gap-2 px-5 py-4 text-left transition-colors hover:bg-brand-subtle/30 focus:outline-none focus-visible:bg-brand-subtle/40 md:flex-row md:items-center md:gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-ink-sec">{r.id}</span>
                    <Badge className="border border-slate-200 bg-slate-50 text-ink-sec">{label(r.type)}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-1 text-sm text-ink-lum">{r.reason}</p>
                  <p className="mt-1 text-xs text-ink-mut">
                    {r.contextLabel} · raised by {r.submittedBy}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 md:w-[300px] md:justify-end">
                  <StatusChip value={r.status} />
                  <span className="text-xs text-ink-mut">{r.reviewerName ? `Reviewer: ${r.reviewerName}` : "No reviewer"}</span>
                  <span className="text-xs text-ink-mut" title={formatWhen(r.submittedAt)}>
                    {formatAgo(r.submittedAt)}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      <DisputeDrawer id={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

type DialogKind = null | "assign" | "evidence" | "decide" | "close";

function DisputeDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { state, operators, operator, assignDisputeReviewer, requestDisputeEvidence, closeDispute } = useStore();
  const gate = useSafetyGate();
  const feedback = useCommandFeedback();
  const [dialog, setDialog] = useState<DialogKind>(null);
  const d = useMemo(() => (id ? disputeDetail(state, id) : undefined), [state, id]);
  if (!id)
    return (
      <Drawer open={false} onClose={onClose} title="">
        {null}
      </Drawer>
    );
  if (!d) {
    return (
      <Drawer open onClose={onClose} title="Dispute not found">
        <p className="text-sm text-ink-mut">This dispute no longer exists.</p>
      </Drawer>
    );
  }
  const g = {
    assign: gate("dispute.assign", d.territoryId),
    evidence: gate("dispute.request-evidence", d.territoryId),
    decide: gate("dispute.decide", d.territoryId),
    close: gate("dispute.close", d.territoryId),
  };
  const isOpen = OPEN.includes(d.status);
  const reviewers = operators.filter((o) => o.status !== "suspended" && canPerformSafetyAction(o.role, "dispute.decide"));
  const canSelfAssign = operator && reviewers.some((r) => r.id === operator.id) && d.reviewerId !== operator.id;
  const denied = [isOpen ? g.decide : undefined, DECIDED.includes(d.status) ? g.close : undefined].find((x) => x && !x.allowed);

  return (
    <Drawer open onClose={onClose} title={`Dispute ${d.id}`} sub={d.contextLabel} width="max-w-xl">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip value={d.status} />
          <Badge className="border border-slate-200 bg-slate-50 text-ink-sec">{label(d.type)}</Badge>
        </div>

        {(isOpen || DECIDED.includes(d.status)) && (
          <DrawerSection title="Next step">
            <div className="flex flex-wrap gap-2">
              {isOpen && canSelfAssign && (
                <GatedButton
                  gate={g.assign}
                  size="sm"
                  variant={d.reviewerId ? "secondary" : "primary"}
                  onClick={() => feedback(assignDisputeReviewer(d.id, operator!.id), "Dispute assigned to you")}
                >
                  Assign to me
                </GatedButton>
              )}
              {isOpen && (
                <GatedButton gate={g.assign} size="sm" variant="secondary" onClick={() => setDialog("assign")}>
                  {d.reviewerId ? "Change reviewer" : "Assign reviewer"}
                </GatedButton>
              )}
              {isOpen && d.reviewerId && (
                <GatedButton gate={g.evidence} size="sm" variant="secondary" onClick={() => setDialog("evidence")}>
                  Request evidence
                </GatedButton>
              )}
              {isOpen && (
                <GatedButton
                  gate={g.decide}
                  size="sm"
                  onClick={() => setDialog("decide")}
                  disabled={!d.reviewerId}
                  title={!d.reviewerId ? "Assign a reviewer first" : undefined}
                >
                  Record decision
                </GatedButton>
              )}
              {DECIDED.includes(d.status) && (
                <GatedButton gate={g.close} size="sm" onClick={() => setDialog("close")}>
                  Close dispute
                </GatedButton>
              )}
            </div>
            <div className="mt-3">
              <PermissionNote reason={denied?.reason} />
            </div>
          </DrawerSection>
        )}

        <DrawerSection title="The dispute">
          <p className="text-sm leading-6 text-ink-lum">{d.reason}</p>
          <dl className="mt-2 divide-y divide-slate-100">
            <DetailRow label="Raised by">{d.submittedBy}</DetailRow>
            <DetailRow label="Logged">
              {formatWhen(d.submittedAt)}
              {d.recordedByName ? ` by ${d.recordedByName}` : ""}
            </DetailRow>
            <DetailRow label="Concerns">{d.contextLabel}</DetailRow>
            <DetailRow label="Reviewer">{d.reviewerName ?? "Not assigned"}</DetailRow>
            {d.evidenceRequestedAt && <DetailRow label="Evidence asked">{formatWhen(d.evidenceRequestedAt)}</DetailRow>}
          </dl>
          {d.notes && <p className="mt-2 whitespace-pre-line rounded-xl bg-bg-sunken px-3 py-2 text-xs leading-5 text-ink-sec">{d.notes}</p>}
        </DrawerSection>

        {d.decision && (
          <DrawerSection title="Decision">
            <dl className="divide-y divide-slate-100">
              <DetailRow label="Outcome">
                <StatusChip value={d.status === "closed" ? "closed" : d.status} />
              </DetailRow>
              <DetailRow label="Decision">{d.decision}</DetailRow>
              <DetailRow label="Reasoning">{d.decisionReason}</DetailRow>
              <DetailRow label="Decided">
                {formatWhen(d.decidedAt)}
                {d.decidedByName ? ` by ${d.decidedByName}` : ""}
              </DetailRow>
            </dl>
          </DrawerSection>
        )}

        {d.exceptions.length > 0 && (
          <DrawerSection title="Refund exceptions">
            <ul className="space-y-1.5 text-sm">
              {d.exceptions.map((re) => (
                <li key={re.id} className="flex items-center justify-between rounded-lg bg-bg-sunken px-3 py-2">
                  <span className="font-mono text-xs">{re.id}</span>
                  <span>₹{re.amount.toLocaleString("en-IN")}</span>
                  <StatusChip value={re.status} />
                </li>
              ))}
            </ul>
          </DrawerSection>
        )}
      </div>

      <ReviewerDialog open={dialog === "assign"} onClose={() => setDialog(null)} reviewers={reviewers} onSubmit={(rid) => assignDisputeReviewer(d.id, rid)} />
      <ReasonDialog
        open={dialog === "evidence"}
        onClose={() => setDialog(null)}
        title="Request evidence"
        label="What evidence is needed, and from whom"
        placeholder="e.g. Scorecard photo from the referee; statement from the court-side coordinator."
        confirmLabel="Request evidence"
        success="Evidence requested"
        onSubmit={(r) => requestDisputeEvidence(d.id, r)}
      />
      <DecisionDialog open={dialog === "decide"} onClose={() => setDialog(null)} disputeId={d.id} />
      <CommandDialog
        open={dialog === "close"}
        onClose={() => setDialog(null)}
        title="Close dispute"
        confirmLabel="Close dispute"
        success="Dispute closed"
        onSubmit={() => closeDispute(d.id)}
      >
        <p className="text-sm leading-6 text-ink-sec">
          Closing confirms the decision has been communicated to the person who raised it. The dispute becomes read-only.
        </p>
      </CommandDialog>
    </Drawer>
  );
}

function ReviewerDialog({
  open,
  onClose,
  reviewers,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  reviewers: Array<{ id: string; name: string; title: string }>;
  onSubmit: (id: string) => { error?: string };
}) {
  const [value, setValue] = useState("");
  return (
    <CommandDialog
      open={open}
      onClose={() => {
        setValue("");
        onClose();
      }}
      title="Assign reviewer"
      confirmLabel="Assign"
      canSubmit={!!value}
      success="Reviewer assigned"
      onSubmit={() => onSubmit(value)}
    >
      <p className="text-sm text-ink-mut">Reviewers decide disputes: Safety & Moderation Officers, Super Admins or Platform Owners.</p>
      <Field label="Reviewer">
        <Select value={value} onChange={(e) => setValue(e.target.value)} required>
          <option value="">Choose…</option>
          {reviewers.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} — {o.title}
            </option>
          ))}
        </Select>
      </Field>
    </CommandDialog>
  );
}

const OUTCOMES: Array<{ id: DisputeOutcome; title: string; line: string; tone: string }> = [
  { id: "upheld", title: "Upheld", line: "The complaint is right; the full remedy applies.", tone: "border-emerald-300 bg-emerald-50" },
  { id: "partially-upheld", title: "Partially upheld", line: "Part of the complaint stands; a partial remedy applies.", tone: "border-amber-300 bg-amber-50" },
  { id: "rejected", title: "Rejected", line: "The complaint does not stand; the original decision holds.", tone: "border-red-300 bg-red-50" },
];

function DecisionDialog({ open, onClose, disputeId }: { open: boolean; onClose: () => void; disputeId: string }) {
  const { decideDispute } = useStore();
  const [outcome, setOutcome] = useState<DisputeOutcome | "">("");
  const [decision, setDecision] = useState("");
  const [reason, setReason] = useState("");
  const reset = () => {
    setOutcome("");
    setDecision("");
    setReason("");
  };
  return (
    <CommandDialog
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      wide
      title="Record decision"
      confirmLabel="Record decision"
      canSubmit={!!outcome && decision.trim().length >= 5 && reason.trim().length >= 10}
      success="Decision recorded"
      onSubmit={() => (outcome ? decideDispute({ disputeId, outcome, decision, decisionReason: reason }) : { error: "Choose an outcome." })}
    >
      <fieldset>
        <legend className="mb-2 text-[13px] font-medium text-ink-sec">Outcome</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {OUTCOMES.map((o) => (
            <label
              key={o.id}
              className={cn("cursor-pointer rounded-xl border p-3 text-sm transition-colors", outcome === o.id ? o.tone : "border-edge hover:bg-bg-sunken")}
            >
              <input type="radio" name="outcome" value={o.id} checked={outcome === o.id} onChange={() => setOutcome(o.id)} className="sr-only" />
              <span className="block font-semibold text-ink-lum">{o.title}</span>
              <span className="mt-0.5 block text-xs text-ink-mut">{o.line}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Decision">
        <Input value={decision} onChange={(e) => setDecision(e.target.value)} placeholder="e.g. Game two to be replayed before the final" />
      </Field>
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-ink-sec">Reasoning</span>
        <TextArea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What the evidence showed and why this outcome is fair." />
      </label>
    </CommandDialog>
  );
}
