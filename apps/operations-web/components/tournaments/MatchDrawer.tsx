"use client";

import { useEffect, useMemo, useState } from "react";
import { Flag, Pause, Play, ShieldAlert, Scale } from "lucide-react";
import { useStore } from "@/lib/store";
import type { Tournament, TournamentMatch } from "@/lib/prototype/entities";
import { entrantName } from "@/lib/prototype/services/tournament";
import { matchTitle } from "@/lib/prototype/selectors/tournament";
import { operatorName } from "@/lib/prototype/selectors/lookups";
import { formatWhen } from "@/lib/safety/time";
import { StatusChip } from "@/components/ui/primitives";
import { Drawer } from "@/components/ui/overlays";
import { Field, Input, Select } from "@/components/ui/fields";
import { useCommandFeedback } from "@/components/ui/toast";
import { cn } from "@/lib/format";
import { CommandDialog, DetailRow, DrawerSection, GatedButton, PermissionNote, ReasonDialog, TextArea, useTournamentGate, useSafetyGate } from "@/components/safety/shared";
import { ReportIncidentDialog, LogDisputeDialog } from "@/components/safety/intake";

type DialogKind = null | "referee" | "result" | "correct" | "walkover" | "abandon" | "incident" | "dispute";
const RUNNING_TOURNAMENT = ["published", "live", "paused", "awaiting-verification"];

