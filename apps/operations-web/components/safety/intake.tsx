"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import type { DisputeType, IncidentCategory, IncidentSeverity } from "@/lib/prototype/entities";
import { INCIDENT_CATEGORIES, INCIDENT_SEVERITIES } from "@/lib/prototype/validators/safetyValidation";
import { sessionTitle } from "@/lib/prototype/selectors/lookups";
import { entrantName } from "@/lib/prototype/services/tournament";
import { toLocalInput } from "@/lib/safety/time";
import { Field, Input, Select } from "@/components/ui/fields";
import { CommandDialog, TextArea } from "./shared";

const label = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, " ");

/** Report a safety incident. When `tournamentId` is given the incident is linked to it (and optionally a match). */
export function ReportIncidentDialog({
  open,
  onClose,
  tournamentId,
  defaultTerritoryId,
}: {
  open: boolean;
  onClose: () => void;
  tournamentId?: string;
  defaultTerritoryId?: string;
}) {
  const { state, reportIncident } = useStore();
  const [category, setCategory] = useState<IncidentCategory>("injury");
  const [severity, setSeverity] = useState<IncidentSeverity>("medium");
  const [sessionId, setSessionId] = useState("");
  const [matchId, setMatchId] = useState("");
  const [participants, setParticipants] = useState("");
  const [notes, setNotes] = useState("");
  const [action, setAction] = useState("");
  const [medical, setMedical] = useState(false);
  const [occurredAt, setOccurredAt] = useState("");

  useEffect(() => {
    if (!open) return;
    setCategory("injury");
    setSeverity("medium");
    setSessionId("");
    setMatchId("");
    setParticipants("");
    setNotes("");
    setAction("");
    setMedical(false);
    setOccurredAt(toLocalInput(new Date()));
  }, [open]);

  const tournament = tournamentId ? state.tournaments.find((t) => t.id === tournamentId) : undefined;
  const sessions = useMemo(
    () =>
      state.sessions
        .filter((s) => !defaultTerritoryId || s.territoryId === defaultTerritoryId)
        .filter((s) => !["cancelled", "archived"].includes(s.status as string)),
    [state.sessions, defaultTerritoryId],
  );
  const matches = tournament ? state.tournamentMatches.filter((m) => m.tournamentId === tournament.id && !m.isBye) : [];

  return (
    <CommandDialog
      open={open}
      onClose={onClose}
      wide
      title="Report a safety incident"
      confirmLabel="Report incident"
      variant="danger"
      canSubmit={notes.trim().length >= 10 && (!!tournament || !!sessionId)}
      success="Incident reported — the safety desk has been alerted"
      onSubmit={() =>
        reportIncident({
          category,
          severity,
          notes,
          immediateAction: action,
          medicalAssistance: medical,
          sessionId: tournament ? undefined : sessionId || undefined,
          tournamentId: tournament?.id,
          matchId: matchId || undefined,
          participantTemporaryIds: participants
            .split(/[,\s]+/)
            .map((p) => p.trim().toUpperCase())
            .filter(Boolean),
          occurredAt: occurredAt ? new Date(occurredAt).toISOString() : undefined,
        })
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="What kind of incident">
          <Select value={category} onChange={(e) => setCategory(e.target.value as IncidentCategory)}>
            {INCIDENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {label(c)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Severity" hint={severity === "critical" ? "Critical: acknowledge within 15 minutes." : undefined}>
          <Select value={severity} onChange={(e) => setSeverity(e.target.value as IncidentSeverity)}>
            {INCIDENT_SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </Select>
        </Field>
        {tournament ? (
          <Field label="Match (optional)">
            <Select value={matchId} onChange={(e) => setMatchId(e.target.value)}>
              <option value="">Whole tournament</option>
              {matches.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.roundLabel} · {entrantName(tournament, m.teamAId)} v {entrantName(tournament, m.teamBId)}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="Session">
            <Select value={sessionId} onChange={(e) => setSessionId(e.target.value)} required>
              <option value="">Choose the session…</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {sessionTitle(state, s.id)} · {s.date} {s.startTime}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="When it happened">
          <Input type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
        </Field>
      </div>
      <Field label="Participants involved (temporary IDs, optional)" hint="Separate with commas, e.g. CR-06, CR-08. Names are never stored here.">
        <Input value={participants} onChange={(e) => setParticipants(e.target.value)} placeholder="CR-06" />
      </Field>
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-ink-sec">What happened</span>
        <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Describe what happened, where, and who was affected." required />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-ink-sec">
          Immediate action taken {severity === "high" || severity === "critical" ? "(required)" : "(optional)"}
        </span>
        <Input value={action} onChange={(e) => setAction(e.target.value)} placeholder="e.g. Play paused, first aid given" />
      </label>
      <label className="flex items-center gap-2 text-sm text-ink-sec">
        <input
          type="checkbox"
          checked={medical}
          onChange={(e) => setMedical(e.target.checked)}
          className="h-4 w-4 rounded border-edge-strong accent-[#5b4cf5]"
        />
        Medical assistance was given or called
      </label>
    </CommandDialog>
  );
}

const DISPUTE_TYPES: DisputeType[] = [
  "match-result",
  "participant-conduct",
  "eligibility",
  "team-allocation",
  "staff-decision",
  "booking-refund",
  "venue-issue",
  "other",
];

/** Log a dispute raised by a participant, customer or staff member. */
export function LogDisputeDialog({
  open,
  onClose,
  tournamentId,
  defaultTerritoryId,
}: {
  open: boolean;
  onClose: () => void;
  tournamentId?: string;
  defaultTerritoryId?: string;
}) {
  const { state, submitDispute } = useStore();
  const [type, setType] = useState<DisputeType>(tournamentId ? "match-result" : "booking-refund");
  const [link, setLink] = useState("");
  const [raisedBy, setRaisedBy] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) return;
    setType(tournamentId ? "match-result" : "booking-refund");
    setLink(tournamentId ? `tournament:${tournamentId}` : "");
    setRaisedBy("");
    setReason("");
  }, [open, tournamentId]);

  const tournament = tournamentId ? state.tournaments.find((t) => t.id === tournamentId) : undefined;
  const options = useMemo(() => {
    if (tournament) {
      return [
        { value: `tournament:${tournament.id}`, label: `${tournament.name} (whole tournament)` },
        ...state.tournamentMatches
          .filter((m) => m.tournamentId === tournament.id && !m.isBye)
          .map((m) => ({ value: `match:${m.id}`, label: `${m.roundLabel} · ${entrantName(tournament, m.teamAId)} v ${entrantName(tournament, m.teamBId)}` })),
      ];
    }
    return [
      ...state.sessions
        .filter((s) => !defaultTerritoryId || s.territoryId === defaultTerritoryId)
        .map((s) => ({ value: `session:${s.id}`, label: `Session · ${sessionTitle(state, s.id)} · ${s.date}` })),
      ...state.tournaments
        .filter((t) => !defaultTerritoryId || t.territoryId === defaultTerritoryId)
        .map((t) => ({ value: `tournament:${t.id}`, label: `Tournament · ${t.name}` })),
    ];
  }, [state, tournament, defaultTerritoryId]);

  function submit() {
    const [kind, id] = link.split(":");
    const match = kind === "match" ? state.tournamentMatches.find((m) => m.id === id) : undefined;
    return submitDispute({
      type,
      reason,
      submittedBy: raisedBy,
      relatedEntityType: kind === "match" ? "tournament-match" : kind,
      relatedEntityId: id,
      tournamentId: kind === "tournament" ? id : match?.tournamentId,
      matchId: match?.id,
      sessionId: kind === "session" ? id : undefined,
    });
  }

  return (
    <CommandDialog
      open={open}
      onClose={onClose}
      wide
      title="Log a dispute"
      confirmLabel="Log dispute"
      canSubmit={!!link && raisedBy.trim().length >= 2 && reason.trim().length >= 10}
      success="Dispute logged for review"
      onSubmit={submit}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Dispute type">
          <Select value={type} onChange={(e) => setType(e.target.value as DisputeType)}>
            {DISPUTE_TYPES.map((t) => (
              <option key={t} value={t}>
                {label(t)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Raised by" hint="Team captain, customer booking code or staff member.">
          <Input value={raisedBy} onChange={(e) => setRaisedBy(e.target.value)} placeholder="e.g. Net Kings (captain)" required />
        </Field>
      </div>
      <Field label="What it concerns">
        <Select value={link} onChange={(e) => setLink(e.target.value)} required>
          <option value="">Choose…</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-ink-sec">What is disputed</span>
        <TextArea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="What does the person say went wrong, and what outcome do they want?"
          required
        />
      </label>
    </CommandDialog>
  );
}
