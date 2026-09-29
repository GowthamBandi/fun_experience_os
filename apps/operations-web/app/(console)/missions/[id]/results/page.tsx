"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, History, PencilLine, Save } from "lucide-react";
import { useStore } from "@/lib/store";
import { selectLiveSessionState } from "@/lib/prototype/selectors/liveSession";
import { selectResultsProgress, segmentNeedsResult, isFinalResult } from "@/lib/prototype/selectors/results";
import type { ActivitySegment, ResultType, SegmentResult, Team, TeamScore } from "@/lib/prototype/entities";
import { cn } from "@/lib/format";
import { Button, StatusChip } from "@/components/ui/primitives";
import { EmptyState } from "@/components/ui/panels";
import { Field, Input, Select } from "@/components/ui/fields";
import { useToast } from "@/components/ui/toast";
import { MissionShell, MissionStageStepper, ReasonDialog, WorkspaceCard, formatWhen, useMissionId, useOperatorName } from "@/components/missions/shared";

export default function ResultsPage() {
  return (
    <MissionShell tab="results" sub="Record a score or outcome for every scored step that ran, then confirm it.">
      <ResultsBody />
    </MissionShell>
  );
}

const TYPE_LABEL: Record<string, string> = { score: "Score", draw: "Draw", outcome: "Outcome", abandoned: "Abandoned" };
const OUTCOMES = ["Completed as planned", "Group goal reached", "Partially completed", "Stopped early", "No result"];

function ResultsBody() {
  const sessionId = useMissionId();
  const { state } = useStore();
  const lss = selectLiveSessionState(state, sessionId);
  const progress = useMemo(() => selectResultsProgress(state, sessionId), [state, sessionId]);
  const teams = useMemo(() => (state.teams ?? []).filter((t) => t.sessionId === sessionId), [state.teams, sessionId]);
  const readOnly = lss.status === "Completed";
  const started = lss.status !== "Ready" && lss.status !== "Opening";

  const scored = progress.segments.filter((s) => segmentNeedsResult(s) || progress.results.some((r) => r.segmentId === s.id));
  const other = progress.segments.filter((s) => !scored.includes(s));

  return (
    <div className="space-y-6">
      <MissionStageStepper current="results" />

      {!started ? (
        <EmptyState title="Results open when the session starts" line="Start the session on the Run tab. Each match, round or activity that runs will need a confirmed result." action={<Link href={`/missions/${sessionId}/live`}><Button variant="secondary">Go to Run <ArrowRight className="h-4 w-4" /></Button></Link>} />
      ) : (
        <>
          <section className={cn("flex flex-wrap items-center justify-between gap-4 rounded-panel border p-5 shadow-panel", progress.isComplete ? "border-emerald-200 bg-emerald-50/60" : "border-edge bg-white")}>
            <div>
              <p className="font-display text-xl font-bold text-ink-lum">
                {progress.requiredCount === 0 ? "No scored steps have run yet" : progress.isComplete ? "All results confirmed" : `${progress.requiredCount - progress.confirmedCount} result(s) to confirm`}
              </p>
              <p className="mt-1 text-sm text-ink-sec">
                {progress.confirmedCount} confirmed · {progress.draftCount} draft · {progress.requiredCount} needed. Confirmed results can only be changed with a correction reason.
              </p>
            </div>
            {lss.status === "Ended" && progress.isComplete && (
              <Link href={`/missions/${sessionId}/completion`}>
                <Button>
                  Continue to Finish <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            )}
          </section>

          {teams.length === 0 && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">This session has no teams, so only outcomes (not scores) can be recorded.</p>}

          <div className="space-y-4">
            {scored.map((seg) => (
              <ResultCard key={seg.id} segment={seg} teams={teams} result={progress.results.find((r) => r.segmentId === seg.id)} readOnly={readOnly} />
            ))}
          </div>

          {other.length > 0 && (
            <WorkspaceCard title="Steps without a result" sub="Briefings, breaks and steps that did not run." bodyClassName="p-0">
              <ul className="divide-y divide-edge">
                {other.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                    <span className="text-ink-sec">
                      {s.sequence}. {s.name} <span className="text-ink-mut">· {s.type}</span>
                    </span>
                    <StatusChip value={s.status.toLowerCase()} />
                  </li>
                ))}
              </ul>
            </WorkspaceCard>
          )}
        </>
      )}
    </div>
  );
}

interface Draft {
  type: ResultType;
  scores: Record<string, string>;
  winner: string;
  outcome: string;
}

