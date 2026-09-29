"use client";

import { useMemo, useState } from "react";
import { FileText, FolderLock, HeartPulse, Search, UserPlus } from "lucide-react";
import { useStore, type CommandOutcome } from "@/lib/store";
import type {
  EvidenceSensitivity,
  EvidenceStatus,
  EvidenceType,
  IncidentSeverity,
  ModerationCaseCategory,
  RefundExceptionReason,
} from "@/lib/prototype/entities";
import { incidentDetail, incidentRows, type IncidentRow } from "@/lib/prototype/selectors/safety";
import { canPerformSafetyAction } from "@/lib/safety/access";
import { formatAgo, formatWhen, formatDay, toDateInput, toMillis } from "@/lib/safety/time";
import { Badge, StatusChip, type Tone } from "@/components/ui/primitives";
import { Drawer } from "@/components/ui/overlays";
import { Field, Input, Select } from "@/components/ui/fields";
import { EmptyState } from "@/components/ui/panels";
import { useCommandFeedback } from "@/components/ui/toast";
import { cn } from "@/lib/format";
import {
  CommandDialog,
  DetailRow,
  DrawerSection,
  GatedButton,
  PermissionNote,
  ReasonDialog,
  SEVERITY_BAR,
  SeverityBadge,
  SlaChip,
  TextArea,
  useSafetyGate,
} from "./shared";

type StatusFilter = "open" | "closed" | "all";
const EVIDENCE_TONE: Record<EvidenceStatus, Tone> = { pending: "warn", collected: "info", reviewed: "ok", archived: "neutral" };
const OPEN = (s: string) => s !== "resolved" && s !== "closed";
const label = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, " ");

