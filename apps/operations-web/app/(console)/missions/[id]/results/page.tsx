"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { selectSessionTeams } from "@/lib/prototype/selectors/teams";
import { selectSessionSegmentResults } from "@/lib/prototype/selectors/results";
import { selectLiveSessionState } from "@/lib/prototype/selectors/liveSession";
import { sessionTitle } from "@/lib/prototype/selectors/lookups";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/primitives";
import { ScoreOutcomeEntryForm } from "@/components/geo/ScoreOutcomeEntryForm";

export default function SessionResultsPage() {
  const params = useParams();
  const sessionId = params.id as string;

  const {
    state,
    createDraftResult,
    confirmResult,
    correctResult,
    role,
  } = useStore();

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const session = useMemo(() => state.sessions.find((s) => s.id === sessionId), [state, sessionId]);
  const liveState = useMemo(() => selectLiveSessionState(state, sessionId), [state, sessionId]);
  const teams = useMemo(() => selectSessionTeams(state, sessionId).map((t) => t.team), [state, sessionId]);
  const segments = useMemo(() => (state.activitySegments ?? []).filter((s) => s.sessionId === sessionId), [state, sessionId]);
  const results = useMemo(() => selectSessionSegmentResults(state, sessionId), [state, sessionId]);

  const isReadOnly = liveState.status === "Completed" || session?.status === "completed";

  if (!session) {
    return <div className="p-8 text-xs font-mono text-slate-400">Session not found.</div>;
  }

  const handleSaveDraft = (params: any) => {
    setErrorMsg(null);
    const res = createDraftResult({
      sessionId,
      ...params,
      operatorId: role.id,
    });
    if (res.error) setErrorMsg(res.error);
  };

  const handleConfirm = (segmentId: string) => {
    setErrorMsg(null);
    const res = confirmResult(sessionId, segmentId, role.id);
    if (res.error) setErrorMsg(res.error);
  };

  const handleCorrect = (params: any) => {
    setErrorMsg(null);
    const res = correctResult({
      sessionId,
      ...params,
      operatorId: role.id,
    });
    if (res.error) setErrorMsg(res.error);
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6 font-mono text-xs">
      <PageHeader
        overline={`Score & Outcome Entry Workspace · ${session.id}`}
        title={`Results Entry: ${sessionTitle(state, session.id)}`}
        sub="Record match scores, outcome details, draft saves, result confirmations, and audited result corrections."
        right={
          <Link href={`/missions/${session.id}/completion`}>
            <Button variant="ghost" className="h-8 px-3 text-xs">
              Completion Checklist →
            </Button>
          </Link>
        }
      />

      {errorMsg && <div className="bg-red-950 border border-red-800 text-red-300 p-3 rounded">{errorMsg}</div>}

      {/* Segment Result Forms List */}
      <div className="space-y-6">
        {segments.map((seg) => {
          const res = results.find((r) => r.segmentId === seg.id);
          return (
            <ScoreOutcomeEntryForm
              key={seg.id}
              segment={seg}
              teams={teams}
              existingResult={res}
              onSaveDraft={handleSaveDraft}
              onConfirmResult={handleConfirm}
              onCorrectResult={handleCorrect}
              isReadOnly={isReadOnly}
            />
          );
        })}
      </div>
    </div>
  );
}
