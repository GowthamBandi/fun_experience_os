"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import {
  tournamentDetail,
  tournamentProgress,
  tournamentCompletionReadiness
} from "@/lib/prototype/selectors/tournament";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, PanelHeader, PermissionDenied } from "@/components/ui/panels";
import { Button, StatusChip, Badge } from "@/components/ui/primitives";
import { Field, Input, Select } from "@/components/ui/fields";
import { Stagger, Item, Tide } from "@/components/motion/Motion";
import {
  ArrowLeft,
  Users,
  GitFork,
  Activity,
  Play,
  Pause,
  Award,
  AlertTriangle,
  FileText,
  CheckCircle,
  Plus
} from "lucide-react";
import Link from "next/link";

export default function TournamentWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const tournamentId = params.id as string;

  const {
    state,
    hydrated,
    role,
    canAccess,
    assignTournamentTeams,
    generateSingleEliminationBracket,
    publishTournament,
    assignMatchReferee,
    updateMatchReadiness,
    startTournamentMatch,
    pauseTournamentMatch,
    resumeTournamentMatch,
    confirmTournamentMatchResult,
    verifyTournamentMatchResult,
    declareWalkover,
    disqualifyTeam,
    abandonMatch,
    completeTournament,
    reportIncident,
    submitDispute
  } = useStore();

  const [activeTab, setActiveTab] = useState<"bracket" | "teams" | "matches" | "ops" | "summary">("bracket");

  // Local dialog / action states
  const [assignRefMatchId, setAssignRefMatchId] = useState<string | null>(null);
  const [selectedRefId, setSelectedRefId] = useState("");

  const [recordScoreMatchId, setRecordScoreMatchId] = useState<string | null>(null);
  const [scoreA, setScoreA] = useState("0");
  const [scoreB, setScoreB] = useState("0");
  const [matchWinnerId, setMatchWinnerId] = useState("");

  const [walkoverMatchId, setWalkoverMatchId] = useState<string | null>(null);
  const [walkoverWinnerId, setWalkoverWinnerId] = useState("");
  const [walkoverReason, setWalkoverReason] = useState("");

  const [disqualifyTeamId, setDisqualifyTeamId] = useState("");
  const [disqualifyReason, setDisqualifyReason] = useState("");

  const [abandonMatchId, setAbandonMatchId] = useState<string | null>(null);
  const [abandonReason, setAbandonReason] = useState("");

  const [addTeamName, setAddTeamName] = useState("");

  // Safety Incident Local Form
  const [showIncidentForm, setShowIncidentForm] = useState(false);
  const [incidentCategory, setIncidentCategory] = useState<any>("injury");
  const [incidentSeverity, setIncidentSeverity] = useState<any>("medium");
  const [incidentNotes, setIncidentNotes] = useState("");
  const [incidentAction, setIncidentAction] = useState("");

  // Dispute Local Form
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [disputeType, setDisputeType] = useState<any>("match-result");
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeMatchId, setDisputeMatchId] = useState("");

  const detail = useMemo(() => tournamentDetail(state, tournamentId), [state, tournamentId]);
  const progress = useMemo(() => tournamentProgress(state, tournamentId), [state, tournamentId]);
  const completion = useMemo(() => tournamentCompletionReadiness(state, tournamentId), [state, tournamentId]);

  if (!hydrated) return <div className="p-8 text-center"><Tide /></div>;
  if (!canAccess("/tournaments")) return <div className="p-8 text-center"><PermissionDenied module="Tournaments" /></div>;
  if (!detail) {
    return (
      <div className="p-8 text-center">
        <p className="text-lg text-ink-sec">Tournament not found</p>
        <Link href="/tournaments" className="mt-4 inline-block text-brand">Back to Tournaments</Link>
      </div>
    );
  }

  const crew = state.crew ?? [];
  const incidents = state.incidents.filter((i) => i.tournamentId === tournamentId);
  const disputes = state.disputes.filter((d) => d.tournamentId === tournamentId);

  // Teams in the pool to assign
  const availableTeamsPool = [
    "Ravi's XI", "Midnight Drive", "Net Runners", "Smash Order",
    "Net Kings", "Featherstorm", "Backline", "Court Pirates",
    "Gully Boyz", "Super Strikers", "Apex Smashers", "Spin Kings"
  ];

  const handleAddTeam = (teamName: string) => {
    if (!teamName || detail.teamIds.includes(teamName)) return;
    const newTeamIds = [...detail.teamIds, teamName];
    assignTournamentTeams(tournamentId, newTeamIds);
    setAddTeamName("");
  };

  const handleRemoveTeam = (teamName: string) => {
    const newTeamIds = detail.teamIds.filter((t) => t !== teamName);
    assignTournamentTeams(tournamentId, newTeamIds);
  };

  const handleGenerateBracket = () => {
    generateSingleEliminationBracket(tournamentId);
  };

  const handlePublish = () => {
    publishTournament(tournamentId);
  };

  const handleAssignReferee = () => {
    if (!assignRefMatchId || !selectedRefId) return;
    assignMatchReferee(tournamentId, assignRefMatchId, selectedRefId);
    setAssignRefMatchId(null);
    setSelectedRefId("");
  };

  const handleRecordResult = () => {
    if (!recordScoreMatchId || !matchWinnerId) return;
    confirmTournamentMatchResult({
      tournamentId,
      matchId: recordScoreMatchId,
      scoreA: parseInt(scoreA, 10) || 0,
      scoreB: parseInt(scoreB, 10) || 0,
      winnerTeamId: matchWinnerId,
      resultType: "score"
    });
    setRecordScoreMatchId(null);
    setMatchWinnerId("");
  };

  const handleDeclareWalkoverSubmit = () => {
    if (!walkoverMatchId || !walkoverWinnerId || !walkoverReason) return;
    declareWalkover(tournamentId, walkoverMatchId, walkoverWinnerId, walkoverReason);
    setWalkoverMatchId(null);
    setWalkoverWinnerId("");
    setWalkoverReason("");
  };

  const handleDisqualifySubmit = () => {
    if (!disqualifyTeamId || !disqualifyReason) return;
    disqualifyTeam(tournamentId, disqualifyTeamId, disqualifyReason);
    setDisqualifyTeamId("");
    setDisqualifyReason("");
  };

  const handleAbandonSubmit = () => {
    if (!abandonMatchId || !abandonReason) return;
    abandonMatch(tournamentId, abandonMatchId, abandonReason);
    setAbandonMatchId(null);
    setAbandonReason("");
  };

  const handleCompleteTournamentSubmit = () => {
    if (!completion.canComplete || !detail.matches.length) return;
    // Find final match winner
    const finalMatch = detail.matches.find((m) => m.roundLabel === "Final" || m.round === "Final");
    if (finalMatch?.winnerTeamId) {
      completeTournament(tournamentId, finalMatch.winnerTeamId);
    }
  };

  const handleReportIncidentSubmit = () => {
    if (!incidentNotes || !incidentAction) return;
    reportIncident({
      category: incidentCategory,
      severity: incidentSeverity,
      tournamentId,
      notes: incidentNotes,
      immediateAction: incidentAction,
      medicalAssistance: false,
      reportedBy: "op-master"
    });
    setShowIncidentForm(false);
    setIncidentNotes("");
    setIncidentAction("");
  };

  const handleReportDisputeSubmit = () => {
    if (!disputeReason || !disputeMatchId) return;
    submitDispute({
      type: disputeType,
      reason: disputeReason,
      relatedEntityType: "tournament-match",
      relatedEntityId: disputeMatchId,
      tournamentId,
      matchId: disputeMatchId,
      submittedBy: "Crew Member"
    });
    setShowDisputeForm(false);
    setDisputeReason("");
    setDisputeMatchId("");
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6">
      {/* Header section */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/tournaments" className="inline-flex items-center gap-1.5 text-xs text-ink-mut hover:text-ink-lum transition-colors mb-2">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to knockouts
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-ink-lum">{detail.name}</h1>
            <StatusChip value={detail.status} />
          </div>
          <p className="text-xs text-ink-mut mt-1">Code: {detail.code} · Format: {detail.format} · Seeding: {detail.seedingMethod}</p>
        </div>

        <div className="flex items-center gap-3 bg-white/4 border border-white/5 rounded-xl p-3">
          <div>
            <span className="block text-[10px] text-ink-mut overline">Progress</span>
            <span className="text-sm font-semibold text-[#ffd28a]">{progress.progressPercent}% resolved</span>
          </div>
          <div className="h-8 w-px bg-white/10" />
          <div>
            <span className="block text-[10px] text-ink-mut overline">Entrants</span>
            <span className="text-sm font-semibold text-ink-sec">{detail.teamIds.length} Teams</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/5 overflow-x-auto gap-4">
        {[
          { id: "bracket", label: "Bracket", icon: GitFork },
          { id: "teams", label: "Teams", icon: Users },
          { id: "matches", label: "Matches", icon: Activity },
          { id: "ops", label: "Ops & Safety", icon: AlertTriangle },
          { id: "summary", label: "Summary", icon: Award }
        ].map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              className={`flex items-center gap-2 px-3 py-2 border-b-2 text-xs font-semibold transition-all ${
                active ? "border-brand text-brand" : "border-transparent text-ink-mut hover:text-ink-sec"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab Contents */}
      <div className="mt-4">
        {activeTab === "bracket" && (
          <div className="space-y-6">
            <PanelHeader title="Tournament Bracket" sub="Visual bracket flow for the knockout matches." />

            {detail.matches.length === 0 ? (
              <div className="solid rounded-panel p-8 text-center">
                <p className="text-sm font-semibold text-ink-lum">Bracket is not generated yet</p>
                <p className="text-xs text-ink-mut mt-1">Assign teams and generate bracket to start the tournament.</p>
                {detail.status === "teams-ready" && (
                  <Button onClick={handleGenerateBracket} className="mt-4">Generate Bracket</Button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 overflow-x-auto py-4">
                {/* Round-by-round columns */}
                {[1, 2, 3].map((rNum) => {
                  const rMatches = detail.matches.filter((m) => m.roundNumber === rNum);
                  if (rMatches.length === 0) return null;
                  return (
                    <div key={rNum} className="space-y-6 min-w-[220px]">
                      <h3 className="text-xs font-bold text-ink-mut overline border-b border-white/5 pb-2">
                        {rMatches[0].roundLabel || `Round ${rNum}`}
                      </h3>
                      <div className="space-y-4">
                        {rMatches.map((m) => {
                          const ready = m.teamAId && m.teamBId;
                          return (
                            <div key={m.id} className="solid rounded-xl p-3 space-y-2 border border-white/5 relative">
                              <div className="flex items-center justify-between text-[10px] text-ink-mut">
                                <span>Match {m.matchNumber}</span>
                                <StatusChip value={m.status} />
                              </div>
                              <div className="space-y-1">
                                <div className="flex justify-between items-center text-xs">
                                  <span className={m.winnerTeamId === m.teamAId ? "font-semibold text-brand" : "text-ink-sec"}>
                                    {m.teamAId || <span className="italic text-ink-mut">TBD</span>}
                                  </span>
                                  <span className="font-mono text-ink-lum">{m.scoreA ?? "—"}</span>
                                </div>
                                <div className="flex justify-between items-center text-xs">
                                  <span className={m.winnerTeamId === m.teamBId ? "font-semibold text-brand" : "text-ink-sec"}>
                                    {m.teamBId || <span className="italic text-ink-mut">TBD</span>}
                                  </span>
                                  <span className="font-mono text-ink-lum">{m.scoreB ?? "—"}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === "teams" && (
          <div className="space-y-6">
            <PanelHeader title="Assigned Teams" sub="Manage participating teams in this bracket." />

            <div className="grid md:grid-cols-[1fr_300px] gap-6">
              <Card className="p-4 space-y-4">
                <h3 className="text-sm font-semibold text-ink-lum">Entrants ({detail.teamIds.length})</h3>
                {detail.teamIds.length === 0 ? (
                  <p className="text-xs text-ink-mut">No teams assigned yet.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {detail.teamIds.map((t) => (
                      <div key={t} className="flex justify-between items-center bg-white/4 p-2 rounded-lg border border-white/5 text-xs text-ink-sec">
                        <span>{t}</span>
                        {(detail.status === "draft" || detail.status === "registration-open") && (
                          <button onClick={() => handleRemoveTeam(t)} className="text-danger hover:underline">Remove</button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Add team panel */}
              {(detail.status === "draft" || detail.status === "registration-open") && (
                <Card className="p-4 space-y-4">
                  <h3 className="text-sm font-semibold text-ink-lum">Add Team</h3>
                  <div className="space-y-2">
                    <Field label="Custom Team Name">
                      <Input
                        placeholder="Enter team name"
                        value={addTeamName}
                        onChange={(e) => setAddTeamName(e.target.value)}
                      />
                    </Field>
                    <Button onClick={() => handleAddTeam(addTeamName)} className="w-full">Add Custom Team</Button>
                  </div>

                  <div className="border-t border-white/5 pt-4 space-y-2">
                    <span className="block text-xs font-semibold text-ink-mut">Quick Selection Pool</span>
                    <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                      {availableTeamsPool.map((teamName) => {
                        const added = detail.teamIds.includes(teamName);
                        return (
                          <button
                            key={teamName}
                            onClick={() => !added && handleAddTeam(teamName)}
                            disabled={added}
                            className={`text-[10px] px-2 py-1 rounded-md border transition-all ${
                              added ? "border-transparent bg-white/5 text-ink-mut" : "border-white/10 text-ink-sec hover:border-brand hover:text-brand"
                            }`}
                          >
                            {teamName}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </Card>
              )}
            </div>

            {/* Bracket Generation Area */}
            {(detail.status === "draft" || detail.status === "teams-ready") && (
              <div className="solid rounded-panel p-4 flex justify-between items-center gap-4 bg-brand/5 border border-brand/20">
                <div>
                  <span className="block text-sm font-semibold text-ink-lum">Ready to generate brackets?</span>
                  <span className="text-xs text-ink-mut">Make sure all teams are locked in. This will generate single elimination rounds.</span>
                </div>
                <Button onClick={handleGenerateBracket} disabled={detail.teamIds.length < 2}>Generate Bracket Structure</Button>
              </div>
            )}

            {detail.status === "bracket-ready" && (
              <div className="solid rounded-panel p-4 flex justify-between items-center gap-4 bg-[#12b76a]/5 border border-[#12b76a]/20">
                <div>
                  <span className="block text-sm font-semibold text-ink-lum">Bracket is ready. Publish now?</span>
                  <span className="text-xs text-ink-mut">Publishing opens scheduling, referee assignment, and match execution.</span>
                </div>
                <Button onClick={handlePublish} className="bg-[#12b76a] hover:bg-[#10a35e] text-white">Publish Tournament</Button>
              </div>
            )}
          </div>
        )}

        {activeTab === "matches" && (
          <div className="space-y-6">
            <PanelHeader title="Match Execution Workspace" sub="Assign referees, start matches, and record confirmed scores." />

            {detail.matches.length === 0 ? (
              <p className="text-xs text-ink-mut">No matches generated yet.</p>
            ) : (
              <div className="space-y-4">
                {detail.matches.map((m) => {
                  const ready = m.teamAId && m.teamBId;
                  return (
                    <Card key={m.id} className="p-4 flex flex-wrap items-center justify-between gap-4 border border-white/5 bg-white/2">
                      <div className="space-y-1 min-w-[200px]">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-ink-mut">{m.roundLabel || `Round ${m.roundNumber}`}</span>
                          <StatusChip value={m.status} />
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          <span className={m.winnerTeamId === m.teamAId ? "font-semibold text-brand" : "text-ink-sec"}>
                            {m.teamAId || <span className="italic text-ink-mut">TBD</span>}
                          </span>
                          <span className="text-ink-mut">vs</span>
                          <span className={m.winnerTeamId === m.teamBId ? "font-semibold text-brand" : "text-ink-sec"}>
                            {m.teamBId || <span className="italic text-ink-mut">TBD</span>}
                          </span>
                        </div>
                        <div className="text-[10px] text-ink-mut">
                          Referee: {m.refereeId ? crew.find((c) => c.id === m.refereeId)?.name || m.refereeId : <span className="italic text-danger">Unassigned</span>}
                        </div>
                      </div>

                      {/* Score Board */}
                      {(m.status === "completed" || m.status === "awaiting-verification" || m.status === "verified") && (
                        <div className="bg-white/4 rounded-xl px-4 py-2 text-center border border-white/5 min-w-[80px]">
                          <span className="block text-[9px] text-ink-mut overline">Final Score</span>
                          <span className="font-mono text-base font-semibold text-ink-lum">{m.scoreA} – {m.scoreB}</span>
                        </div>
                      )}

                      {/* Commands */}
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Assign Referee option */}
                        {(!m.refereeId && !m.isBye) && (
                          <Button variant="secondary" onClick={() => setAssignRefMatchId(m.id)} className="h-8 text-xs rounded-lg px-3">
                            Assign Referee
                          </Button>
                        )}

                        {/* Match Execution Actions */}
                        {m.status === "scheduled" && ready && (
                          <Button variant="secondary" onClick={() => startTournamentMatch(tournamentId, m.id)} className="h-8 text-xs rounded-lg px-3 gap-1 bg-brand/10 text-brand border border-brand/20">
                            <Play className="h-3.5 w-3.5 fill-current" />
                            Start Match
                          </Button>
                        )}

                        {m.status === "live" && (
                          <Button variant="secondary" onClick={() => pauseTournamentMatch(tournamentId, m.id)} className="h-8 text-xs rounded-lg px-3 gap-1 border-warning/20 text-warning bg-warning/5">
                            <Pause className="h-3.5 w-3.5 fill-current" />
                            Pause
                          </Button>
                        )}

                        {m.status === "paused" && (
                          <Button variant="secondary" onClick={() => resumeTournamentMatch(tournamentId, m.id)} className="h-8 text-xs rounded-lg px-3 gap-1 border-brand/20 text-brand bg-brand/5">
                            <Play className="h-3.5 w-3.5 fill-current" />
                            Resume
                          </Button>
                        )}

                        {/* Record Result */}
                        {(m.status === "live" || m.status === "paused") && (
                          <Button onClick={() => {
                            setRecordScoreMatchId(m.id);
                            setScoreA("0");
                            setScoreB("0");
                            setMatchWinnerId(m.teamAId || "");
                          }} className="h-8 text-xs rounded-lg px-3">
                            Confirm Score
                          </Button>
                        )}

                        {/* Verify Result */}
                        {m.status === "awaiting-verification" && (
                          <Button onClick={() => verifyTournamentMatchResult(tournamentId, m.id)} className="h-8 text-xs rounded-lg px-3 bg-[#12b76a] hover:bg-[#10a35e] text-white">
                            Verify Result
                          </Button>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Referee Assignment Modal/Overlay simulator */}
            {assignRefMatchId && (
              <Card className="p-4 border border-brand bg-brand/5 max-w-md mx-auto space-y-4">
                <PanelHeader title="Assign Match Referee" sub="Choose a crew member to officiate this match." />
                <Field label="Select Official">
                  <Select value={selectedRefId} onChange={(e) => setSelectedRefId(e.target.value)}>
                    <option value="">Choose referee...</option>
                    {crew.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.role})
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="flex gap-2 justify-end">
                  <Button variant="secondary" onClick={() => setAssignRefMatchId(null)}>Cancel</Button>
                  <Button onClick={handleAssignReferee} disabled={!selectedRefId}>Assign</Button>
                </div>
              </Card>
            )}

            {/* Score Recording Modal/Overlay simulator */}
            {recordScoreMatchId && (
              <Card className="p-4 border border-brand bg-brand/5 max-w-md mx-auto space-y-4">
                <PanelHeader title="Submit Match Scores" sub="Submit match results to verification queue." />
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Score A">
                    <Input type="number" value={scoreA} onChange={(e) => setScoreA(e.target.value)} />
                  </Field>
                  <Field label="Score B">
                    <Input type="number" value={scoreB} onChange={(e) => setScoreB(e.target.value)} />
                  </Field>
                </div>

                <Field label="Declared Winner">
                  <Select value={matchWinnerId} onChange={(e) => setMatchWinnerId(e.target.value)}>
                    <option value="">Select winner...</option>
                    <option value={detail.matches.find((m) => m.id === recordScoreMatchId)?.teamAId}>
                      {detail.matches.find((m) => m.id === recordScoreMatchId)?.teamAId}
                    </option>
                    <option value={detail.matches.find((m) => m.id === recordScoreMatchId)?.teamBId}>
                      {detail.matches.find((m) => m.id === recordScoreMatchId)?.teamBId}
                    </option>
                  </Select>
                </Field>

                <div className="flex gap-2 justify-end">
                  <Button variant="secondary" onClick={() => setRecordScoreMatchId(null)}>Cancel</Button>
                  <Button onClick={handleRecordResult} disabled={!matchWinnerId}>Submit Result</Button>
                </div>
              </Card>
            )}
          </div>
        )}

        {activeTab === "ops" && (
          <div className="space-y-6">
            <PanelHeader title="Operational Exceptions & Incidents" sub="Manage disputes, injuries, walkovers, and team disqualifications." />

            <div className="grid md:grid-cols-2 gap-6">
              {/* Left Column: Exceptions Form */}
              <div className="space-y-6">
                <Card className="p-4 space-y-4">
                  <h3 className="text-sm font-semibold text-danger flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4" />
                    Declare Administrative Walkover
                  </h3>
                  <div className="space-y-3">
                    <Field label="Match">
                      <Select value={walkoverMatchId || ""} onChange={(e) => setWalkoverMatchId(e.target.value || null)}>
                        <option value="">Select match...</option>
                        {detail.matches.filter((m) => m.status === "scheduled" || m.status === "live").map((m) => (
                          <option key={m.id} value={m.id}>
                            Match {m.matchNumber}: {m.teamAId} vs {m.teamBId}
                          </option>
                        ))}
                      </Select>
                    </Field>

                    <Field label="Award Win To">
                      <Select value={walkoverWinnerId} onChange={(e) => setWalkoverWinnerId(e.target.value)}>
                        <option value="">Select team...</option>
                        {walkoverMatchId && (
                          <>
                            <option value={detail.matches.find((m) => m.id === walkoverMatchId)?.teamAId}>
                              {detail.matches.find((m) => m.id === walkoverMatchId)?.teamAId}
                            </option>
                            <option value={detail.matches.find((m) => m.id === walkoverMatchId)?.teamBId}>
                              {detail.matches.find((m) => m.id === walkoverMatchId)?.teamBId}
                            </option>
                          </>
                        )}
                      </Select>
                    </Field>

                    <Field label="Walkover Reason">
                      <Input placeholder="e.g. Opponent team failed to check-in within 15 mins" value={walkoverReason} onChange={(e) => setWalkoverReason(e.target.value)} />
                    </Field>

                    <Button variant="danger" onClick={handleDeclareWalkoverSubmit} disabled={!walkoverMatchId || !walkoverWinnerId || !walkoverReason} className="w-full">
                      Declare Walkover
                    </Button>
                  </div>
                </Card>

                <Card className="p-4 space-y-4">
                  <h3 className="text-sm font-semibold text-danger flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4" />
                    Disqualify Team
                  </h3>
                  <div className="space-y-3">
                    <Field label="Select Team">
                      <Select value={disqualifyTeamId} onChange={(e) => setDisqualifyTeamId(e.target.value)}>
                        <option value="">Select team...</option>
                        {detail.teamIds.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </Select>
                    </Field>

                    <Field label="Reason">
                      <Input placeholder="e.g. Misconduct during play" value={disqualifyReason} onChange={(e) => setDisqualifyReason(e.target.value)} />
                    </Field>

                    <Button variant="danger" onClick={handleDisqualifySubmit} disabled={!disqualifyTeamId || !disqualifyReason} className="w-full">
                      Disqualify Team
                    </Button>
                  </div>
                </Card>
              </div>

              {/* Right Column: Incidents & Disputes Log */}
              <div className="space-y-6">
                <Card className="p-4 space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-semibold text-ink-lum">Safety Incidents ({incidents.length})</h3>
                    <Button onClick={() => setShowIncidentForm(true)} className="h-7 text-xs px-2.5 rounded-lg gap-1">
                      <Plus className="h-3.5 w-3.5" /> Report Incident
                    </Button>
                  </div>

                  {incidents.length === 0 ? (
                    <p className="text-xs text-ink-mut">No incidents logged for this tournament.</p>
                  ) : (
                    <div className="space-y-2">
                      {incidents.map((inc) => (
                        <div key={inc.id} className="bg-white/4 p-2 rounded-lg border border-white/5 text-xs">
                          <div className="flex justify-between items-center">
                            <span className="font-semibold text-ink-sec">{inc.incidentCode || inc.id}</span>
                            <StatusChip value={inc.status || "reported"} />
                          </div>
                          <p className="text-[10px] text-ink-mut mt-0.5">Category: {inc.category} · Severity: {inc.severity}</p>
                          <p className="text-ink-sec mt-1">{inc.notes}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                <Card className="p-4 space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-semibold text-ink-lum">Active Disputes ({disputes.length})</h3>
                    <Button onClick={() => setShowDisputeForm(true)} className="h-7 text-xs px-2.5 rounded-lg gap-1">
                      <Plus className="h-3.5 w-3.5" /> Submit Dispute
                    </Button>
                  </div>

                  {disputes.length === 0 ? (
                    <p className="text-xs text-ink-mut">No active disputes logged.</p>
                  ) : (
                    <div className="space-y-2">
                      {disputes.map((disp) => (
                        <div key={disp.id} className="bg-white/4 p-2 rounded-lg border border-white/5 text-xs">
                          <div className="flex justify-between items-center">
                            <span className="font-semibold text-ink-sec">{disp.id}</span>
                            <StatusChip value={disp.status || "submitted"} />
                          </div>
                          <p className="text-[10px] text-ink-mut mt-0.5">Type: {disp.type} · By: {disp.submittedBy}</p>
                          <p className="text-ink-sec mt-1">{disp.reason}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            </div>

            {/* Simulated Incident Form */}
            {showIncidentForm && (
              <Card className="p-4 border border-brand bg-brand/5 max-w-md mx-auto space-y-4">
                <PanelHeader title="Report Safety Incident" sub="Create a safety log entry for this tournament." />
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Category">
                    <Select value={incidentCategory} onChange={(e) => setIncidentCategory(e.target.value as any)}>
                      <option value="injury">Injury</option>
                      <option value="misconduct">Misconduct</option>
                      <option value="equipment">Equipment failure</option>
                      <option value="other">Other</option>
                    </Select>
                  </Field>
                  <Field label="Severity">
                    <Select value={incidentSeverity} onChange={(e) => setIncidentSeverity(e.target.value as any)}>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </Select>
                  </Field>
                </div>
                <Field label="Description Notes">
                  <Input placeholder="Describe what happened..." value={incidentNotes} onChange={(e) => setIncidentNotes(e.target.value)} />
                </Field>
                <Field label="Immediate Action Taken">
                  <Input placeholder="e.g. Applied ice, warned participant" value={incidentAction} onChange={(e) => setIncidentAction(e.target.value)} />
                </Field>
                <div className="flex gap-2 justify-end">
                  <Button variant="secondary" onClick={() => setShowIncidentForm(false)}>Cancel</Button>
                  <Button onClick={handleReportIncidentSubmit} disabled={!incidentNotes || !incidentAction}>Report</Button>
                </div>
              </Card>
            )}

            {/* Simulated Dispute Form */}
            {showDisputeForm && (
              <Card className="p-4 border border-brand bg-brand/5 max-w-md mx-auto space-y-4">
                <PanelHeader title="Submit Dispute Log" sub="Submit participant dispute concerning a match result." />
                <Field label="Dispute Type">
                  <Select value={disputeType} onChange={(e) => setDisputeType(e.target.value as any)}>
                    <option value="match-result">Match score count dispute</option>
                    <option value="participant-conduct">Unsportsmanlike conduct</option>
                    <option value="eligibility">Eligibility</option>
                  </Select>
                </Field>
                <Field label="Match">
                  <Select value={disputeMatchId} onChange={(e) => setDisputeMatchId(e.target.value)}>
                    <option value="">Select match...</option>
                    {detail.matches.map((m) => (
                      <option key={m.id} value={m.id}>
                        Match {m.matchNumber}: {m.teamAId} vs {m.teamBId}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Reason & Description">
                  <Input placeholder="Describe dispute reason..." value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)} />
                </Field>
                <div className="flex gap-2 justify-end">
                  <Button variant="secondary" onClick={() => setShowDisputeForm(false)}>Cancel</Button>
                  <Button onClick={handleReportDisputeSubmit} disabled={!disputeReason || !disputeMatchId}>Submit</Button>
                </div>
              </Card>
            )}
          </div>
        )}

        {activeTab === "summary" && (
          <div className="space-y-6">
            <PanelHeader title="Tournament Closure Summary" sub="Declare champions and wrap up bracket operations." />

            <div className="grid md:grid-cols-2 gap-6">
              <Card className="p-4 space-y-4">
                <h3 className="text-sm font-semibold text-ink-lum">Final Summary Status</h3>
                <div className="solid rounded-xl p-4 space-y-2 text-xs">
                  <div className="flex justify-between border-b border-white/5 pb-2">
                    <span className="text-ink-mut">Matches Complete:</span>
                    <span className="font-semibold text-ink-sec">{progress.completed} / {progress.total}</span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-2">
                    <span className="text-ink-mut">Champion Declared:</span>
                    <span className="font-semibold text-brand">{detail.winnerTeamId || "TBD"}</span>
                  </div>
                </div>

                {detail.status !== "completed" && (
                  <div className="space-y-3">
                    <div className="text-xs text-ink-mut bg-white/4 p-3 rounded-lg border border-white/5">
                      <strong>Completion Check:</strong> {completion.reason || "All matches verified! Ready to close."}
                    </div>
                    <Button
                      onClick={handleCompleteTournamentSubmit}
                      disabled={!completion.canComplete}
                      className="w-full bg-[#12b76a] hover:bg-[#10a35e] text-white"
                    >
                      Complete & Declare Champion
                    </Button>
                  </div>
                )}
              </Card>

              {detail.status === "completed" && (
                <Card className="p-4 text-center space-y-3 border border-brand bg-brand/5">
                  <CheckCircle className="h-12 w-12 text-brand mx-auto" />
                  <h3 className="text-lg font-bold text-ink-lum">Tournament Closed</h3>
                  <p className="text-xs text-ink-mut">This tournament has completed. The champion has been announced and all brackets are finalized.</p>
                  <p className="text-sm font-semibold text-brand">Champion: {detail.winnerTeamId}</p>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">{children}</div>;
}

function IconButton({
  label,
  children,
  ...rest
}: {
  label: string;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className="inline-flex h-10 w-10 items-center justify-center rounded-xl glass hover:bg-white/5 border border-white/5 text-ink-sec hover:text-ink-lum transition-all duration-200"
      title={label}
      {...rest}
    >
      {children}
    </button>
  );
}