export function MatchDrawer({ tournament, matchId, onClose }: { tournament: Tournament; matchId: string | null; onClose: () => void }) {
  const { state, operator, updateMatchReadiness, startTournamentMatch, pauseTournamentMatch, resumeTournamentMatch, verifyTournamentMatchResult } = useStore();
  const gate = useTournamentGate();
  const safetyGate = useSafetyGate();
  const feedback = useCommandFeedback();
  const [dialog, setDialog] = useState<DialogKind>(null);
  const m = useMemo(() => (matchId ? state.tournamentMatches.find((x) => x.id === matchId && x.tournamentId === tournament.id) : undefined), [state, matchId, tournament.id]);
  const next = m?.nextMatchId ? state.tournamentMatches.find((x) => x.id === m.nextMatchId) : undefined;

  if (!matchId) return <Drawer open={false} onClose={onClose} title="">{null}</Drawer>;
  if (!m) {
    return (
      <Drawer open onClose={onClose} title="Match not found">
        <p className="text-sm text-ink-mut">This match no longer exists — the bracket may have been regenerated.</p>
      </Drawer>
    );
  }

  const terr = tournament.territoryId;
  const g = {
    referee: gate("match.referee", terr),
    run: gate("match.run", terr),
    result: gate("match.result", terr),
    verify: gate("match.verify", terr),
    correct: gate("match.correct", terr),
    walkover: gate("match.walkover", terr),
    abandon: gate("match.abandon", terr),
  };
  const running = RUNNING_TOURNAMENT.includes(tournament.status);
  const notYet = { allowed: false, reason: tournament.status === "completed" ? "The tournament is complete." : "Publish the tournament before running matches." };
  const when = (x: { allowed: boolean; reason?: string }) => (running ? x : notYet);
  const pre = m.status === "scheduled" || m.status === "ready";
  const live = m.status === "live" || m.status === "paused";
  const lastRevision = m.resultRevisions?.[m.resultRevisions.length - 1];
  const selfVerify = tournament.verificationRequirement === "dual" && lastRevision?.recordedBy === operator?.id;
  const verifyGate = selfVerify ? { allowed: false, reason: "This tournament needs a second person to verify: you recorded this result." } : g.verify;
  const correctable = ["awaiting-verification", "verified", "completed"].includes(m.status) && m.resultType === "score" && tournament.status !== "completed";
  const nextStarted = next && !["scheduled", "ready"].includes(next.status);
  const refereeName = m.refereeId ? operatorName(state, m.refereeId) : undefined;
  const firstDenied = [pre ? when(g.run) : undefined, live ? when(g.result) : undefined, m.status === "awaiting-verification" ? verifyGate : undefined].find((x) => x && !x.allowed);

  return (
    <Drawer open onClose={onClose} title={matchTitle(m)} sub={`${tournament.name}`} width="max-w-lg">
      <div className="space-y-5">
        <div className="rounded-2xl border border-edge bg-bg-sunken/60 p-4">
          <div className="flex items-center justify-between gap-2">
            <StatusChip value={m.status} />
            {m.resultType && m.resultType !== "score" && <span className="text-xs font-semibold capitalize text-ink-sec">{m.resultType}</span>}
          </div>
          {[m.teamAId, m.teamBId].map((tid, i) => {
            const score = i === 0 ? m.scoreA : m.scoreB;
            const won = !!m.winnerTeamId && tid === m.winnerTeamId && !["awaiting-verification"].includes(m.status);
            return (
              <div key={i} className="mt-3 flex items-center justify-between gap-3">
                <span className={cn("text-base", won ? "font-bold text-ink-lum" : tid ? "text-ink-sec" : "italic text-ink-mut")}>{tid ? entrantName(tournament, tid) : "To be decided"}</span>
                <span className={cn("font-display text-2xl tabular", won ? "font-bold text-ink-lum" : "text-ink-mut")}>{score ?? "–"}</span>
              </div>
            );
          })}
          {m.status === "awaiting-verification" && m.winnerTeamId && <p className="mt-3 text-xs text-amber-700">Recorded winner: {entrantName(tournament, m.winnerTeamId)} — waiting for verification before advancing.</p>}
        </div>

        {!m.isBye && tournament.status !== "completed" && (
          <DrawerSection title="Actions">
            <div className="flex flex-wrap gap-2">
              {pre && <GatedButton gate={when(g.referee)} size="sm" variant="secondary" onClick={() => setDialog("referee")}>{m.refereeId ? "Change referee" : "Assign referee"}</GatedButton>}
              {pre && m.status === "scheduled" && <GatedButton gate={when(g.run)} size="sm" variant="secondary" onClick={() => feedback(updateMatchReadiness(tournament.id, m.id, "ready"), "Match marked ready")}>Mark ready</GatedButton>}
              {pre && m.status === "ready" && <GatedButton gate={when(g.run)} size="sm" variant="secondary" onClick={() => feedback(updateMatchReadiness(tournament.id, m.id, "scheduled"), "Match set back to scheduled")}>Not ready</GatedButton>}
              {pre && <GatedButton gate={when(g.run)} size="sm" onClick={() => feedback(startTournamentMatch(tournament.id, m.id), "Match started")}><Play className="h-3.5 w-3.5" /> Start match</GatedButton>}
              {m.status === "live" && <GatedButton gate={when(g.run)} size="sm" variant="secondary" onClick={() => feedback(pauseTournamentMatch(tournament.id, m.id), "Match paused")}><Pause className="h-3.5 w-3.5" /> Pause</GatedButton>}
              {m.status === "paused" && <GatedButton gate={when(g.run)} size="sm" variant="secondary" onClick={() => feedback(resumeTournamentMatch(tournament.id, m.id), "Match resumed")}><Play className="h-3.5 w-3.5" /> Resume</GatedButton>}
              {live && <GatedButton gate={when(g.result)} size="sm" onClick={() => setDialog("result")}>Record result</GatedButton>}
              {m.status === "awaiting-verification" && <GatedButton gate={verifyGate} size="sm" variant="success" onClick={() => feedback(verifyTournamentMatchResult(tournament.id, m.id), "Result verified", `${entrantName(tournament, m.winnerTeamId)} advance.`)}>Verify result</GatedButton>}
              {correctable && <GatedButton gate={nextStarted ? { allowed: false, reason: "The next match has started, so this result can no longer be corrected." } : g.correct} size="sm" variant="secondary" onClick={() => setDialog("correct")}>Correct result</GatedButton>}
              {(pre || live) && <GatedButton gate={when(g.walkover)} size="sm" variant="warning" onClick={() => setDialog("walkover")}><Flag className="h-3.5 w-3.5" /> Walkover</GatedButton>}
              {(pre || live) && <GatedButton gate={when(g.abandon)} size="sm" variant="ghost" onClick={() => setDialog("abandon")}>Abandon match</GatedButton>}
            </div>
            <div className="mt-3"><PermissionNote reason={firstDenied?.reason} /></div>
          </DrawerSection>
        )}

        <DrawerSection title="Details">
          <dl className="divide-y divide-slate-100">
            <DetailRow label="Scheduled">{formatWhen(m.scheduledAt)}</DetailRow>
            <DetailRow label="Playing area">{m.playingAreaId ? state.playingAreas.find((p) => p.id === m.playingAreaId)?.name ?? m.playingAreaId : "—"}</DetailRow>
            <DetailRow label="Referee">{refereeName ?? <span className="text-amber-700">Not assigned</span>}</DetailRow>
            {m.startedAt && <DetailRow label="Started">{formatWhen(m.startedAt)}</DetailRow>}
            {m.verifiedAt && <DetailRow label="Verified">{formatWhen(m.verifiedAt)}{m.verifiedBy ? ` by ${operatorName(state, m.verifiedBy)}` : ""}</DetailRow>}
            {m.walkoverReason && <DetailRow label="Walkover">{m.walkoverReason}</DetailRow>}
            {m.disqualificationReason && <DetailRow label="Disqualified">{entrantName(tournament, m.disqualifiedTeamId)} — {m.disqualificationReason}</DetailRow>}
            {m.abandonReason && <DetailRow label="Abandoned">{m.abandonReason}</DetailRow>}
            {next && <DetailRow label="Winner goes to">{matchTitle(next)}</DetailRow>}
          </dl>
        </DrawerSection>

        {m.resultRevisions && m.resultRevisions.length > 0 && (
          <DrawerSection title="Result history">
            <ol className="space-y-2">
              {m.resultRevisions.map((r) => (
                <li key={r.revisionNumber} className="rounded-xl border border-edge px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-ink-lum">{r.revisionNumber === 1 ? "Recorded" : `Correction ${r.revisionNumber - 1}`}: {r.scoreA}–{r.scoreB}</span>
                    <span className="text-xs text-ink-mut">{formatWhen(r.recordedAt)}</span>
                  </div>
                  <p className="text-xs text-ink-mut">
                    Winner {entrantName(tournament, r.winnerTeamId)} · by {operatorName(state, r.recordedBy)}
                    {r.verifiedBy ? ` · verified by ${operatorName(state, r.verifiedBy)}` : " · not yet verified"}
                  </p>
                  {r.reason && <p className="mt-1 text-xs text-ink-sec">{r.reason}</p>}
                </li>
              ))}
            </ol>
          </DrawerSection>
        )}

        {!m.isBye && (
          <DrawerSection title="Problems during this match">
            <div className="flex flex-wrap gap-2">
              <GatedButton gate={safetyGate("incident.report", terr)} size="sm" variant="secondary" onClick={() => setDialog("incident")}><ShieldAlert className="h-3.5 w-3.5" /> Report incident</GatedButton>
              <GatedButton gate={safetyGate("dispute.submit", terr)} size="sm" variant="secondary" onClick={() => setDialog("dispute")}><Scale className="h-3.5 w-3.5" /> Log dispute</GatedButton>
            </div>
          </DrawerSection>
        )}
      </div>

      <RefereeDialog open={dialog === "referee"} onClose={() => setDialog(null)} tournament={tournament} match={m} />
      <ResultDialog open={dialog === "result" || dialog === "correct"} correction={dialog === "correct"} onClose={() => setDialog(null)} tournament={tournament} match={m} />
      <WalkoverDialog open={dialog === "walkover"} onClose={() => setDialog(null)} tournament={tournament} match={m} />
      <AbandonDialog open={dialog === "abandon"} onClose={() => setDialog(null)} tournament={tournament} match={m} />
      <ReportIncidentDialog open={dialog === "incident"} onClose={() => setDialog(null)} tournamentId={tournament.id} />
      <LogDisputeDialog open={dialog === "dispute"} onClose={() => setDialog(null)} tournamentId={tournament.id} />
    </Drawer>
  );
}