function initialDraft(segment: ActivitySegment, teams: Team[], r?: SegmentResult): Draft {
  const scores: Record<string, string> = {};
  teams.forEach((t) => (scores[t.id] = String(r?.teamScores?.find((s) => s.teamId === t.id)?.score ?? "")));
  const defaultType: ResultType = teams.length >= 2 && (segment.type === "Match" || segment.type === "Round") ? "score" : "outcome";
  return { type: r?.resultType ?? defaultType, scores, winner: r?.winnerTeamId ?? "", outcome: r?.outcome ?? "" };
}

function toPayload(d: Draft, teams: Team[]) {
  const teamScores: TeamScore[] | undefined =
    d.type === "score" || d.type === "draw"
      ? teams.filter((t) => d.scores[t.id] !== "" && d.scores[t.id] !== undefined).map((t) => ({ teamId: t.id, score: Number(d.scores[t.id]) }))
      : undefined;
  return {
    resultType: d.type,
    teamScores: teamScores && teamScores.length ? teamScores : undefined,
    winnerTeamId: d.type === "score" && d.winner ? d.winner : undefined,
    outcome: d.type === "outcome" || d.type === "abandoned" ? d.outcome.trim() || (d.type === "abandoned" ? "Abandoned" : "") : undefined,
  };
}