export function IncidentsTab({ territoryId }: { territoryId?: string }) {
  const { state } = useStore();
  const [status, setStatus] = useState<StatusFilter>("open");
  const [severity, setSeverity] = useState<"all" | IncidentSeverity>("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const rows = useMemo(() => incidentRows(state, territoryId), [state, territoryId]);
  const filtered = rows.filter((r) => {
    if (status === "open" && !OPEN(r.status)) return false;
    if (status === "closed" && OPEN(r.status)) return false;
    if (severity !== "all" && r.severity !== severity) return false;
    const needle = q.trim().toLowerCase();
    return !needle || `${r.incidentCode} ${r.category} ${r.summary} ${r.venueName} ${r.contextLabel}`.toLowerCase().includes(needle);
  });

  return (
    <div>
      <div className="flex flex-col gap-3 border-b border-edge p-4 lg:flex-row lg:items-center">
        <div className="inline-flex rounded-xl border border-edge bg-bg-sunken p-1" role="group" aria-label="Filter by status">
          {(["open", "closed", "all"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold capitalize",
                status === s ? "bg-white text-brand-ink shadow-lift ring-1 ring-edge" : "text-ink-mut hover:text-ink-lum",
              )}
            >
              {s === "closed" ? "Resolved & closed" : s}
            </button>
          ))}
        </div>
        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value as typeof severity)}
          aria-label="Filter by severity"
          className="field h-10 rounded-xl px-3 text-sm lg:w-44"
        >
          <option value="all">All severities</option>
          {(["critical", "high", "medium", "low"] as IncidentSeverity[]).map((s) => (
            <option key={s} value={s}>
              {label(s)}
            </option>
          ))}
        </select>
        <label className="relative lg:ml-auto lg:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mut" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search incidents…"
            aria-label="Search incidents"
            className="field h-10 w-full rounded-xl pl-9 pr-3 text-sm"
          />
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="p-6">
          <EmptyState
            title={rows.length ? "No incidents match these filters" : "No incidents recorded"}
            line={
              rows.length
                ? "Change the status or severity filter to see more."
                : "Incidents reported from sessions and tournaments appear here with their response deadlines."
            }
          />
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {filtered.map((r) => (
            <IncidentListRow key={r.id} row={r} onOpen={() => setSelected(r.id)} />
          ))}
        </ul>
      )}

      <IncidentDrawer id={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function IncidentListRow({ row: r, onOpen }: { row: IncidentRow; onOpen: () => void }) {
  return (
    <li>
      <button
        onClick={onOpen}
        className="group relative flex w-full flex-col gap-2 px-5 py-4 text-left transition-colors hover:bg-brand-subtle/30 focus:outline-none focus-visible:bg-brand-subtle/40 md:flex-row md:items-center md:gap-4"
      >
        <span className={cn("absolute inset-y-3 left-0 w-1 rounded-r-full", SEVERITY_BAR[r.severity])} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-semibold text-ink-sec">{r.incidentCode}</span>
            <SeverityBadge severity={r.severity} />
            <span className="text-sm font-semibold capitalize text-ink-lum">{r.category.replace(/-/g, " ")}</span>
          </div>
          <p className="mt-1 line-clamp-1 text-sm text-ink-sec">{r.summary || "No description"}</p>
          <p className="mt-1 text-xs text-ink-mut">
            {r.venueName} · {r.contextLabel} · {r.territoryName}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:w-[360px] md:justify-end">
          <StatusChip value={r.status} />
          {OPEN(r.status) && <SlaChip sla={r.sla} />}
          <span className="whitespace-nowrap text-xs text-ink-mut" title={formatWhen(r.reportedAt)}>
            {formatAgo(r.reportedAt)}
          </span>
        </div>
      </button>
    </li>
  );
}

/* --------------------------------- drawer --------------------------------- */

type DialogKind = null | "triage" | "assign" | "escalate" | "findings" | "resolve" | "close" | "evidence" | "follow-up" | "refund" | "case";

function IncidentDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { state, operators, acknowledgeIncident, updateEvidenceStatus } = useStore();
  const gate = useSafetyGate();
  const feedback = useCommandFeedback();
  const [dialog, setDialog] = useState<DialogKind>(null);
  const d = useMemo(() => (id ? incidentDetail(state, id) : undefined), [state, id]);

  if (!id)
    return (
      <Drawer open={false} onClose={onClose} title="">
        {null}
      </Drawer>
    );
  if (!d) {
    return (
      <Drawer open onClose={onClose} title="Incident not found">
        <p className="text-sm text-ink-mut">This incident no longer exists. It may have been removed when the workspace was reset.</p>
      </Drawer>
    );
  }

  const t = d.territoryId;
  const g = {
    ack: gate("incident.acknowledge", t),
    triage: gate("incident.triage", t),
    assign: gate("incident.assign", t),
    escalate: gate("incident.escalate", t),
    investigate: gate("incident.investigate", t),
    resolve: gate("incident.resolve", t),
    close: gate("incident.close", t),
    evidence: gate("incident.evidence", t),
    followUp: gate("incident.follow-up", t),
    refund: gate("refund-exception.recommend", t),
    caseOpen: gate("moderation.open-case", t),
  };
  const status = d.status;
  const isOpen = OPEN(status);
  const needsTriage = ["reported", "acknowledged", "active"].includes(status);
  const midFlow = ["triaged", "investigating", "escalated", "monitoring"].includes(status);
  const primaryDenied = [
    status === "reported" ? g.ack : undefined,
    needsTriage ? g.triage : undefined,
    midFlow ? g.resolve : undefined,
    status === "resolved" ? g.close : undefined,
  ].find((x) => x && !x.allowed);
  const followUpOverdue = d.followUpDueAt && toMillis(d.followUpDueAt) < Date.now() && isOpen;

  return (
    <Drawer
      open
      onClose={onClose}
      title={`${d.incidentCode ?? d.id} · ${label(d.category ?? "other")}`}
      sub={`${d.venueName} · ${d.tournamentName ?? d.sessionTitle ?? "No session linked"}`}
      width="max-w-xl"
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip value={status} />
          <SeverityBadge severity={d.severity} />
          {isOpen && <SlaChip sla={d.sla} />}
          {d.medicalAssistance && (
            <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700">
              <HeartPulse className="h-3 w-3" /> Medical assistance
            </span>
          )}
          {d.venueEscalated && <Badge className="border border-red-200 bg-red-50 text-red-700">Venue escalated</Badge>}
        </div>

        {isOpen && (
          <DrawerSection title="Next step">
            <div className="flex flex-wrap gap-2">
              {status === "reported" && (
                <GatedButton
                  gate={g.ack}
                  size="sm"
                  onClick={() => feedback(acknowledgeIncident(d.id), "Incident acknowledged", "You now own the first response.")}
                >
                  Acknowledge
                </GatedButton>
              )}
              {needsTriage && (
                <GatedButton gate={g.triage} size="sm" variant={status === "reported" ? "secondary" : "primary"} onClick={() => setDialog("triage")}>
                  Triage
                </GatedButton>
              )}
              {midFlow && (
                <GatedButton gate={g.assign} size="sm" variant="secondary" onClick={() => setDialog("assign")}>
                  <UserPlus className="h-3.5 w-3.5" /> {d.investigatorId ? "Reassign investigator" : "Assign investigator"}
                </GatedButton>
              )}
              {midFlow && (
                <GatedButton gate={g.investigate} size="sm" variant="secondary" onClick={() => setDialog("findings")}>
                  Record findings
                </GatedButton>
              )}
              {status !== "escalated" && (
                <GatedButton gate={g.escalate} size="sm" variant="warning" onClick={() => setDialog("escalate")}>
                  Escalate
                </GatedButton>
              )}
              {midFlow && (
                <GatedButton gate={g.resolve} size="sm" variant="success" onClick={() => setDialog("resolve")}>
                  Resolve
                </GatedButton>
              )}
              {status === "resolved" && (
                <GatedButton gate={g.close} size="sm" onClick={() => setDialog("close")}>
                  Close incident
                </GatedButton>
              )}
            </div>
            <div className="mt-3">
              <PermissionNote reason={primaryDenied?.reason} />
            </div>
          </DrawerSection>
        )}

        <DrawerSection title="What happened">
          <p className="whitespace-pre-line text-sm leading-6 text-ink-lum">{d.notes || "No description recorded."}</p>
          <dl className="mt-2 divide-y divide-slate-100">
            <DetailRow label="Immediate action">{d.immediateAction || "—"}</DetailRow>
            <DetailRow label="Participants">
              {d.participantTemporaryIds?.length ? <span className="font-mono text-xs">{d.participantTemporaryIds.join(", ")}</span> : "None recorded"}
            </DetailRow>
            <DetailRow label="Occurred">{formatWhen(d.occurredAt)}</DetailRow>
            <DetailRow label="Reported">
              {formatWhen(d.reportedAt)} by {d.reportedByName}
            </DetailRow>
            <DetailRow label="Territory">{d.territoryName}</DetailRow>
            {d.acknowledgedAt && <DetailRow label="Acknowledged">{formatWhen(d.acknowledgedAt)}</DetailRow>}
            <DetailRow label="Investigator">{d.investigatorName ?? "Not assigned"}</DetailRow>
            <DetailRow label="Follow-up">
              {d.followUpOwnerName ? (
                <span className={cn(followUpOverdue && "font-semibold text-red-700")}>
                  {d.followUpOwnerName}, due {formatDay(d.followUpDueAt)}
                  {followUpOverdue ? " (overdue)" : ""}
                </span>
              ) : (
                "None"
              )}
            </DetailRow>
          </dl>
        </DrawerSection>

        {(d.triageRecommendation || d.triageImmediateRisk) && (
          <DrawerSection title="Triage">
            <dl className="divide-y divide-slate-100">
              {d.triageSeverityReview && <DetailRow label="Severity">{d.triageSeverityReview}</DetailRow>}
              {d.triageImmediateRisk && <DetailRow label="Immediate risk">{d.triageImmediateRisk}</DetailRow>}
              {d.triageProtectionActions && <DetailRow label="Protection">{d.triageProtectionActions}</DetailRow>}
              {d.triageRecommendation && <DetailRow label="Recommendation">{d.triageRecommendation}</DetailRow>}
            </dl>
          </DrawerSection>
        )}

        {(d.escalationReason || d.investigationSummary || d.resolution) && (
          <DrawerSection title="Investigation & outcome">
            <dl className="divide-y divide-slate-100">
              {d.escalationReason && <DetailRow label="Escalated">{d.escalationReason}</DetailRow>}
              {d.investigationSummary && <DetailRow label="Findings">{d.investigationSummary}</DetailRow>}
              {d.resolution && <DetailRow label="Resolution">{d.resolution}</DetailRow>}
              {d.closedAt && <DetailRow label="Closed">{formatWhen(d.closedAt)}</DetailRow>}
            </dl>
          </DrawerSection>
        )}

        <DrawerSection
          title={`Evidence register (${d.evidence.length})`}
          right={
            isOpen ? (
              <GatedButton gate={g.evidence} size="sm" variant="ghost" onClick={() => setDialog("evidence")}>
                Add entry
              </GatedButton>
            ) : undefined
          }
        >
          <p className="mb-2 text-xs text-ink-mut">File upload is not connected. Record what the evidence is and where the original is kept.</p>
          {d.evidence.length === 0 ? (
            <p className="rounded-xl border border-dashed border-edge-strong px-3 py-4 text-center text-sm text-ink-mut">No evidence recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {d.evidence.map((ev) => (
                <li key={ev.id} className="rounded-xl border border-edge bg-bg-sunken/60 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-lum">
                        {ev.sensitivity === "restricted" ? (
                          <FolderLock className="h-3.5 w-3.5 text-red-600" />
                        ) : (
                          <FileText className="h-3.5 w-3.5 text-ink-mut" />
                        )}
                        {ev.label}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-mut">
                        {label(ev.type.replace("-placeholder", ""))} · {ev.sensitivity} sensitivity · {formatWhen(ev.capturedAt)}
                      </p>
                      {ev.description && <p className="mt-1 text-xs text-ink-sec">{ev.description}</p>}
                      {ev.placeholderFileName && <p className="mt-1 font-mono text-[11px] text-ink-sec">Kept at: {ev.placeholderFileName}</p>}
                    </div>
                    {isOpen && g.evidence.allowed ? (
                      <select
                        aria-label={`Evidence status for ${ev.label}`}
                        value={ev.status}
                        onChange={(e) => feedback(updateEvidenceStatus(ev.id, e.target.value as EvidenceStatus), "Evidence status updated")}
                        className="field h-8 rounded-lg px-2 text-xs"
                      >
                        {(["pending", "collected", "reviewed", "archived"] as EvidenceStatus[]).map((s) => (
                          <option key={s} value={s}>
                            {label(s)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <StatusChip value={ev.status} tone={EVIDENCE_TONE[ev.status]} />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DrawerSection>

        <DrawerSection title="Related">
          <div className="flex flex-wrap gap-2">
            {isOpen && (
              <GatedButton gate={g.followUp} size="sm" variant="secondary" onClick={() => setDialog("follow-up")}>
                Assign follow-up
              </GatedButton>
            )}
            {isOpen && (
              <GatedButton gate={g.refund} size="sm" variant="secondary" onClick={() => setDialog("refund")}>
                Recommend refund exception
              </GatedButton>
            )}
            <GatedButton gate={g.caseOpen} size="sm" variant="secondary" onClick={() => setDialog("case")}>
              Open moderation case
            </GatedButton>
          </div>
          {(d.cases.length > 0 || d.exceptions.length > 0) && (
            <ul className="mt-3 space-y-1.5 text-sm">
              {d.cases.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg bg-bg-sunken px-3 py-2">
                  <span>
                    Moderation case <span className="font-mono text-xs">{c.id}</span> · {c.subjectTemporaryId}
                  </span>
                  <StatusChip value={c.status} />
                </li>
              ))}
              {d.exceptions.map((re) => (
                <li key={re.id} className="flex items-center justify-between gap-2 rounded-lg bg-bg-sunken px-3 py-2">
                  <span>
                    Refund exception <span className="font-mono text-xs">{re.id}</span> · ₹{re.amount.toLocaleString("en-IN")}
                  </span>
                  <StatusChip value={re.status} />
                </li>
              ))}
            </ul>
          )}
        </DrawerSection>
      </div>

      <IncidentDialogs
        kind={dialog}
        onClose={() => setDialog(null)}
        incidentId={d.id}
        severity={d.severity}
        sessionId={d.sessionId}
        participants={d.participantTemporaryIds ?? []}
        operators={operators}
      />
    </Drawer>
  );
}

/* --------------------------------- dialogs -------------------------------- */

function IncidentDialogs({
  kind,
  onClose,
  incidentId,
  severity: currentSeverity,
  sessionId,
  participants,
  operators,
}: {
  kind: DialogKind;
  onClose: () => void;
  incidentId: string;
  severity: IncidentSeverity;
  sessionId?: string;
  participants: string[];
  operators: ReturnType<typeof useStore>["operators"];
}) {
  const store = useStore();
  const investigators = operators.filter((o) => o.status !== "suspended" && canPerformSafetyAction(o.role, "incident.investigate"));

  return (
    <>
      <TriageDialog open={kind === "triage"} onClose={onClose} incidentId={incidentId} current={currentSeverity} />
      <SelectOperatorDialog
        open={kind === "assign"}
        onClose={onClose}
        title="Assign investigator"
        help="Investigators must be able to run investigations: Safety & Moderation Officers, Super Admins or Platform Owners."
        options={investigators}
        confirmLabel="Assign"
        success="Investigator assigned"
        onSubmit={(opId) => store.assignInvestigator(incidentId, opId)}
      />
      <ReasonDialog
        open={kind === "escalate"}
        onClose={onClose}
        title="Escalate incident"
        consequence="Venue management and the safety desk are alerted, and the incident is flagged as escalated."
        label="Why it needs escalating"
        confirmLabel="Escalate"
        variant="warning"
        success="Incident escalated"
        onSubmit={(r) => store.escalateIncident(incidentId, r)}
      />
      <ReasonDialog
        open={kind === "findings"}
        onClose={onClose}
        title="Record investigation findings"
        label="Findings so far"
        placeholder="Statements taken, what the evidence shows, open questions…"
        confirmLabel="Save findings"
        success="Findings recorded"
        onSubmit={(r) => store.updateInvestigation(incidentId, r)}
      />
      <ReasonDialog
        open={kind === "resolve"}
        onClose={onClose}
        title="Resolve incident"
        consequence="Resolving records the outcome. The incident can then be closed once all evidence is collected."
        label="Resolution"
        minLength={currentSeverity === "critical" || currentSeverity === "high" ? 20 : 10}
        placeholder="What was done, the outcome for the people involved, and any lasting changes."
        confirmLabel="Resolve"
        variant="success"
        success="Incident resolved"
        onSubmit={(r) => store.resolveIncident(incidentId, r)}
      />
      <CloseIncidentDialog open={kind === "close"} onClose={onClose} incidentId={incidentId} />
      <EvidenceDialog open={kind === "evidence"} onClose={onClose} incidentId={incidentId} />
      <FollowUpDialog open={kind === "follow-up"} onClose={onClose} incidentId={incidentId} operators={operators} />
      <RefundExceptionDialog open={kind === "refund"} onClose={onClose} incidentId={incidentId} sessionId={sessionId} />
      <OpenCaseDialog open={kind === "case"} onClose={onClose} incidentId={incidentId} participants={participants} />
    </>
  );
}

function TriageDialog({ open, onClose, incidentId, current }: { open: boolean; onClose: () => void; incidentId: string; current: IncidentSeverity }) {
  const { triageIncident } = useStore();
  const [severity, setSeverity] = useState<IncidentSeverity>(current);
  const [risk, setRisk] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [protection, setProtection] = useState("");
  const reset = () => {
    setSeverity(current);
    setRisk("");
    setRecommendation("");
    setProtection("");
  };
  return (
    <CommandDialog
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      wide
      title="Triage incident"
      confirmLabel="Complete triage"
      canSubmit={risk.trim().length >= 5 && recommendation.trim().length >= 10}
      success="Triage recorded"
      onSubmit={() => {
        const r = triageIncident({ incidentId, severity, immediateRisk: risk, recommendation, protectionActions: protection });
        if (!r.error) reset();
        return r;
      }}
    >
      <Field label="Confirmed severity" hint={severity !== current ? `Changing from ${current}. The change is recorded.` : undefined}>
        <Select value={severity} onChange={(e) => setSeverity(e.target.value as IncidentSeverity)}>
          {(["low", "medium", "high", "critical"] as IncidentSeverity[]).map((s) => (
            <option key={s} value={s}>
              {label(s)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Immediate risk">
        <Input value={risk} onChange={(e) => setRisk(e.target.value)} placeholder="Could it happen again tonight? Who is at risk?" />
      </Field>
      <Field label="Protection already in place (optional)">
        <Input value={protection} onChange={(e) => setProtection(e.target.value)} placeholder="e.g. Area cordoned off, participant separated" />
      </Field>
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-ink-sec">Recommendation</span>
        <TextArea value={recommendation} onChange={(e) => setRecommendation(e.target.value)} placeholder="What should happen next and who should do it." />
      </label>
    </CommandDialog>
  );
}

function SelectOperatorDialog({
  open,
  onClose,
  title,
  help,
  options,
  confirmLabel,
  success,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  help: string;
  options: Array<{ id: string; name: string; title: string }>;
  confirmLabel: string;
  success: string;
  onSubmit: (id: string) => CommandOutcome;
}) {
  const [value, setValue] = useState("");
  return (
    <CommandDialog
      open={open}
      onClose={() => {
        setValue("");
        onClose();
      }}
      title={title}
      confirmLabel={confirmLabel}
      canSubmit={!!value}
      success={success}
      onSubmit={() => onSubmit(value)}
    >
      <p className="text-sm text-ink-mut">{help}</p>
      <Field label="Operator">
        <Select value={value} onChange={(e) => setValue(e.target.value)} required>
          <option value="">Choose…</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} — {o.title}
            </option>
          ))}
        </Select>
      </Field>
    </CommandDialog>
  );
}

function CloseIncidentDialog({ open, onClose, incidentId }: { open: boolean; onClose: () => void; incidentId: string }) {
  const { closeIncident } = useStore();
  const [note, setNote] = useState("");
  return (
    <CommandDialog
      open={open}
      onClose={() => {
        setNote("");
        onClose();
      }}
      title="Close incident"
      confirmLabel="Close incident"
      success="Incident closed"
      onSubmit={() => closeIncident(incidentId, note)}
    >
      <p className="text-sm leading-6 text-ink-sec">
        Closing is final: the incident and its evidence register become read-only. Make sure follow-ups are done and pending evidence has been collected or
        archived.
      </p>
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-ink-sec">Closing note (optional)</span>
        <TextArea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything the next reader should know." />
      </label>
    </CommandDialog>
  );
}

const EVIDENCE_TYPES: Array<[EvidenceType, string]> = [
  ["image-placeholder", "Photo"],
  ["video-placeholder", "Video"],
  ["document-placeholder", "Document"],
  ["witness-statement", "Witness statement"],
  ["staff-note", "Staff note"],
  ["venue-report", "Venue report"],
  ["medical-placeholder", "Medical record"],
];

function EvidenceDialog({ open, onClose, incidentId }: { open: boolean; onClose: () => void; incidentId: string }) {
  const { addEvidenceRecord } = useStore();
  const [type, setType] = useState<EvidenceType>("image-placeholder");
  const [labelText, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [where, setWhere] = useState("");
  const [sensitivity, setSensitivity] = useState<EvidenceSensitivity>("medium");
  const [status, setStatus] = useState<EvidenceStatus>("collected");
  const reset = () => {
    setType("image-placeholder");
    setLabel("");
    setDescription("");
    setWhere("");
    setSensitivity("medium");
    setStatus("collected");
  };
  return (
    <CommandDialog
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      wide
      title="Add to evidence register"
      confirmLabel="Add entry"
      canSubmit={labelText.trim().length >= 3}
      success="Evidence recorded"
      onSubmit={() => addEvidenceRecord({ incidentId, type, label: labelText, description, placeholderFileName: where, sensitivity, status })}
    >
      <p className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-800">
        File upload is not connected. Keep the original file or paper record in your evidence store and note its location below.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value as EvidenceType)}>
            {EVIDENCE_TYPES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Sensitivity" hint={sensitivity === "restricted" ? "Restricted: medical or identity data. Share only with the investigator." : undefined}>
          <Select value={sensitivity} onChange={(e) => setSensitivity(e.target.value as EvidenceSensitivity)}>
            {(["low", "medium", "high", "restricted"] as EvidenceSensitivity[]).map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Label">
        <Input value={labelText} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Referee statement" required />
      </Field>
      <Field label="Where the original is kept (optional)">
        <Input value={where} onChange={(e) => setWhere(e.target.value)} placeholder="File name, shared-drive link or physical location" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-ink-sec">Description (optional)</span>
          <TextArea value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[72px]" />
        </label>
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value as EvidenceStatus)}>
            <option value="pending">Pending collection</option>
            <option value="collected">Collected</option>
          </Select>
        </Field>
      </div>
    </CommandDialog>
  );
}

function FollowUpDialog({
  open,
  onClose,
  incidentId,
  operators,
}: {
  open: boolean;
  onClose: () => void;
  incidentId: string;
  operators: ReturnType<typeof useStore>["operators"];
}) {
  const { createFollowUp } = useStore();
  const [owner, setOwner] = useState("");
  const [due, setDue] = useState(toDateInput(new Date(Date.now() + 86400000)));
  return (
    <CommandDialog
      open={open}
      onClose={() => {
        setOwner("");
        onClose();
      }}
      title="Assign follow-up"
      confirmLabel="Assign follow-up"
      canSubmit={!!owner && !!due}
      success="Follow-up assigned"
      onSubmit={() => createFollowUp(incidentId, owner, `${due}T18:00:00`)}
    >
      <Field label="Owner">
        <Select value={owner} onChange={(e) => setOwner(e.target.value)} required>
          <option value="">Choose an operator…</option>
          {operators
            .filter((o) => o.status !== "suspended")
            .map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} — {o.title}
              </option>
            ))}
        </Select>
      </Field>
      <Field label="Due date" hint="Follow-ups past their due date are flagged on the incident list.">
        <Input type="date" value={due} min={toDateInput(new Date())} onChange={(e) => setDue(e.target.value)} />
      </Field>
    </CommandDialog>
  );
}

const REFUND_REASONS: Array<[RefundExceptionReason, string]> = [
  ["safety-incident", "Safety incident"],
  ["medical-incident", "Medical incident"],
  ["venue-failure", "Venue failure"],
  ["match-abandonment", "Match abandoned"],
  ["misconduct-decision", "Misconduct decision"],
];

function RefundExceptionDialog({ open, onClose, incidentId, sessionId }: { open: boolean; onClose: () => void; incidentId: string; sessionId?: string }) {
  const { state, recommendRefundException } = useStore();
  const bookings = sessionId ? state.bookings.filter((b) => b.sessionId === sessionId) : [];
  const [bookingId, setBookingId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState<RefundExceptionReason>("safety-incident");
  const [notes, setNotes] = useState("");
  const booking = bookings.find((b) => b.id === bookingId);
  return (
    <CommandDialog
      open={open}
      onClose={() => {
        setBookingId("");
        setAmount("");
        setNotes("");
        onClose();
      }}
      title="Recommend a refund exception"
      wide
      confirmLabel="Send to Finance"
      canSubmit={Number(amount) > 0 && notes.trim().length >= 10}
      success="Recommendation sent to Finance for approval"
      onSubmit={() =>
        recommendRefundException({
          incidentId,
          sessionId,
          bookingId: bookingId || undefined,
          reason,
          amount: Math.round(Number(amount)),
          notes,
        })
      }
    >
      <p className="text-sm leading-6 text-ink-sec">
        Finance reviews every exception. Nothing is refunded until they approve it; payouts are then recorded manually because the payment provider is not
        connected.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Booking to refund">
          <Select
            value={bookingId}
            onChange={(e) => {
              setBookingId(e.target.value);
              const b = bookings.find((x) => x.id === e.target.value);
              if (b) setAmount(String(b.amount));
            }}
          >
            <option value="">{bookings.length ? "Choose a booking…" : "No bookings on this session"}</option>
            {bookings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.alias} · {b.tempId ?? b.id} · ₹{b.amount}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Amount (₹)" hint={booking ? `Booking paid ₹${booking.amount}.` : undefined}>
          <Input type="number" min={1} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </Field>
      </div>
      <Field label="Reason">
        <Select value={reason} onChange={(e) => setReason(e.target.value as RefundExceptionReason)}>
          {REFUND_REASONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
      </Field>
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-ink-sec">Justification for Finance</span>
        <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Why the normal cancellation policy should not apply." />
      </label>
    </CommandDialog>
  );
}

const CASE_CATEGORIES: ModerationCaseCategory[] = [
  "misconduct",
  "harassment",
  "repeated-misconduct",
  "safety-violation",
  "fraud",
  "eligibility-violation",
  "other",
];

export function OpenCaseDialog({
  open,
  onClose,
  incidentId,
  participants = [],
}: {
  open: boolean;
  onClose: () => void;
  incidentId?: string;
  participants?: string[];
}) {
  const { createModerationCase } = useStore();
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<ModerationCaseCategory>("misconduct");
  const [severity, setSeverity] = useState<IncidentSeverity>("medium");
  const [notes, setNotes] = useState("");
  const reset = () => {
    setSubject("");
    setCategory("misconduct");
    setSeverity("medium");
    setNotes("");
  };
  return (
    <CommandDialog
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      wide
      title="Open a moderation case"
      confirmLabel="Open case"
      canSubmit={subject.trim().length >= 2 && notes.trim().length >= 10}
      success="Moderation case opened"
      onSubmit={() =>
        createModerationCase({
          subjectTemporaryId: subject.trim().toUpperCase(),
          category,
          severity,
          notes,
          originType: incidentId ? "incident" : "manual",
          originId: incidentId ?? "console",
          relatedIncidentIds: incidentId ? [incidentId] : [],
        })
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Participant (temporary ID)">
          {participants.length ? (
            <Select value={subject} onChange={(e) => setSubject(e.target.value)} required>
              <option value="">Choose…</option>
              {participants.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          ) : (
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. CR-22" required />
          )}
        </Field>
        <Field label="Category">
          <Select value={category} onChange={(e) => setCategory(e.target.value as ModerationCaseCategory)}>
            {CASE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {label(c)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Severity">
          <Select value={severity} onChange={(e) => setSeverity(e.target.value as IncidentSeverity)}>
            {(["low", "medium", "high", "critical"] as IncidentSeverity[]).map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-ink-sec">Why the case is opened</span>
        <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Behaviour observed, earlier incidents, evidence available." />
      </label>
    </CommandDialog>
  );
}
