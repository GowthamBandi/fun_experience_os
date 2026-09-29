"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, FileText, Lock } from "lucide-react";
import { useStore } from "@/lib/store";
import { selectCompletionChecklist, selectSessionSummary } from "@/lib/prototype/selectors/completion";
import { selectResultsProgress } from "@/lib/prototype/selectors/results";
import { inr } from "@/lib/format";
import { Button, StatusChip } from "@/components/ui/primitives";
import { EmptyState } from "@/components/ui/panels";
import { useToast } from "@/components/ui/toast";
import { CheckRow, ConfirmDialog, MissionShell, MissionStageStepper, ReasonDialog, WorkspaceCard, formatWhen, useMissionId, useOperatorName } from "@/components/missions/shared";

export default function CompletionPage() {
  return (
    <MissionShell tab="completion" sub="Check that everything is accounted for, then lock the session and save its report.">
      <CompletionBody />
    </MissionShell>
  );
}

const TAB_LABEL = { live: "Run", "check-in": "Check-in", results: "Results" } as const;

function CompletionBody() {
  const sessionId = useMissionId();
  const { state, completeLiveSession } = useStore();
  const toast = useToast();
  const opName = useOperatorName();

  const checklist = useMemo(() => selectCompletionChecklist(state, sessionId), [state, sessionId]);
  const summary = useMemo(() => selectSessionSummary(state, sessionId), [state, sessionId]);
  const results = useMemo(() => selectResultsProgress(state, sessionId), [state, sessionId]);
  const [note, setNote] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);

  const { lss, snapshot } = summary;
  const ended = lss.status === "Ended";
  const open = checklist.items.filter((i) => i.status !== "passed");
  const blockers = checklist.items.filter((i) => i.status === "blocked");

  if (summary.isCompleted) {
    return (
      <div className="space-y-6">
        <MissionStageStepper current="completion" />
        <section className="rounded-panel border border-emerald-200 bg-emerald-50/60 p-6 shadow-panel">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-7 w-7 text-emerald-600" />
              <div>
                <p className="font-display text-xl font-bold text-ink-lum">Session completed</p>
                <p className="mt-1 text-sm text-ink-sec">
                  {snapshot ? `Locked by ${opName(snapshot.completedBy)} on ${formatWhen(snapshot.completedAt)}.` : "This session is closed."} Attendance, results and notes are now read-only.
                </p>
                {snapshot?.overrideReason && <p className="mt-2 text-sm text-amber-800">Completed with override: {snapshot.overrideReason}</p>}
                {snapshot?.closingNote && <p className="mt-2 text-sm text-ink-sec">Closing note: {snapshot.closingNote}</p>}
              </div>
            </div>
            <Link href={`/missions/${sessionId}/summary`}>
              <Button>
                <FileText className="h-4 w-4" /> Open report
              </Button>
            </Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <MissionStageStepper current="completion" />

      {!ended ? (
        <EmptyState
          title="Finish opens after the session ends"
          line={`The session is ${lss.status.toLowerCase()}. End it on the Run tab, confirm results, then come back here.`}
          action={
            <Link href={`/missions/${sessionId}/live`}>
              <Button variant="secondary">
                Go to Run <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <WorkspaceCard
            title="Before you finish"
            sub={checklist.isReadyToComplete ? (open.length ? "Nothing blocks completion; review the warnings." : "Every check has passed.") : `${blockers.length} item(s) block completion.`}
            right={<StatusChip value={checklist.isReadyToComplete ? "ready" : "blocked"} tone={checklist.isReadyToComplete ? "ok" : "danger"} />}
          >
            <ul className="divide-y divide-edge">
              {checklist.items.map((i) => (
                <CheckRow
                  key={i.key}
                  passed={i.status === "passed"}
                  warning={i.status === "warning"}
                  label={i.label}
                  detail={i.status === "passed" ? i.evidence : `${i.evidence}${i.evidence.endsWith(".") ? "" : "."} ${i.recommendedAction}`}
                  action={
                    i.status !== "passed" && i.fixTab ? (
                      <Link href={`/missions/${sessionId}/${i.fixTab}`} className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:text-brand-hover">
                        {TAB_LABEL[i.fixTab]} <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    ) : undefined
                  }
                />
              ))}
            </ul>
          </WorkspaceCard>

          <div className="space-y-6">
            <WorkspaceCard title="Final numbers">
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <Stat label="Present" value={`${summary.checkIn.presentCount} / ${summary.checkIn.expectedCount}`} detail={`${summary.checkIn.lateCount} late · ${summary.checkIn.noShowCount} no-show`} />
                <Stat label="Active time" value={summary.formattedDuration} detail={`${summary.session?.duration ?? 0} min planned`} />
                <Stat label="Results" value={`${results.confirmedCount} / ${results.requiredCount}`} detail="scored steps confirmed" />
                <Stat label="Net collected" value={inr(summary.money.netRevenue)} detail={`${inr(summary.money.totalRefunded)} refunded`} />
              </dl>
            </WorkspaceCard>

            <WorkspaceCard title="Finish the session" sub="Locking saves the report and makes attendance, results and notes read-only.">
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-medium text-ink-sec">Closing note (optional)</span>
                <textarea
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Great turnout; one bat damaged and logged for repair."
                  className="field w-full rounded-xl px-3.5 py-2.5 text-sm"
                />
              </label>
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                {checklist.isReadyToComplete ? (
                  <Button variant="success" onClick={() => setConfirmOpen(true)}>
                    <Lock className="h-4 w-4" /> Finish and lock
                  </Button>
                ) : (
                  <Button variant="warning" onClick={() => setOverrideOpen(true)}>
                    <Lock className="h-4 w-4" /> Finish with override
                  </Button>
                )}
              </div>
            </WorkspaceCard>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Finish and lock this session?"
        tone="success"
        confirmLabel="Finish session"
        onConfirm={() => {
          const res = completeLiveSession(sessionId, undefined, note);
          if (res.error) return res;
          toast.success("Session completed", "The report is ready.");
          return true;
        }}
      >
        This cannot be undone. The report is saved and attendance, results, equipment and notes become read-only.
        {open.length > 0 && <span className="mt-2 block text-amber-800">Warnings: {open.map((o) => o.label.toLowerCase()).join(", ")}.</span>}
      </ConfirmDialog>

      <ReasonDialog
        open={overrideOpen}
        onClose={() => setOverrideOpen(false)}
        title="Finish with override"
        tone="warning"
        description={
          <div>
            <p>These items are unresolved and will be recorded in the report:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-mut">
              {blockers.map((b) => (
                <li key={b.key}>
                  {b.label} — {b.evidence}
                </li>
              ))}
            </ul>
            <p className="mt-2">This cannot be undone.</p>
          </div>
        }
        placeholder="e.g. Safety contact left early with approval; staff sign-off done by phone."
        confirmLabel="Finish session"
        onConfirm={(reason) => {
          const res = completeLiveSession(sessionId, reason, note);
          if (res.error) return res;
          toast.warning("Session completed with override", "The override reason is in the report and audit record.");
          return true;
        }}
      />
    </div>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-mut">{label}</dt>
      <dd className="mt-0.5 font-display text-xl font-bold tabular text-ink-lum">{value}</dd>
      <dd className="text-xs text-ink-mut">{detail}</dd>
    </div>
  );
}
