"use client";

import { use } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { selectParticipantDirectory } from "@/lib/prototype/selectors/staff";
import { PageHeader } from "@/components/ui/PageHeader";
import { StaffBackNavigation } from "@/components/staff";
import { Button, StatusChip } from "@/components/ui/primitives";
import { Lock, ShieldAlert, ArrowRight, CheckCircle2, Ticket } from "lucide-react";

export default function ParticipantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: bookingId } = use(params);
  const { state, requestEmergencyIdentityAccess } = useStore();

  const participants = selectParticipantDirectory(state);
  const participant = participants.find((p) => p.id === bookingId);

  if (!participant) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-12 text-center space-y-4">
        <h2 className="text-xl font-bold text-ink-lum">Participant Not Found</h2>
        <p className="text-xs text-ink-sec">The requested participant record does not exist in prototype state.</p>
        <Link href="/people/participants">
          <Button variant="primary">Return to Participants Directory</Button>
        </Link>
      </div>
    );
  }

  const handleEmergencyAccess = () => {
    requestEmergencyIdentityAccess({
      bookingId: participant.id,
      sessionId: participant.sessionId,
      operatorId: "op-1",
      operatorRole: "super-admin",
      reason: "Emergency Safety Incident Inspection (Audited Audit Log)",
    });
    alert("Emergency access request logged in audit trail.");
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6">
      <StaffBackNavigation
        label="Back to Participants"
        href="/people/participants"
        breadcrumbs={[
          { label: "Participants", href: "/people/participants" },
          { label: participant.alias, href: `/people/participants/${participant.id}` },
        ]}
      />

      <PageHeader
        overline={`Participant Profile · ${participant.tempId}`}
        title={participant.alias}
        sub={`Operational identity for event #${participant.sessionId}`}
        right={
          <StatusChip
            value={participant.isCheckedIn ? "Checked In" : participant.isRevealed ? "Revealed" : "Booked"}
          />
        }
      />

      {/* Privacy Notice */}
      <div className="glass p-4 rounded-xl border border-emerald-300 bg-emerald-100 text-xs space-y-1">
        <div className="flex items-center gap-2 font-bold text-emerald-700">
          <Lock className="w-4 h-4 text-emerald-600" />
          <span>Operational Identity Protection Active</span>
        </div>
        <p className="text-ink-sec text-[11px]">
          Personal identity details are masked in standard views. Emergency access requires explicit safety justification and enters permanent audit logging.
        </p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
        <div className="glass p-5 rounded-2xl border border-slate-200 space-y-1">
          <span className="text-[10px] text-ink-mut uppercase font-semibold">Temporary ID</span>
          <p className="text-lg font-mono font-bold text-brand">{participant.tempId}</p>
          <p className="text-[11px] text-ink-sec">Alias: {participant.alias}</p>
        </div>

        <div className="glass p-5 rounded-2xl border border-slate-200 space-y-1">
          <span className="text-[10px] text-ink-mut uppercase font-semibold">Assigned Team</span>
          <p className="text-lg font-bold text-purple-700">{participant.teamName}</p>
          <p className="text-[11px] text-ink-sec">Reveal status: {participant.isRevealed ? "Revealed" : "Hidden"}</p>
        </div>

        <div className="glass p-5 rounded-2xl border border-slate-200 space-y-1">
          <span className="text-[10px] text-ink-mut uppercase font-semibold">Check-In Status</span>
          <p className="text-lg font-bold text-ink-lum">{participant.isCheckedIn ? "Checked In" : "Pending Check-In"}</p>
          <p className="text-[11px] text-ink-sec">Payment: {participant.paymentStatus}</p>
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
        <div className="glass p-5 rounded-2xl border border-slate-200 space-y-3">
          <h3 className="font-bold text-ink-lum text-sm flex items-center gap-2">
            <Ticket className="w-4 h-4 text-brand" />
            <span>Event & Booking Information</span>
          </h3>
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex justify-between">
              <span className="text-ink-mut">Session Title:</span>
              <span className="font-bold text-ink-lum">{participant.sessionTitle}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-mut">Booking Date:</span>
              <span className="text-ink-sec">{participant.date}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-mut">Booking Status:</span>
              <span className="text-emerald-600 capitalize">{participant.bookingStatus}</span>
            </div>
          </div>
        </div>

        <div className="glass p-5 rounded-2xl border border-slate-200 space-y-3">
          <h3 className="font-bold text-ink-lum text-sm flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-600" />
            <span>Audited Emergency Access</span>
          </h3>
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex justify-between font-mono">
              <span className="text-ink-mut">Phone Number:</span>
              <span className="text-ink-lum">{participant.maskedPhone}</span>
            </div>
            <p className="text-[11px] text-ink-mut">
              To unmask personal contact details for urgent safety or emergency resolution, click below.
            </p>
            <Button variant="secondary" className="h-8 text-xs font-bold w-full" onClick={handleEmergencyAccess}>
              <ShieldAlert className="w-3.5 h-3.5 mr-1 text-amber-600" />
              Request Audited Emergency Access
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