function ResultForm({ draft, setDraft, teams, disabled }: { draft: Draft; setDraft: (d: Draft) => void; teams: Team[]; disabled?: boolean }) {
  const leader = useMemo(() => {
    const vals = teams.map((t) => ({ id: t.id, v: Number(draft.scores[t.id]) })).filter((x) => Number.isFinite(x.v) && draft.scores[x.id] !== "");
    if (vals.length < 2) return "";
    const max = Math.max(...vals.map((x) => x.v));
    const top = vals.filter((x) => x.v === max);
    return top.length === 1 ? top[0].id : "";
  }, [draft.scores, teams]);

  return (
    <div className="space-y-4">
      <div className="inline-flex flex-wrap rounded-xl border border-edge bg-bg-sunken p-1" role="radiogroup" aria-label="Result type">
        {(teams.length >= 2 ? ["score", "draw", "outcome", "abandoned"] : ["outcome", "abandoned"]).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={draft.type === t}
            disabled={disabled}
            onClick={() => setDraft({ ...draft, type: t as ResultType, winner: t === "score" ? draft.winner : "" })}
            className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold", draft.type === t ? "bg-white text-brand-ink shadow-lift ring-1 ring-edge" : "text-ink-mut hover:text-ink-lum")}
          >
            {TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      {(draft.type === "score" || draft.type === "draw") && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {teams.map((t) => (
            <Field key={t.id} label={t.name}>
              <Input
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                disabled={disabled}
                value={draft.scores[t.id] ?? ""}
                onChange={(e) => setDraft({ ...draft, scores: { ...draft.scores, [t.id]: e.target.value } })}
                className="h-12 text-center font-display text-2xl font-bold tabular"
              />
            </Field>
          ))}
        </div>
      )}

      {draft.type === "score" && (
        <div className="max-w-xs">
          <Field label="Winner" hint={leader && draft.winner !== leader ? `Highest score: ${teams.find((t) => t.id === leader)?.name}` : undefined}>
            <Select disabled={disabled} value={draft.winner} onChange={(e) => setDraft({ ...draft, winner: e.target.value })}>
              <option value="">No winner declared</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}

      {(draft.type === "outcome" || draft.type === "abandoned") && (
        <div className="max-w-md">
          <Field label={draft.type === "abandoned" ? "Why was it abandoned?" : "Outcome"} hint={draft.type === "outcome" ? "Pick a suggestion or type your own." : undefined}>
            <Input
              list={draft.type === "outcome" ? "outcome-suggestions" : undefined}
              disabled={disabled}
              value={draft.outcome}
              onChange={(e) => setDraft({ ...draft, outcome: e.target.value })}
              placeholder={draft.type === "abandoned" ? "e.g. Rain stopped play" : "e.g. Completed as planned"}
            />
          </Field>
          <datalist id="outcome-suggestions">
            {OUTCOMES.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </div>
      )}
    </div>
  );
}

function ResultCard({ segment, teams, result, readOnly }: { segment: ActivitySegment; teams: Team[]; result?: SegmentResult; readOnly: boolean }) {
  const sessionId = useMissionId();
  const { createDraftResult, confirmResult, correctResult } = useStore();
  const toast = useToast();
  const opName = useOperatorName();
  const final = isFinalResult(result);
  const [draft, setDraft] = useState<Draft>(() => initialDraft(segment, teams, result));
  const [correcting, setCorrecting] = useState(false);
  const [correction, setCorrection] = useState<Draft>(() => initialDraft(segment, teams, result));
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (correcting) setCorrection(initialDraft(segment, teams, result));
  }, [correcting, segment, teams, result]);

  const teamName = (id?: string) => teams.find((t) => t.id === id)?.name ?? "—";
  const summary = (r: { resultType: ResultType; teamScores?: TeamScore[]; winnerTeamId?: string; outcome?: string }) =>
    r.resultType === "score" || r.resultType === "draw"
      ? `${(r.teamScores ?? []).map((s) => `${teamName(s.teamId)} ${s.score}`).join(" – ")}${r.resultType === "draw" ? " (draw)" : r.winnerTeamId ? ` · winner ${teamName(r.winnerTeamId)}` : ""}`
      : `${TYPE_LABEL[r.resultType] ?? r.resultType}: ${r.outcome ?? "—"}`;

  const save = (confirmAfter: boolean) => {
    const res = createDraftResult({ sessionId, segmentId: segment.id, ...toPayload(draft, teams) });
    if (res.error) return toast.error("Result not saved", res.error);
    if (!confirmAfter) return toast.success("Draft saved", segment.name);
    const conf = confirmResult(sessionId, segment.id);
    if (conf.error) toast.error("Draft saved but not confirmed", conf.error);
    else toast.success("Result confirmed", `${segment.name}: ${summary(toPayload(draft, teams))}`);
  };

  const chip = result ? result.status.toLowerCase() : "not recorded";

  return (
    <section className={cn("rounded-panel border bg-white shadow-panel", final ? "border-edge" : "border-amber-200")}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-edge px-5 py-4">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-ink-lum">
            {segment.sequence}. {segment.name}
          </p>
          <p className="text-xs text-ink-mut">
            {segment.type} · {segment.status.toLowerCase()}
            {result ? ` · last recorded by ${opName(result.recordedBy)} ${formatWhen(result.updatedAt)}` : ""}
          </p>
        </div>
        <StatusChip value={chip} tone={!result ? "warn" : result.status === "Draft" ? "warn" : result.status === "Corrected" ? "brand" : "ok"} />
      </header>

      <div className="space-y-4 p-5">
        {final ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-base font-semibold text-ink-lum">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" /> {summary(result!)}
            </p>
            {!readOnly && (
              <Button variant="secondary" size="sm" onClick={() => setCorrecting(true)}>
                <PencilLine className="h-3.5 w-3.5" /> Correct result
              </Button>
            )}
          </div>
        ) : readOnly ? (
          <p className="text-sm text-ink-mut">{result ? summary(result) : "No result was recorded."}</p>
        ) : (
          <>
            <ResultForm draft={draft} setDraft={setDraft} teams={teams} />
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => save(false)}>
                <Save className="h-4 w-4" /> Save draft
              </Button>
              <Button variant="success" onClick={() => save(true)}>
                <CheckCircle2 className="h-4 w-4" /> Confirm result
              </Button>
            </div>
          </>
        )}

        {result && result.revisions.length > 0 && (
          <div>
            <button type="button" onClick={() => setShowHistory((v) => !v)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:text-brand-hover" aria-expanded={showHistory}>
              <History className="h-3.5 w-3.5" /> {showHistory ? "Hide" : "Show"} history ({result.revisions.length})
            </button>
            {showHistory && (
              <ol className="mt-2 space-y-2 border-l-2 border-edge pl-4">
                {result.revisions.map((rev) => (
                  <li key={rev.revisionNumber} className="text-sm">
                    <p className="text-ink-lum">
                      #{rev.revisionNumber} {rev.status.toLowerCase()} — {summary(rev)}
                    </p>
                    <p className="text-xs text-ink-mut">
                      {opName(rev.recordedBy)} · {formatWhen(rev.recordedAt)}
                      {rev.reason ? ` · reason: ${rev.reason}` : ""}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>

      <ReasonDialog
        open={correcting}
        onClose={() => setCorrecting(false)}
        title={`Correct “${segment.name}”`}
        tone="warning"
        description="The previous result is kept in the history."
        label="Reason for the correction"
        placeholder="e.g. Scorecard recount: Blue Vipers scored 10, not 8."
        confirmLabel="Save correction"
        wide
        onConfirm={(reason) => {
          const res = correctResult({ sessionId, segmentId: segment.id, reason, ...toPayload(correction, teams) });
          if (res.error) return res;
          toast.success("Result corrected", summary(toPayload(correction, teams)));
          return true;
        }}
      >
        <ResultForm draft={correction} setDraft={setCorrection} teams={teams} />
      </ReasonDialog>
    </section>
  );
}
