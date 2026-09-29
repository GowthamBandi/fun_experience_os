"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useStore } from "@/lib/store";
import { selectParticipantProfile } from "@/lib/prototype/selectors/identity";
import { sessionTitle, venueName } from "@/lib/prototype/selectors/lookups";
import { inr } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusChip } from "@/components/ui/primitives";
import { PermissionDenied } from "@/components/ui/panels";
import { EmergencyIdentityPanel } from "@/components/missions/EmergencyIdentityPanel";
import { NotFoundCard, WorkspaceCard, formatWhen } from "@/components/missions/shared";

export default function ParticipantProfilePage() {
  const params = useParams();
  const bookingId = String(params?.id ?? "");
  const { state, canAccess } = useStore();
  const p = useMemo(() => selectParticipantProfile(state, bookingId), [state, bookingId]);

  if (!canAccess("/people/participants")) return <PermissionDenied module="Participants" />;
  if (!p) return <NotFoundCard title="Participant not found" line={`There is no booking “${bookingId}”.`} backHref="/people/participants" backLabel="Participants" />;

  const { booking, session } = p;

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-6 px-5 py-7 lg:px-8">
      <Link href="/people/participants" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-mut hover:text-ink-lum">
        <ArrowLeft className="h-4 w-4" /> Participants
      </Link>
      <PageHeader
        overline={p.temporaryCode ? `Participant · ${p.temporaryCode}` : "Participant"}
        title={booking.alias}
        sub="Operators see the alias and temporary code. The protected record opens only for emergencies."
        right={<StatusChip value={p.isEligible ? "confirmed" : booking.status} />}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <WorkspaceCard
          title="Session"
          right={
            session ? (
              <Link href={`/missions/${session.id}/overview`} className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:text-brand-hover">
                Open session <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : undefined
          }
        >
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <Item label="Session" value={session ? sessionTitle(state, session.id) : booking.sessionId} />
            <Item label="When" value={session ? `${session.date} · ${session.startTime}` : "—"} />
            <Item label="Venue" value={session ? venueName(state, session.venueId) : "—"} />
            <Item label="Team" value={p.teamName ?? (p.isRevealed ? "No team" : "Not revealed yet")} />
            <Item label="Code" value={p.temporaryCode ? <span className="font-mono font-semibold">{p.temporaryCode}</span> : "Not issued"} />
            <Item label="Code status" value={<StatusChip value={p.identityStatus} />} />
            <Item label="Door" value={<StatusChip value={p.checkInStatus} />} />
            <Item label="Arrived" value={formatWhen(p.checkIn?.checkedInAt ?? p.checkIn?.markedLateAt)} />
          </dl>
        </WorkspaceCard>

        <WorkspaceCard title="Booking">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <Item label="Reference" value={<span className="font-mono text-xs">{booking.bookingCode ?? booking.id}</span>} />
            <Item label="Status" value={<StatusChip value={booking.status} />} />
            <Item label="Amount" value={inr(booking.amount)} />
            <Item label="Type" value={(booking.bookingType ?? "individual").replace(/-/g, " ")} />
            <Item label="Booked" value={formatWhen(booking.createdAt)} />
            <Item label="Contact" value={booking.phoneMask} />
          </dl>
          {!p.isEligible && p.blockedReason && <p className="mt-4 text-sm text-amber-800">{p.blockedReason}.</p>}
        </WorkspaceCard>
      </div>

      <WorkspaceCard title="Emergency identity access" sub="Audited and time-limited. Use only when someone's safety depends on it.">
        <EmergencyIdentityPanel bookingId={booking.id} />
      </WorkspaceCard>
    </div>
  );
}

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-mut">{label}</dt>
      <dd className="mt-0.5 truncate text-ink-lum">{value}</dd>
    </div>
  );
}
