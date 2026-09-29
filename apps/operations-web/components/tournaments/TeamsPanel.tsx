"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, UserX } from "lucide-react";
import { useStore } from "@/lib/store";
import type { Tournament, TournamentEntrant } from "@/lib/prototype/entities";
import { IconButton, StatusChip } from "@/components/ui/primitives";
import { Input } from "@/components/ui/fields";
import { useCommandFeedback } from "@/components/ui/toast";
import {
  GatedButton,
  PermissionNote,
  ReasonDialog,
  useTournamentGate,
} from "@/components/safety/shared";

const EDITABLE = [
  "draft",
  "registration-open",
  "registration-closed",
  "teams-ready",
  "bracket-ready",
];

export function TeamsPanel({
  tournament,
  entrants,
}: {
  tournament: Tournament;
  entrants: TournamentEntrant[];
}) {
  const { state, assignTournamentTeams } = useStore();
  const gate = useTournamentGate();
  const feedback = useCommandFeedback();
  const [name, setName] = useState("");
  const [dq, setDq] = useState<TournamentEntrant | null>(null);
  const { disqualifyTeam } = useStore();
  const editable = EDITABLE.includes(tournament.status);
  const teamsGate = gate("tournament.teams", tournament.territoryId);
  const dqGate = gate("team.disqualify", tournament.territoryId);
  const max = tournament.maximumTeams ?? 64;
  const min = Math.max(2, tournament.minimumTeams ?? 2);

  const save = (
    list: Array<{ id?: string; name: string }>,
    message: string,
  ) => {
    const hadBracket = tournament.status === "bracket-ready";
    return feedback(
      assignTournamentTeams(tournament.id, list),
      message,
      hadBracket
        ? "The unpublished bracket was cleared — generate it again."
        : undefined,
    );
  };
  const current = entrants.map((e) => ({ id: e.id, name: e.name }));
  const move = (i: number, dir: -1 | 1) => {
    const next = [...current];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    save(next, "Seed order updated");
  };
  const openMatchFor = (teamId: string) =>
    state.tournamentMatches.some(
      (m) =>
        m.tournamentId === tournament.id &&
        ["scheduled", "ready", "live", "paused"].includes(m.status) &&
        (m.teamAId === teamId || m.teamBId === teamId),
    );

  return (
    <>
      <div className="space-y-4 p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-ink-lum">
              {entrants.length} of {max} teams entered
            </p>
            <p className="text-xs text-ink-mut">
              {editable
                ? `At least ${min} teams are needed to generate the bracket. ${tournament.seedingMethod === "seeded" ? "The order below is the seeding (1 = top seed)." : "The draw is random when the bracket is generated."}`
                : "Teams are locked because the tournament is published. Disqualify a team if it can no longer take part."}
            </p>
          </div>
        </div>

        {editable && (
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (
                save(
                  [...current, { name: name.trim() }],
                  `${name.trim()} entered`,
                )
              )
                setName("");
            }}
          >
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Team name"
              aria-label="New team name"
              className="h-10 sm:max-w-sm"
              disabled={!teamsGate.allowed}
            />
            <GatedButton
              gate={teamsGate}
              type="submit"
              variant="secondary"
              disabled={name.trim().length < 2 || entrants.length >= max}
            >
              <Plus className="h-4 w-4" /> Add team
            </GatedButton>
          </form>
        )}
        <PermissionNote
          reason={
            editable
              ? teamsGate.reason
              : tournament.status !== "completed"
                ? dqGate.reason
                : undefined
          }
        />

        {entrants.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-edge-strong px-4 py-10 text-center text-sm text-ink-mut">
            No teams entered yet.
          </p>
        ) : (
          <ol className="divide-y divide-slate-100 rounded-2xl border border-edge">
            {entrants.map((e, i) => (
              <li key={e.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-xs font-bold text-brand-ink">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink-lum">
                    {e.name}
                  </p>
                  {e.disqualifiedReason && (
                    <p className="truncate text-xs text-red-700">
                      Disqualified: {e.disqualifiedReason}
                    </p>
                  )}
                </div>
                {e.status === "disqualified" ? (
                  <StatusChip value="disqualified" />
                ) : tournament.winnerTeamId === e.id ? (
                  <StatusChip value="champion" tone="brand" />
                ) : null}
                {editable && teamsGate.allowed && (
                  <div className="flex items-center">
                    <IconButton
                      label={`Move ${e.name} up`}
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                      className="disabled:opacity-30"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </IconButton>
                    <IconButton
                      label={`Move ${e.name} down`}
                      disabled={i === entrants.length - 1}
                      onClick={() => move(i, 1)}
                      className="disabled:opacity-30"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </IconButton>
                    <IconButton
                      label={`Remove ${e.name}`}
                      onClick={() =>
                        save(
                          current.filter((x) => x.id !== e.id),
                          `${e.name} removed`,
                        )
                      }
                      className="hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </div>
                )}
                {!editable &&
                  e.status !== "disqualified" &&
                  tournament.status !== "completed" &&
                  openMatchFor(e.id) && (
                    <GatedButton
                      gate={dqGate}
                      size="sm"
                      variant="ghost"
                      onClick={() => setDq(e)}
                    >
                      <UserX className="h-3.5 w-3.5" /> Disqualify
                    </GatedButton>
                  )}
              </li>
            ))}
          </ol>
        )}
      </div>

      <ReasonDialog
        open={!!dq}
        onClose={() => setDq(null)}
        title={dq ? `Disqualify ${dq.name}?` : "Disqualify team"}
        consequence="Their current match is awarded to the opponent and they take no further part. This can't be undone."
        confirmLabel="Disqualify team"
        variant="danger"
        success="Team disqualified"
        onSubmit={(r) =>
          dq ? disqualifyTeam(tournament.id, dq.id, r) : undefined
        }
      />
    </>
  );
}