function RefereeDialog({ open, onClose, tournament, match }: { open: boolean; onClose: () => void; tournament: Tournament; match: TournamentMatch }) {
  const { state, assignMatchReferee } = useStore();
  const [value, setValue] = useState(match.refereeId ?? "");
  useEffect(() => { if (open) setValue(match.refereeId ?? ""); }, [open, match.refereeId]);
  const crew = state.crew.filter((c) => c.territoryId === tournament.territoryId);
  const ops = state.operators.filter((o) => o.status !== "suspended" && o.territoryId === tournament.territoryId && ["coordinator", "staff", "ops-manager", "venue-manager"].includes(o.role));
  return (
    <CommandDialog open={open} onClose={onClose} title="Assign referee" confirmLabel="Assign referee" canSubmit={!!value} success="Referee assigned" onSubmit={() => assignMatchReferee(tournament.id, match.id, value)}>
      <Field label="Referee" hint="Crew and operators in this tournament's territory.">
        <Select value={value} onChange={(e) => setValue(e.target.value)} required>
          <option value="">Choose…</option>
          {crew.length > 0 && (
            <optgroup label="Crew">
              {crew.map((c) => (
                <option key={c.id} value={c.id}>{c.name} — {c.assignment}</option>
              ))}
            </optgroup>
          )}
          {ops.length > 0 && (
            <optgroup label="Operators">
              {ops.map((o) => (
                <option key={o.id} value={o.id}>{o.name} — {o.title}</option>
              ))}
            </optgroup>
          )}
        </Select>
      </Field>
    </CommandDialog>
  );
}

