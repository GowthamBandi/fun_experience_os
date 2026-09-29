"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { selectStaffDirectory, selectAvailableStaff } from "@/lib/prototype/selectors/staff";
import { PageHeader } from "@/components/ui/PageHeader";
import { StaffBackNavigation, StaffStatusBadge } from "@/components/staff";
import { Button } from "@/components/ui/primitives";
import { CheckCircle2, UserCheck, Calendar, AlertTriangle, ArrowRight, ShieldCheck } from "lucide-react";

function AssignStaffForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { state, assignCrewToSession } = useStore();

  const sessions = state.sessions ?? [];
  const venues = state.venues ?? [];
  const staffList = selectStaffDirectory(state);

  const initialSessionId = searchParams?.get("sessionId") || sessions[0]?.id || "";

  const [selectedSessionId, setSelectedSessionId] = useState(initialSessionId);
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [selectedSafetyId, setSelectedSafetyId] = useState("");
  const [assignmentError, setAssignmentError] = useState("");
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (initialSessionId) {
      setSelectedSessionId(initialSessionId);
    }
  }, [initialSessionId]);

  const session = sessions.find((s) => s.id === selectedSessionId);
  const venue = venues.find((v) => v.id === session?.venueId);

  useEffect(() => {
    if (session) {
      setSelectedLeadId(session.leadCoordinatorId || "");
      setSelectedSafetyId(session.safetyContactId || "");
    }
  }, [session]);

  const handleAssign = () => {
    setAssignmentError("");

    if (!selectedSessionId) {
      setAssignmentError("Please choose an event first.");
      return;
    }

    if (selectedLeadId && selectedSafetyId && selectedLeadId === selectedSafetyId) {
      setAssignmentError("Lead Coordinator and Safety Officer cannot be the same person.");
      return;
    }

    if (selectedLeadId) {
      assignCrewToSession({
        sessionId: selectedSessionId,
        crewId: selectedLeadId,
        role: "coordinator",
        assignmentTitle: `Lead Coordinator — Event ${selectedSessionId}`,
      });
    }

    if (selectedSafetyId) {
      assignCrewToSession({
        sessionId: selectedSessionId,
        crewId: selectedSafetyId,
        role: "safety",
        assignmentTitle: `Safety Lead — Event ${selectedSessionId}`,
      });
    }

    setSavedSuccess(true);
  };

  if (savedSuccess) {
    return (
      <div className="glass p-8 rounded-2xl border border-emerald-800/40 bg-emerald-950/20 text-center space-y-6 max-w-xl mx-auto my-8">
        <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
          <CheckCircle2 className="w-10 h-10" />
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-ink-lum">Staff Assignments Saved</h2>
          <p className="text-xs text-ink-sec max-w-md mx-auto">
            You have successfully assigned staff to event &quot;{session?.id}&quot;.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-black/40 border border-white/5 text-left text-xs space-y-1">
          <p className="text-ink-mut">Event: <strong className="text-ink-lum">Event #{session?.id}</strong></p>
          <p className="text-ink-mut">Lead Coordinator: <span className="text-purple-300 font-bold">{staffList.find((s) => s.id === selectedLeadId)?.name || "Assigned"}</span></p>
          <p className="text-ink-mut">Safety Lead: <span className="text-emerald-400 font-bold">{staffList.find((s) => s.id === selectedSafetyId)?.name || "Assigned"}</span></p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Button
            variant="primary"
            className="w-full sm:w-auto font-bold px-6"
            onClick={() => router.push(`/missions/${selectedSessionId}/overview`)}
          >
            Go to Event Overview
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
          <Button
            variant="secondary"
            className="w-full sm:w-auto text-xs"
            onClick={() => setSavedSuccess(false)}
          >
            Assign Another Event
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* 1. Choose Event */}
      <div className="glass p-6 rounded-2xl border border-white/5 space-y-4">
        <h3 className="text-sm font-bold text-ink-lum">1. Choose Event to Staff</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {sessions.map((s) => {
            const v = venues.find((v) => v.id === s.venueId);
            const selected = s.id === selectedSessionId;
            const hasLead = !!s.leadCoordinatorId;

            return (
              <div
                key={s.id}
                onClick={() => setSelectedSessionId(s.id)}
                className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                  selected
                    ? "bg-purple-950/40 border-brand text-ink-lum ring-1 ring-brand"
                    : "bg-black/30 border-white/5 text-ink-sec hover:border-white/10"
                }`}
              >
                <div className="font-bold text-ink-lum flex justify-between">
                  <span>Event #{s.id}</span>
                  <span className="font-mono text-[10px] text-ink-mut">{s.startTime}</span>
                </div>
                <div className="text-[11px] text-ink-mut mt-0.5">{v?.name || "Venue"}</div>
                <div className="mt-2 flex items-center justify-between">
                  <StaffStatusBadge status={hasLead ? "ready" : "missing"} size="sm" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Plain-Language Required Role Questions */}
      {session && (
        <div className="glass p-6 rounded-2xl border border-white/5 space-y-6">
          <h3 className="text-sm font-bold text-ink-lum border-b border-white/5 pb-3">
            2. Assign Event Staff for Event #{session.id} ({session.date} @ {session.startTime})
          </h3>

          {assignmentError && (
            <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-800/40 text-rose-300 text-xs font-semibold">
              ⚠️ {assignmentError}
            </div>
          )}

          {/* Question 1: Lead Coordinator */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-ink-lum flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-brand" />
              <span>Who will manage this event? (Lead Coordinator)</span>
            </label>
            <select
              value={selectedLeadId}
              onChange={(e) => setSelectedLeadId(e.target.value)}
              className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum font-bold text-purple-300"
            >
              <option value="">-- Choose Lead Coordinator --</option>
              {staffList.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name} ({st.roleLabel}) — {st.status === "available" ? "Suggested by availability" : "Assigned"}
                </option>
              ))}
            </select>
          </div>

          {/* Question 2: Safety Lead */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-ink-lum flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Who is the Safety Lead? (Safety Officer)</span>
            </label>
            <select
              value={selectedSafetyId}
              onChange={(e) => setSelectedSafetyId(e.target.value)}
              className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum font-bold text-emerald-400"
            >
              <option value="">-- Choose Safety Officer --</option>
              {staffList.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name} ({st.roleLabel}) — {st.status === "available" ? "Suggested by availability" : "Assigned"}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end pt-4 border-t border-white/5">
            <Button variant="primary" onClick={handleAssign} className="font-bold text-xs bg-emerald-500 text-slate-950 px-6">
              Save Staff Assignments
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AssignStaffPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6">
      <StaffBackNavigation label="Back to Staff Schedule" href="/staffing" />
      <PageHeader
        overline="Staff Operations · Assignments"
        title="Assign Staff"
        sub="Choose the people who will run this event. Who should work on this event?"
      />
      <Suspense fallback={<div className="text-xs text-ink-mut p-8">Loading assignment form...</div>}>
        <AssignStaffForm />
      </Suspense>
    </div>
  );
}
