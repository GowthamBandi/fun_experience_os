"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight, Lock, MoveRight, Shuffle, Unlock, UsersRound } from "lucide-react";
import { useStore } from "@/lib/store";
import { selectSessionParticipantPool, type ParticipantPoolItem } from "@/lib/prototype/selectors/identity";
import { selectSessionTeams, selectTeamAllocationReadiness, selectUnassignedParticipants } from "@/lib/prototype/selectors/teams";
import { MAX_TEAMS } from "@/lib/prototype/services/teams";
import { cn } from "@/lib/format";
import { Button, StatusChip } from "@/components/ui/primitives";
import { EmptyState } from "@/components/ui/panels";
import { Field, Input, Select } from "@/components/ui/fields";
import { Dialog } from "@/components/ui/overlays";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog, MissionShell, ReasonDialog, WorkspaceCard, formatWhen, useMissionId, useOperatorName } from "@/components/missions/shared";

export default function TeamsPage() {
  return (
    <MissionShell tab="teams" sub="Split confirmed participants into teams, adjust with a reason, then lock the teams for the reveal.">
      <TeamsBody />
    </MissionShell>
  );
}

type MoveTarget = { item: ParticipantPoolItem; currentTeamId?: string };

function TeamsBody() {
  const sessionId = useMissionId();
  const { state, createTeams, allocateTeamsRandomly, moveTeamParticipant, swapTeamParticipants, lockTeams, unlockTeamsWithOverride } = useStore();
  const toast = useToast();
  const opName = useOperatorName();

  const pool = useMemo(() => selectSessionParticipantPool(state, sessionId), [state, sessionId]);
  const teams = useMemo(() => selectSessionTeams(state, sessionId), [state, sessionId]);
  const readiness = useMemo(() => selectTeamAllocationReadiness(state, sessionId), [state, sessionId]);
  const unassigned = useMemo(() => selectUnassignedParticipants(state, sessionId), [state, sessionId]);
  const history = useMemo(
    () =>
      (state.teamAssignments ?? [])
        .filter((ta) => ta.sessionId === sessionId && ta.status !== "active")
        .sort((a, b) => (b.movedAt ?? "").localeCompare(a.movedAt ?? ""))
        .slice(0, 12),
    [state.teamAssignments, sessionId],
  );

  const frozen = teams.some((t) => t.team.status === "locked" || t.team.status === "revealed");
  const revealed = teams.some((t) => t.team.status === "revealed");
  const hasMembers = teams.some((t) => t.currentMemberCount > 0);
  const byBooking = new Map(pool.map((p) => [p.booking.id, p]));
  const teamName = (id: string) => teams.find((t) => t.team.id === id)?.team.name ?? "a removed team";

  const [setupOpen, setSetupOpen] = useState(false);
  const [confirmShuffle, setConfirmShuffle] = useState(false);
  const [confirmLock, setConfirmLock] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [move, setMove] = useState<MoveTarget | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const [swap, setSwap] = useState<MoveTarget | null>(null);
  const [swapWith, setSwapWith] = useState("");

  const shuffle = () => {
    const res = allocateTeamsRandomly(sessionId);
    if (res.error) return res;
    toast.success("Teams allocated", `${readiness.eligibleCount} participants spread across ${Math.max(teams.length, 2)} teams.`);
    return true;
  };

  return (
    <div className="space-y-6">
      <WorkspaceCard
        title="Team setup"
        sub={
          revealed
            ? "Teams have been revealed. Cancel the reveal to change them."
            : frozen
              ? "Teams are locked for the reveal. Unlock with a reason to make changes."
              : `${readiness.eligibleCount} confirmed participants · ${readiness.teamsCount} teams · ${readiness.totalTeamCapacity} places`
        }
        right={
          <>
            <Button variant="secondary" disabled={frozen} onClick={() => setSetupOpen(true)}>
              <UsersRound className="h-4 w-4" /> {teams.length ? "Rebuild teams" : "Set up teams"}
            </Button>
            <Button
              variant="secondary"
              disabled={frozen || readiness.eligibleCount === 0}
              onClick={() => {
                if (hasMembers) return setConfirmShuffle(true);
                const res = shuffle();
                if (res !== true) toast.error("Teams not allocated", res.error);
              }}
            >
              <Shuffle className="h-4 w-4" /> Allocate randomly
            </Button>
            {frozen ? (
              <Button variant="secondary" disabled={revealed} onClick={() => setUnlockOpen(true)}>
                <Unlock className="h-4 w-4" /> Unlock
              </Button>
            ) : (
              <Button disabled={teams.length === 0} onClick={() => setConfirmLock(true)}>
                <Lock className="h-4 w-4" /> Lock teams
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-wrap gap-2 text-sm">
          <StatusChip value={readiness.isLocked ? "locked" : teams.length ? "allocated" : "not-generated"} />
          {readiness.unassignedCount > 0 && <StatusChip value={`${readiness.unassignedCount} without a team`} tone="warn" />}
          {!readiness.isCapacitySufficient && teams.length > 0 && <StatusChip value="Not enough places" tone="danger" />}
        </div>
      </WorkspaceCard>

      {teams.length === 0 ? (
        <EmptyState
          title="No teams yet"
          line={readiness.eligibleCount ? "Set up teams yourself, or allocate randomly and two teams sized for this session are created for you." : "Teams can be built once participants have confirmed places."}
          action={
            readiness.eligibleCount > 0 ? (
              <Button onClick={() => setSetupOpen(true)}>
                <UsersRound className="h-4 w-4" /> Set up teams
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {teams.map((t) => (
            <section key={t.team.id} className="rounded-panel border border-edge bg-white shadow-panel">
              <header className="border-b border-edge px-5 py-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-subtle font-mono text-xs font-bold text-brand-ink">{t.team.code}</span>
                    <h3 className="truncate text-[15px] font-semibold text-ink-lum">{t.team.name}</h3>
                  </div>
                  <StatusChip value={t.team.status} />
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${Math.min(100, Math.round((t.currentMemberCount / Math.max(1, t.team.capacity)) * 100))}%` }} />
                  </div>
                  <span className="whitespace-nowrap text-xs tabular text-ink-mut">
                    {t.currentMemberCount}/{t.team.capacity}
                  </span>
                </div>
              </header>
              <ul className="divide-y divide-edge">
                {t.activeAssignments.length === 0 && <li className="px-5 py-6 text-center text-sm text-ink-mut">No members yet.</li>}
                {t.activeAssignments.map((ta) => {
                  const p = byBooking.get(ta.bookingId);
                  if (!p) return null;
                  return (
                    <li key={ta.id} className="flex items-center justify-between gap-2 px-5 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink-lum">{p.booking.alias}</p>
                        <p className="font-mono text-xs text-ink-mut">{p.temporaryIdentity?.temporaryCode ?? "no code"}</p>
                      </div>
                      {!frozen && (
                        <div className="flex shrink-0 gap-1">
                          <Button variant="ghost" size="sm" onClick={() => { setMove({ item: p, currentTeamId: t.team.id }); setMoveTo(""); }} aria-label={`Move ${p.booking.alias}`}>
                            <MoveRight className="h-3.5 w-3.5" /> Move
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => { setSwap({ item: p, currentTeamId: t.team.id }); setSwapWith(""); }} aria-label={`Swap ${p.booking.alias}`} disabled={teams.length < 2}>
                            <ArrowLeftRight className="h-3.5 w-3.5" /> Swap
                          </Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {unassigned.length > 0 && teams.length > 0 && (
        <WorkspaceCard title="Without a team" sub="Confirmed participants who still need a team." bodyClassName="p-0">
          <ul className="divide-y divide-edge">
            {unassigned.map((p) => (
              <li key={p.booking.id} className="flex items-center justify-between gap-2 px-5 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-lum">{p.booking.alias}</p>
                  <p className="font-mono text-xs text-ink-mut">{p.temporaryIdentity?.temporaryCode ?? "no code"}</p>
                </div>
                <Button variant="secondary" size="sm" disabled={frozen} onClick={() => { setMove({ item: p }); setMoveTo(""); }}>
                  <MoveRight className="h-3.5 w-3.5" /> Add to team
                </Button>
              </li>
            ))}
          </ul>
        </WorkspaceCard>
      )}

      <WorkspaceCard title="Change history" sub="Earlier placements are kept when participants are moved, swapped or re-allocated." bodyClassName="p-0">
        {history.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-mut">No changes yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-edge bg-bg-sunken/80 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-mut">
                  <th className="px-5 py-2.5">Participant</th>
                  <th className="px-5 py-2.5">Left</th>
                  <th className="px-5 py-2.5">Reason</th>
                  <th className="px-5 py-2.5">By</th>
                  <th className="px-5 py-2.5">When</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-5 py-2.5 font-medium text-ink-lum">{byBooking.get(h.bookingId)?.booking.alias ?? h.bookingId}</td>
                    <td className="px-5 py-2.5 text-ink-sec">{teamName(h.teamId)}</td>
                    <td className="px-5 py-2.5 text-ink-mut">{h.reason ?? "—"}</td>
                    <td className="px-5 py-2.5 text-ink-mut">{opName(h.movedBy)}</td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-ink-mut">{formatWhen(h.movedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </WorkspaceCard>

      <SetupTeamsDialog
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        eligible={readiness.eligibleCount}
        hasMembers={hasMembers}
        onSubmit={(n, cap) => {
          const res = createTeams(sessionId, n, cap);
          if (res.error) return res;
          toast.success("Teams set up", `${n} teams of ${cap}. Allocate participants next.`);
          return true;
        }}
      />

      <ConfirmDialog open={confirmShuffle} onClose={() => setConfirmShuffle(false)} title="Re-allocate everyone?" confirmLabel="Allocate randomly" onConfirm={shuffle}>
        Every participant will be placed again at random, replacing manual moves. The current placements are kept in the change history.
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmLock}
        onClose={() => setConfirmLock(false)}
        title="Lock teams?"
        confirmLabel="Lock teams"
        onConfirm={() => {
          const res = lockTeams(sessionId);
          if (res.error) return res;
          toast.success("Teams locked", "Next: check the reveal checklist.");
          return true;
        }}
      >
        Locked teams cannot be changed without an unlock reason. Every confirmed participant must already have a team.
      </ConfirmDialog>

      <ReasonDialog
        open={unlockOpen}
        onClose={() => setUnlockOpen(false)}
        title="Unlock teams"
        tone="warning"
        description="Teams go back to editable. Lock them again before the reveal."
        placeholder="e.g. A late replacement joined and needs a team."
        confirmLabel="Unlock teams"
        onConfirm={(reason) => {
          const res = unlockTeamsWithOverride(sessionId, reason);
          if (res.error) return res;
          toast.success("Teams unlocked", "Remember to lock them again before the reveal.");
          return true;
        }}
      />

      <ReasonDialog
        open={!!move}
        onClose={() => setMove(null)}
        title={move?.currentTeamId ? `Move ${move.item.booking.alias}` : `Add ${move?.item.booking.alias ?? ""} to a team`}
        placeholder="e.g. Balance experience levels between teams."
        confirmLabel="Move participant"
        onConfirm={(reason) => {
          if (!moveTo) return { error: "Choose the team to move to." };
          const res = moveTeamParticipant({ sessionId, bookingId: move!.item.booking.id, targetTeamId: moveTo, reason });
          if (res.error) return res;
          toast.success("Participant moved", `${move!.item.booking.alias} is now in ${teamName(moveTo)}.`);
          return true;
        }}
      >
        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-ink-sec">Move to</legend>
          <div className="grid gap-2">
            {teams
              .filter((t) => t.team.id !== move?.currentTeamId)
              .map((t) => (
                <label
                  key={t.team.id}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-sm",
                    moveTo === t.team.id ? "border-brand bg-brand-subtle" : "border-edge hover:bg-slate-50",
                    t.isFull && "cursor-not-allowed opacity-60",
                  )}
                >
                  <span className="flex items-center gap-2.5">
                    <input type="radio" name="move-to" value={t.team.id} disabled={t.isFull} checked={moveTo === t.team.id} onChange={() => setMoveTo(t.team.id)} className="accent-[var(--brand)]" />
                    <span className="font-medium text-ink-lum">{t.team.name}</span>
                  </span>
                  <span className="text-xs text-ink-mut">{t.isFull ? "Full — use swap" : `${t.remainingCapacity} place(s) left`}</span>
                </label>
              ))}
          </div>
        </fieldset>
      </ReasonDialog>

      <ReasonDialog
        open={!!swap}
        onClose={() => setSwap(null)}
        title={`Swap ${swap?.item.booking.alias ?? ""}`}
        description="Both participants change teams. Works even when both teams are full."
        placeholder="e.g. Two friends asked to play on opposite teams."
        confirmLabel="Swap participants"
        onConfirm={(reason) => {
          if (!swapWith) return { error: "Choose who to swap with." };
          const res = swapTeamParticipants({ sessionId, bookingIdA: swap!.item.booking.id, bookingIdB: swapWith, reason });
          if (res.error) return res;
          toast.success("Participants swapped", `${swap!.item.booking.alias} ⇄ ${byBooking.get(swapWith)?.booking.alias}`);
          return true;
        }}
      >
        <Field label="Swap with">
          <Select value={swapWith} onChange={(e) => setSwapWith(e.target.value)}>
            <option value="">Choose a participant in another team…</option>
            {teams
              .filter((t) => t.team.id !== swap?.currentTeamId)
              .map((t) => (
                <optgroup key={t.team.id} label={t.team.name}>
                  {t.activeAssignments.map((ta) => {
                    const p = byBooking.get(ta.bookingId);
                    return p ? (
                      <option key={ta.bookingId} value={ta.bookingId}>
                        {p.booking.alias} {p.temporaryIdentity ? `(${p.temporaryIdentity.temporaryCode})` : ""}
                      </option>
                    ) : null;
                  })}
                </optgroup>
              ))}
          </Select>
        </Field>
      </ReasonDialog>
    </div>
  );
}

function SetupTeamsDialog({
  open,
  onClose,
  eligible,
  hasMembers,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  eligible: number;
  hasMembers: boolean;
  onSubmit: (n: number, cap: number) => { error?: string } | true;
}) {
  const [n, setN] = useState("2");
  const [cap, setCap] = useState(String(Math.max(2, Math.ceil(eligible / 2))));
  const [error, setError] = useState<string | null>(null);
  const places = Number(n) * Number(cap);

  return (
    <Dialog open={open} onClose={onClose} title="Set up teams">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const res = onSubmit(Number(n), Number(cap));
          if (res === true) onClose();
          else setError(res.error ?? "Teams were not created.");
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Number of teams">
            <Input type="number" min={1} max={MAX_TEAMS} value={n} onChange={(e) => { setN(e.target.value); setError(null); }} />
          </Field>
          <Field label="Players per team">
            <Input type="number" min={1} max={50} value={cap} onChange={(e) => { setCap(e.target.value); setError(null); }} />
          </Field>
        </div>
        <p className={cn("text-sm", places >= eligible ? "text-ink-mut" : "text-amber-700")}>
          {Number.isFinite(places) ? places : 0} places for {eligible} confirmed participants.
        </p>
        {hasMembers && <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Current members will be released from their teams. Their placements stay in the change history.</p>}
        {error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Save teams</Button>
        </div>
      </form>
    </Dialog>
  );
}
