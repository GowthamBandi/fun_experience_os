"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CalendarClock,
  ClipboardCheck,
  GitFork,
  ListOrdered,
  MapPin,
  Radio,
  ShieldAlert,
  Trophy,
  Users,
} from "lucide-react";
import { useStore } from "@/lib/store";
import {
  tournamentDetail,
  tournamentProgress,
  tournamentCompletionReadiness,
  tournamentPlacings,
  matchTitle,
} from "@/lib/prototype/selectors/tournament";
import { entrantName } from "@/lib/prototype/services/tournament";
import { operatorName } from "@/lib/prototype/selectors/lookups";
import { formatAgo, formatWhen } from "@/lib/safety/time";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  EmptyState,
  MetricTile,
  PermissionDenied,
} from "@/components/ui/panels";
import { Button, StatusChip } from "@/components/ui/primitives";
import { useCommandFeedback } from "@/components/ui/toast";
import { cn } from "@/lib/format";
import {
  CommandDialog,
  GatedButton,
  PermissionNote,
  SeverityBadge,
  TabBar,
  useTournamentGate,
  useSafetyGate,
} from "@/components/safety/shared";
import {
  ReportIncidentDialog,
  LogDisputeDialog,
} from "@/components/safety/intake";
import { Bracket } from "@/components/tournaments/Bracket";
import { MatchDrawer } from "@/components/tournaments/MatchDrawer";
import { TeamsPanel } from "@/components/tournaments/TeamsPanel";

type Tab = "bracket" | "matches" | "teams" | "safety";

