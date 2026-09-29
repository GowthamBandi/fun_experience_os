"use client";

import { useEffect, useMemo, useState } from "react";
import { KeyRound, Lock, ShieldAlert, Timer } from "lucide-react";
import { useStore } from "@/lib/store";
import {
  EMERGENCY_ACCESS_MINUTES,
  EMERGENCY_REASON_MIN_LENGTH,
  selectActiveEmergencyAccess,
  selectBookingEmergencyAccessHistory,
  selectProtectedIdentity,
} from "@/lib/prototype/selectors/identity";
import { EMERGENCY_IDENTITY_ROLES } from "@/lib/prototype/services/emergencyAccess";
import { Button, StatusChip } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { ReasonDialog, formatClock, formatWhen, useOperatorName } from "@/components/missions/shared";

/**
 * Audited, time-limited access to one participant's protected identity record.
 * The record is rendered only while the signed-in operator holds an active grant.
 */
export function EmergencyIdentityPanel({ bookingId, sessionId }: { bookingId: string; sessionId?: string }) {
  const { state, operator, role, requestEmergencyIdentityAccess, closeEmergencyIdentityAccess } = useStore();
  const toast = useToast();
  const opName = useOperatorName();
  const [now, setNow] = useState(() => Date.now());
  const [asking, setAsking] = useState(false);

  const operatorId = operator?.id ?? "";
  const active = selectActiveEmergencyAccess(state, bookingId, operatorId, now);
  const identity = useMemo(() => (active ? selectProtectedIdentity(state, bookingId) : null), [active, state, bookingId]);
  const history = selectBookingEmergencyAccessHistory(state, bookingId).slice(0, 5);
  const booking = state.bookings.find((b) => b.id === bookingId);
  const allowed = (EMERGENCY_IDENTITY_ROLES as readonly string[]).includes(role.id);

  // Tick while a grant is open so the countdown and auto-hide are exact.
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [active]);

  if (!booking) return null;
  const remaining = active ? Math.max(0, Math.floor((Date.parse(active.expiresAt) - now) / 1000)) : 0;

  return (
    <div className="space-y-4">
      {active && identity ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-800">
              <KeyRound className="h-4 w-4" /> Protected record open
            </p>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-semibold tabular text-amber-800 ring-1 ring-amber-200" aria-live="polite">
              <Timer className="h-3.5 w-3.5" /> Closes in {formatClock(remaining)} · {formatWhen(active.expiresAt)}
            </span>
          </div>
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Row label="Participant account" value={<span className="font-mono text-xs">{identity.participantAccountId}</span>} />
            <Row label="Booking reference" value={<span className="font-mono text-xs">{identity.bookingReference}</span>} />
            <Row label="Contact on file" value={identity.contactOnFile} />
            <Row label="Payment method" value={identity.paymentMethod} />
            <Row label="Booked" value={formatWhen(identity.bookedAt)} />
            <Row label="Reason given" value={active.reason} />
          </dl>
          <p className="mt-3 text-xs leading-5 text-ink-mut">
            This workspace holds only the masked contact above. Full phone numbers are held by the customer identity service, which is not connected — give the participant account ID to Support to reach them.
          </p>
          <div className="mt-3 flex justify-end">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const res = closeEmergencyIdentityAccess(active.id);
                if (res.error) toast.error("Access not closed", res.error);
                else toast.success("Protected record closed", "The access has been recorded as closed.");
              }}
            >
              <Lock className="h-3.5 w-3.5" /> Close record now
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-edge bg-bg-sunken p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink-lum">
            <Lock className="h-4 w-4 text-ink-mut" /> Identity protected
          </p>
          <p className="mt-1 text-sm leading-6 text-ink-mut">
            Only for a real emergency. Access lasts {EMERGENCY_ACCESS_MINUTES} minutes, is visible only to you and is written to the audit record with your reason.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button variant="warning" size="sm" disabled={!allowed} onClick={() => setAsking(true)}>
              <ShieldAlert className="h-3.5 w-3.5" /> Request emergency access
            </Button>
            {!allowed && <span className="text-xs text-ink-mut">Available to platform owners, super admins, safety officers and operations managers.</span>}
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div>
          <p className="overline mb-2">Access history</p>
          <ul className="divide-y divide-edge rounded-2xl border border-edge bg-white">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-ink-lum">{h.reason}</p>
                  <p className="text-xs text-ink-mut">
                    {opName(h.operatorId)} · {formatWhen(h.requestedAt)}
                  </p>
                </div>
                <StatusChip value={h.status === "active" && Date.parse(h.expiresAt) <= now ? "expired" : h.status} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <ReasonDialog
        open={asking}
        onClose={() => setAsking(false)}
        title="Request emergency access"
        tone="warning"
        description={
          <>
            You are opening the protected record for <strong className="text-ink-lum">{booking.alias}</strong>
            {sessionId ? "" : ` (${booking.sessionId})`}. Describe the emergency — the reason is stored with your name.
          </>
        }
        label="What is the emergency?"
        placeholder="e.g. Participant injured on court 2; need to reach their emergency contact."
        minLength={EMERGENCY_REASON_MIN_LENGTH}
        confirmLabel={`Open for ${EMERGENCY_ACCESS_MINUTES} minutes`}
        onConfirm={(reason) => {
          const res = requestEmergencyIdentityAccess({ bookingId, sessionId, reason });
          if (res.error) return res;
          setNow(Date.now());
          toast.warning("Emergency access granted", `Open until ${formatWhen(res.accessLog?.expiresAt)}. This access is recorded.`);
          return true;
        }}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-mut">{label}</dt>
      <dd className="truncate text-ink-lum">{value}</dd>
    </div>
  );
}