function ResultDialog({ open, onClose, tournament, match, correction }: { open: boolean; onClose: () => void; tournament: Tournament; match: TournamentMatch; correction: boolean }) {
  const { confirmTournamentMatchResult, correctTournamentMatchResult } = useStore();
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => {
    if (!open) return;
    setA(correction && match.scoreA !== undefined ? String(match.scoreA) : "");
    setB(correction && match.scoreB !== undefined ? String(match.scoreB) : "");
    setNote("");
  }, [open, correction, match.scoreA, match.scoreB]);
  const sa = a === "" ? NaN : Number(a);
  const sb = b === "" ? NaN : Number(b);
  const valid = Number.isInteger(sa) && Number.isInteger(sb) && sa >= 0 && sb >= 0;
  const winner = valid && sa !== sb ? (sa > sb ? match.teamAId : match.teamBId) : undefined;
  const nameA = entrantName(tournament, match.teamAId);
  const nameB = entrantName(tournament, match.teamBId);
  const changesWinner = correction && winner && winner !== match.winnerTeamId;
  return (
    <CommandDialog
      open={open}
      onClose={onClose}
      title={correction ? "Correct result" : "Record result"}
      confirmLabel={correction ? "Save correction" : "Submit for verification"}
      variant={correction ? "warning" : "primary"}
      canSubmit={!!winner && (!correction || note.trim().length >= 10)}
      success={correction ? "Result corrected" : "Result recorded — waiting for verification"}
      onSubmit={() =>
        correction
          ? correctTournamentMatchResult({ tournamentId: tournament.id, matchId: match.id, scoreA: sa, scoreB: sb, winnerTeamId: winner!, reason: note })
          : confirmTournamentMatchResult({ tournamentId: tournament.id, matchId: match.id, scoreA: sa, scoreB: sb, winnerTeamId: winner!, note })
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label={nameA}>
          <Input type="number" inputMode="numeric" min={0} step={1} value={a} onChange={(e) => setA(e.target.value)} aria-label={`${nameA} score`} required />
        </Field>
        <Field label={nameB}>
          <Input type="number" inputMode="numeric" min={0} step={1} value={b} onChange={(e) => setB(e.target.value)} aria-label={`${nameB} score`} required />
        </Field>
      </div>
      <p className={cn("rounded-xl px-3 py-2 text-sm", winner ? "bg-emerald-50 text-emerald-800" : "bg-bg-sunken text-ink-mut")}>
        {winner ? `Winner: ${entrantName(tournament, winner)}` : valid && sa === sb ? "Knockout matches can't end level — enter the tie-break result." : "Enter both scores; the higher score wins."}
      </p>
      {changesWinner && <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">This changes the winner. The next match slot is updated to {entrantName(tournament, winner)}.</p>}
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-ink-sec">{correction ? "Reason for the correction (required)" : "Note for the verifier (optional)"}</span>
        <TextArea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[72px]" placeholder={correction ? "What was wrong and how it was confirmed." : "e.g. Went to a tie-break in game three."} />
      </label>
      {!correction && <p className="text-xs text-ink-mut">{tournament.verificationRequirement === "dual" ? "A second person must verify this result before the winner advances." : "The winner advances once the result is verified."}</p>}
    </CommandDialog>
  );
}

function WalkoverDialog({ open, onClose, tournament, match }: { open: boolean; onClose: () => void; tournament: Tournament; match: TournamentMatch }) {
  const { declareWalkover } = useStore();
  const [winner, setWinner] = useState("");
  const [reason, setReason] = useState("");
  useEffect(() => { if (open) { setWinner(""); setReason(""); } }, [open]);
  const teams = [match.teamAId, match.teamBId].filter((x): x is string => !!x);
  return (
    <CommandDialog open={open} onClose={onClose} title="Declare walkover" confirmLabel="Declare walkover" variant="warning" canSubmit={!!winner && reason.trim().length >= 10} success="Walkover declared" onSubmit={() => declareWalkover(tournament.id, match.id, winner, reason)}>
      <p className="text-sm leading-6 text-ink-sec">The chosen team advances without playing. Use this when the opponent didn&apos;t arrive, withdrew or can&apos;t continue.</p>
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="sr-only">Team that advances</legend>
        {teams.map((t) => (
          <label key={t} className={cn("cursor-pointer rounded-xl border p-3 text-sm font-semibold", winner === t ? "border-brand bg-brand-subtle text-brand-ink" : "border-edge text-ink-sec hover:bg-bg-sunken")}>
            <input type="radio" name="walkover-winner" value={t} checked={winner === t} onChange={() => setWinner(t)} className="sr-only" />
            {entrantName(tournament, t)} advances
          </label>
        ))}
      </fieldset>
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-ink-sec">Reason</span>
        <TextArea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Opponent did not check in within 15 minutes of the start time." />
      </label>
    </CommandDialog>
  );
}

function AbandonDialog({ open, onClose, tournament, match }: { open: boolean; onClose: () => void; tournament: Tournament; match: TournamentMatch }) {
  const { abandonMatch } = useStore();
  return (
    <ReasonDialog
      open={open}
      onClose={onClose}
      title="Abandon match"
      consequence={`Neither ${entrantName(tournament, match.teamAId)} nor ${entrantName(tournament, match.teamBId)} advances from this match. The next match will need a walkover or a replay decision.`}
      confirmLabel="Abandon match"
      variant="danger"
      success="Match abandoned"
      onSubmit={(r) => abandonMatch(tournament.id, match.id, r)}
    />
  );
}