export default function TournamentDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const {
    state,
    canAccess,
    hydrated,
    generateSingleEliminationBracket,
    publishTournament,
    completeTournament,
  } = useStore();
  const gate = useTournamentGate();
  const safetyGate = useSafetyGate();
  const feedback = useCommandFeedback();
  const [tab, setTab] = useState<Tab>("bracket");
  const [matchId, setMatchId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<
    null | "publish" | "complete" | "regenerate" | "incident" | "dispute"
  >(null);

  const detail = useMemo(() => tournamentDetail(state, id), [state, id]);
  const progress = useMemo(() => tournamentProgress(state, id), [state, id]);
  const completion = useMemo(
    () => tournamentCompletionReadiness(state, id),
    [state, id],
  );
  const placings = useMemo(() => tournamentPlacings(state, id), [state, id]);

  if (!canAccess("/tournaments"))
    return <PermissionDenied module="Tournaments" />;
  if (!hydrated) return null;
  if (!detail) {
    return (
      <div className="mx-auto w-full max-w-[1440px] px-5 py-7 lg:px-8">
        <EmptyState
          title="Tournament not found"
          line={`There is no tournament with the id "${id}". It may have been removed when the workspace was reset.`}
          action={
            <Link href="/tournaments">
              <Button variant="secondary">
                <ArrowLeft className="h-4 w-4" /> All tournaments
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  const t = detail;
  const terr = t.territoryId;
  const g = {
    bracket: gate("tournament.bracket", terr),
    publish: gate("tournament.publish", terr),
    complete: gate("tournament.complete", terr),
  };
  const playable = t.matches.filter((m) => !m.isBye);
  const awaiting = playable.filter((m) => m.status === "awaiting-verification");
  const live = playable.filter(
    (m) => m.status === "live" || m.status === "paused",
  );
  const incidents = state.incidents.filter((i) => i.tournamentId === t.id);
  const disputes = state.disputes.filter((d) => d.tournamentId === t.id);
  const canGenerate = [
    "draft",
    "registration-open",
    "registration-closed",
    "teams-ready",
  ].includes(t.status);
  const minTeams = Math.max(2, t.minimumTeams ?? 2);
  const championId = t.winnerTeamId;

  let primary: React.ReactNode = null;
  if (canGenerate) {
    const tooFew = t.teamIds.length < minTeams;
    primary = (
      <GatedButton
        gate={
          tooFew
            ? {
                allowed: false,
                reason: `Enter at least ${minTeams} teams first.`,
              }
            : g.bracket
        }
        onClick={() =>
          feedback(
            generateSingleEliminationBracket(t.id),
            "Bracket generated",
            "Check the draw, then publish.",
          )
        }
      >
        <GitFork className="h-4 w-4" /> Generate bracket
      </GatedButton>
    );
  } else if (t.status === "bracket-ready") {
    primary = (
      <>
        <GatedButton
          gate={g.bracket}
          variant="secondary"
          onClick={() => setDialog("regenerate")}
        >
          Redraw
        </GatedButton>
        <GatedButton gate={g.publish} onClick={() => setDialog("publish")}>
          Publish tournament
        </GatedButton>
      </>
    );
  } else if (
    ["published", "live", "paused", "awaiting-verification"].includes(t.status)
  ) {
    primary = (
      <GatedButton
        gate={
          completion.canComplete
            ? g.complete
            : { allowed: false, reason: completion.reason }
        }
        variant="success"
        onClick={() => setDialog("complete")}
      >
        <Trophy className="h-4 w-4" /> Complete tournament
      </GatedButton>
    );
  }

  return (
    <>
      <div className="mx-auto w-full max-w-[1440px] space-y-6 px-5 py-7 lg:px-8">
        <Link
          href="/tournaments"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-mut hover:text-ink-lum"
        >
          <ArrowLeft className="h-4 w-4" /> Tournaments
        </Link>
        <PageHeader
          overline={`${t.code} · Single elimination`}
          title={t.name}
          sub={`${t.venueName} · ${t.scheduledStart ? `starts ${formatWhen(t.scheduledStart)}` : "start time not set"} · ${t.verificationRequirement === "dual" ? "results verified by a second person" : "results verified before advancing"}`}
          right={
            <>
              <StatusChip value={t.status} className="h-8 px-3" />
              {primary}
            </>
          }
        />

        {championId && (
          <div className="relative overflow-hidden rounded-panel border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-violet-50 p-6 shadow-panel">
            <div className="flex flex-wrap items-center gap-5">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lift">
                <Trophy className="h-7 w-7" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="overline text-amber-700">Champion</p>
                <p className="font-display text-2xl font-bold text-ink-lum">
                  {entrantName(t, championId)}
                </p>
                <p className="mt-1 text-sm text-ink-mut">
                  {placings?.runnerUp && (
                    <>Runner-up {entrantName(t, placings.runnerUp)}</>
                  )}
                  {placings?.semiFinalists.length
                    ? ` · Semi-finalists ${placings.semiFinalists.map((x) => entrantName(t, x)).join(", ")}`
                    : ""}
                  {t.endedAt ? ` · Completed ${formatWhen(t.endedAt)}` : ""}
                </p>
              </div>
              {t.prizePlaceholder && (
                <p className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-ink-sec">
                  Prize: {t.prizePlaceholder}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricTile
            label="Teams"
            value={t.teamIds.length}
            detail={`${minTeams}–${t.maximumTeams ?? 64} allowed · ${t.seedingMethod === "seeded" ? "seeded" : "random draw"}`}
            icon={<Users className="h-4 w-4" />}
            tone="violet"
            onClick={() => setTab("teams")}
          />
          <MetricTile
            label="Matches decided"
            value={`${progress.completed}/${progress.total}`}
            detail={
              progress.total
                ? `${progress.progressPercent}% of the bracket`
                : "bracket not generated"
            }
            icon={<ListOrdered className="h-4 w-4" />}
            tone="emerald"
            onClick={() => setTab("matches")}
          />
          <MetricTile
            label="Live now"
            value={live.length}
            detail={
              live[0]
                ? `${entrantName(t, live[0].teamAId)} v ${entrantName(t, live[0].teamBId)}`
                : "no match in play"
            }
            icon={<Radio className="h-4 w-4" />}
            tone="sky"
            onClick={() => setTab("matches")}
          />
          <MetricTile
            label="Awaiting verification"
            value={awaiting.length}
            detail={
              awaiting.length
                ? "verify so winners advance"
                : "nothing to verify"
            }
            icon={<ClipboardCheck className="h-4 w-4" />}
            tone={awaiting.length ? "amber" : "emerald"}
            onClick={() => awaiting[0] && setMatchId(awaiting[0].id)}
          />
        </div>

        {awaiting.length > 0 && (
          <div className="rounded-panel border border-amber-200 bg-amber-50/60 p-4">
            <p className="text-sm font-semibold text-amber-800">
              Results waiting for verification
            </p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {awaiting.map((m) => (
                <li key={m.id}>
                  <button
                    onClick={() => setMatchId(m.id)}
                    className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-left text-sm hover:border-amber-400"
                  >
                    <span className="font-semibold text-ink-lum">
                      {entrantName(t, m.teamAId)} {m.scoreA}–{m.scoreB}{" "}
                      {entrantName(t, m.teamBId)}
                    </span>
                    <span className="block text-xs text-ink-mut">
                      {matchTitle(m)} · recorded{" "}
                      {formatAgo(m.resultRevisions?.at(-1)?.recordedAt)} by{" "}
                      {operatorName(
                        state,
                        m.resultRevisions?.at(-1)?.recordedBy,
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-panel border border-edge bg-white shadow-panel">
          <TabBar<Tab>
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "bracket", label: "Bracket", icon: GitFork },
              {
                id: "matches",
                label: "Matches",
                icon: ListOrdered,
                count: playable.length,
              },
              {
                id: "teams",
                label: "Teams",
                icon: Users,
                count: t.teamIds.length,
              },
              {
                id: "safety",
                label: "Incidents & disputes",
                icon: ShieldAlert,
                count: incidents.length + disputes.length,
              },
            ]}
          />

          {tab === "bracket" && (
            <div className="p-4 md:p-5">
              {t.rounds.length === 0 ? (
                <EmptyState
                  title="No bracket yet"
                  line={
                    t.teamIds.length < minTeams
                      ? `Enter at least ${minTeams} teams, then generate the bracket.`
                      : "Generate the bracket to draw the first round."
                  }
                  action={
                    canGenerate ? (
                      <Button
                        variant="secondary"
                        onClick={() => setTab("teams")}
                      >
                        Manage teams
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <>
                  <Bracket
                    tournament={t}
                    rounds={t.rounds}
                    onSelect={(m) => setMatchId(m.id)}
                    selectedId={matchId ?? undefined}
                  />
                  <p className="mt-3 text-xs text-ink-mut">
                    Select a match to assign a referee, start it, record or
                    verify the result.
                  </p>
                  {t.status === "bracket-ready" && (
                    <div className="mt-3">
                      <PermissionNote reason="This bracket is a draft. Publish the tournament to lock teams and start match day." />
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {tab === "matches" && (
            <div className="overflow-x-auto">
              {playable.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    title="No matches yet"
                    line="Matches appear once the bracket is generated."
                  />
                </div>
              ) : (
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-edge bg-bg-sunken text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-mut">
                      <th className="px-5 py-3">Match</th>
                      <th className="px-5 py-3">Teams</th>
                      <th className="px-5 py-3">Score</th>
                      <th className="px-5 py-3">Scheduled</th>
                      <th className="px-5 py-3">Referee</th>
                      <th className="px-5 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playable.map((m) => (
                      <tr
                        key={m.id}
                        onClick={() => setMatchId(m.id)}
                        className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-brand-subtle/30"
                      >
                        <td className="px-5 py-3 text-ink-sec">
                          <button
                            className="text-left font-medium text-ink-lum hover:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMatchId(m.id);
                            }}
                          >
                            {matchTitle(m)}
                          </button>
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className={cn(
                              m.winnerTeamId === m.teamAId &&
                                m.status !== "awaiting-verification" &&
                                "font-semibold text-ink-lum",
                            )}
                          >
                            {entrantName(t, m.teamAId)}
                          </span>
                          <span className="px-1.5 text-ink-mut">v</span>
                          <span
                            className={cn(
                              m.winnerTeamId === m.teamBId &&
                                m.status !== "awaiting-verification" &&
                                "font-semibold text-ink-lum",
                            )}
                          >
                            {entrantName(t, m.teamBId)}
                          </span>
                        </td>
                        <td className="px-5 py-3 font-display tabular text-ink-lum">
                          {m.scoreA !== undefined && m.scoreB !== undefined
                            ? `${m.scoreA}–${m.scoreB}`
                            : "—"}
                        </td>
                        <td className="px-5 py-3 text-ink-sec">
                          {formatWhen(m.scheduledAt)}
                        </td>
                        <td className="px-5 py-3 text-ink-sec">
                          {m.refereeId ? (
                            operatorName(state, m.refereeId)
                          ) : (
                            <span className="text-amber-700">Not assigned</span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <StatusChip value={m.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === "teams" && (
            <TeamsPanel tournament={t} entrants={t.entrants} />
          )}

          {tab === "safety" && (
            <div className="grid gap-5 p-4 md:p-5 lg:grid-cols-2">
              <section>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-ink-lum">
                    Incidents ({incidents.length})
                  </h3>
                  <GatedButton
                    gate={safetyGate("incident.report", terr)}
                    size="sm"
                    variant="secondary"
                    onClick={() => setDialog("incident")}
                  >
                    Report incident
                  </GatedButton>
                </div>
                {incidents.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-edge-strong px-4 py-8 text-center text-sm text-ink-mut">
                    No incidents recorded for this tournament.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {incidents.map((i) => (
                      <li
                        key={i.id}
                        className="rounded-xl border border-edge p-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-ink-sec">
                            {i.incidentCode ?? i.id}
                          </span>
                          <SeverityBadge severity={i.severity ?? "medium"} />
                          <StatusChip value={i.status ?? "reported"} />
                        </div>
                        <p className="mt-1 text-sm text-ink-lum">{i.notes}</p>
                        <p className="mt-1 text-xs text-ink-mut">
                          {formatWhen(i.reportedAt)} · handled on the Safety
                          page
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-ink-lum">
                    Disputes ({disputes.length})
                  </h3>
                  <GatedButton
                    gate={safetyGate("dispute.submit", terr)}
                    size="sm"
                    variant="secondary"
                    onClick={() => setDialog("dispute")}
                  >
                    Log dispute
                  </GatedButton>
                </div>
                {disputes.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-edge-strong px-4 py-8 text-center text-sm text-ink-mut">
                    No disputes raised for this tournament.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {disputes.map((d) => (
                      <li
                        key={d.id}
                        className="rounded-xl border border-edge p-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-ink-sec">
                            {d.id}
                          </span>
                          <StatusChip value={d.status} />
                        </div>
                        <p className="mt-1 text-sm text-ink-lum">{d.reason}</p>
                        <p className="mt-1 text-xs text-ink-mut">
                          Raised by {d.submittedBy} ·{" "}
                          {formatWhen(d.submittedAt)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
                {canAccess("/safety") && (
                  <Link
                    href="/safety"
                    className="mt-3 inline-block text-sm font-semibold text-brand-ink hover:underline"
                  >
                    Open Safety & disputes →
                  </Link>
                )}
              </section>
            </div>
          )}
        </div>

        <div className="grid gap-4 text-sm text-ink-sec md:grid-cols-3">
          <p className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-ink-mut" /> {t.venueName}
          </p>
          <p className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-ink-mut" /> {t.matchDuration}{" "}
            min matches · {t.breakDuration} min breaks
          </p>
          <p className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-ink-mut" />{" "}
            {t.prizePlaceholder || "No prize recorded"}
          </p>
        </div>
      </div>

      <MatchDrawer
        tournament={t}
        matchId={matchId}
        onClose={() => setMatchId(null)}
      />

      <CommandDialog
        open={dialog === "publish"}
        onClose={() => setDialog(null)}
        title="Publish tournament?"
        confirmLabel="Publish"
        success="Tournament published — match day is open"
        onSubmit={() => publishTournament(t.id)}
      >
        <p className="text-sm leading-6 text-ink-sec">
          Publishing locks the {t.teamIds.length} teams and the draw. After
          this, teams can only leave by walkover or disqualification.
        </p>
      </CommandDialog>
      <CommandDialog
        open={dialog === "regenerate"}
        onClose={() => setDialog(null)}
        title="Redraw the bracket?"
        confirmLabel="Redraw"
        variant="warning"
        success="Bracket redrawn"
        onSubmit={() => generateSingleEliminationBracket(t.id)}
      >
        <p className="text-sm leading-6 text-ink-sec">
          The current draft draw and any referee assignments are replaced with a
          new draw.
        </p>
      </CommandDialog>
      <CommandDialog
        open={dialog === "complete"}
        onClose={() => setDialog(null)}
        title="Complete tournament?"
        confirmLabel="Complete and crown champion"
        variant="success"
        success={() =>
          `Tournament complete — champion ${entrantName(t, completion.championId)}`
        }
        onSubmit={() => completeTournament(t.id)}
      >
        <p className="text-sm leading-6 text-ink-sec">
          {completion.championId ? (
            <>
              The final&apos;s winner,{" "}
              <strong>{entrantName(t, completion.championId)}</strong>, is
              recorded as champion.
            </>
          ) : null}{" "}
          Results can no longer be corrected afterwards.
        </p>
      </CommandDialog>
      <ReportIncidentDialog
        open={dialog === "incident"}
        onClose={() => setDialog(null)}
        tournamentId={t.id}
      />
      <LogDisputeDialog
        open={dialog === "dispute"}
        onClose={() => setDialog(null)}
        tournamentId={t.id}
      />
    </>
  );
}
