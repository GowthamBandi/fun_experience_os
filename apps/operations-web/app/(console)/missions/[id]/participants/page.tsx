"use client";

import { useMemo, useState } from "react";
import { KeyRound, Lock, RefreshCw, ShieldAlert, Users, XCircle } from "lucide-react";
import { useStore } from "@/lib/store";
import { selectSessionIdentitySummary, selectSessionParticipantPool, type ParticipantPoolItem } from "@/lib/prototype/selectors/identity";
import { Button, StatusChip } from "@/components/ui/primitives";
import { MetricTile } from "@/components/ui/panels";
import { Select } from "@/components/ui/fields";
import { Drawer } from "@/components/ui/overlays";
import { DataTable, type Column } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { EmergencyIdentityPanel } from "@/components/missions/EmergencyIdentityPanel";
import { ConfirmDialog, MissionShell, ReasonDialog, WorkspaceCard, useMissionId } from "@/components/missions/shared";

export default function ParticipantCodesPage() {
  return (
    <MissionShell tab="participants" sub="Give every confirmed participant a temporary code, then lock the codes before building the reveal.">
      <CodesBody />
    </MissionShell>
  );
}

function CodesBody() {
  const sessionId = useMissionId();
  const { state, generateTemporaryIdentities, lockTemporaryIdentities, revokeTemporaryIdentity } = useStore();
  const toast = useToast();

  const pool = useMemo(() => selectSessionParticipantPool(state, sessionId), [state, sessionId]);
  const summary = useMemo(() => selectSessionIdentitySummary(state, sessionId), [state, sessionId]);
  const patterns = (state.identityPatterns ?? []).filter((p) => p.status === "active");
  const sessionPatternId = pool.find((p) => p.temporaryIdentity)?.temporaryIdentity?.patternId;
  const [patternId, setPatternId] = useState<string>(sessionPatternId ?? patterns[0]?.id ?? "");
  const [confirmGenerate, setConfirmGenerate] = useState(false);
  const [confirmLock, setConfirmLock] = useState(false);
  const [revoking, setRevoking] = useState<ParticipantPoolItem | null>(null);
  const [unmasking, setUnmasking] = useState<ParticipantPoolItem | null>(null);

  const revealed = summary.revealedCount > 0;
  const regenerating = summary.generatedCount > summary.lockedCount + summary.revealedCount;

  const columns: Column<ParticipantPoolItem>[] = [
    {
      key: "code",
      header: "Code",
      render: (p) =>
        p.temporaryIdentity && p.temporaryIdentity.status !== "revoked" ? (
          <span className="whitespace-nowrap font-mono text-sm font-semibold text-ink-lum">{p.temporaryIdentity.temporaryCode}</span>
        ) : (
          <span className="text-sm text-ink-mut">—</span>
        ),
    },
    {
      key: "alias",
      header: "Participant",
      render: (p) => (
        <div className="min-w-0">
          <p className="font-medium text-ink-lum">{p.booking.alias}</p>
          <p className="text-xs text-ink-mut">{p.booking.phoneMask}</p>
        </div>
      ),
    },
    {
      key: "place",
      header: "Place",
      render: (p) => (p.isEligible ? <StatusChip value="confirmed" /> : <StatusChip value={p.blockedReason ?? "not confirmed"} tone="neutral" />),
    },
    { key: "code-status", header: "Code status", render: (p) => <StatusChip value={p.temporaryIdentity?.status ?? "not-generated"} /> },
    { key: "team", header: "Team", render: (p) => (p.teamName ? <span className="text-ink-sec">{p.teamName}</span> : <span className="text-ink-mut">No team</span>) },
    { key: "door", header: "Door", render: (p) => <StatusChip value={p.checkInStatus} /> },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (p) => (
        <div className="flex justify-end gap-1.5">
          {p.temporaryIdentity && (p.temporaryIdentity.status === "generated" || p.temporaryIdentity.status === "locked") && (
            <Button variant="ghost" size="sm" onClick={() => setRevoking(p)} aria-label={`Revoke code for ${p.booking.alias}`}>
              <XCircle className="h-3.5 w-3.5" /> Revoke
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => setUnmasking(p)} aria-label={`Emergency identity access for ${p.booking.alias}`}>
            <ShieldAlert className="h-3.5 w-3.5 text-amber-600" /> Identity
          </Button>
        </div>
      ),
    },
  ];

  const doGenerate = () => {
    const res = generateTemporaryIdentities(sessionId, patternId || undefined);
    if (res.error) return res;
    toast.success("Codes generated", "Review them, then lock the codes.");
    return true;
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <MetricTile label="Confirmed participants" value={summary.eligibleCount} detail={`${summary.totalBookings} bookings in total`} icon={<Users className="h-4 w-4" />} tone="violet" />
        <MetricTile label="Codes generated" value={summary.generatedCount} detail={summary.missingIdentityCount ? `${summary.missingIdentityCount} still need a code` : "Everyone has a code"} icon={<KeyRound className="h-4 w-4" />} tone="sky" />
        <MetricTile label="Codes locked" value={summary.lockedCount + summary.revealedCount} detail={summary.isFullyLocked ? "Ready for teams and reveal" : "Lock before the reveal"} icon={<Lock className="h-4 w-4" />} tone={summary.isFullyLocked ? "emerald" : "amber"} />
        <MetricTile label="Revoked" value={summary.revokedCount} detail="Withdrawn codes needing a replacement" icon={<XCircle className="h-4 w-4" />} tone={summary.revokedCount ? "rose" : "emerald"} />
      </div>

      <WorkspaceCard
        title="Generate codes"
        sub="Codes use an identity pattern (letters + number) and never contain names, phone numbers or dates."
        right={
          <>
            <label className="sr-only" htmlFor="pattern">
              Identity pattern
            </label>
            <div className="w-56">
              <Select id="pattern" value={patternId} onChange={(e) => setPatternId(e.target.value)} disabled={revealed || patterns.length === 0}>
                {patterns.length === 0 && <option value="">No active patterns</option>}
                {patterns.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.example}
                  </option>
                ))}
              </Select>
            </div>
            <Button variant="secondary" disabled={revealed || summary.eligibleCount === 0 || patterns.length === 0} onClick={() => (regenerating ? setConfirmGenerate(true) : generateNow())}>
              <RefreshCw className="h-4 w-4" /> {summary.generatedCount === 0 ? "Generate codes" : summary.missingIdentityCount > 0 ? "Generate missing codes" : "Regenerate unlocked"}
            </Button>
            <Button disabled={revealed || summary.isFullyLocked || summary.eligibleCount === 0} onClick={() => setConfirmLock(true)}>
              <Lock className="h-4 w-4" /> Lock codes
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-mut">
          {revealed
            ? "Codes have been revealed to participants and can no longer change."
            : summary.isFullyLocked
              ? "All codes are locked. Revoke a single code if it must be replaced, then generate again."
              : "Locked codes are kept when you generate again; only unlocked or revoked codes are replaced."}
        </p>
      </WorkspaceCard>

      <DataTable columns={columns} rows={pool} emptyTitle="No bookings yet" emptyLine="Participants appear here once they book this session." />

      <ConfirmDialog open={confirmGenerate} onClose={() => setConfirmGenerate(false)} title="Replace unlocked codes?" confirmLabel="Regenerate" onConfirm={doGenerate}>
        Unlocked codes will be replaced with new numbers. Locked codes stay as they are. Participants have not seen any code yet.
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmLock}
        onClose={() => setConfirmLock(false)}
        title="Lock all codes?"
        confirmLabel="Lock codes"
        onConfirm={() => {
          const res = lockTemporaryIdentities(sessionId);
          if (res.error) return res;
          toast.success("Codes locked", "Next: build and lock teams.");
          return true;
        }}
      >
        Locked codes cannot be regenerated. To replace one later you will need to revoke it with a reason.
      </ConfirmDialog>

      <ReasonDialog
        open={!!revoking}
        onClose={() => setRevoking(null)}
        title={`Revoke ${revoking?.temporaryIdentity?.temporaryCode ?? "code"}`}
        tone="danger"
        description={`${revoking?.booking.alias ?? "The participant"} will need a new code before the reveal.`}
        placeholder="e.g. Code was posted in a public group chat."
        confirmLabel="Revoke code"
        onConfirm={(reason) => {
          const res = revokeTemporaryIdentity(revoking!.temporaryIdentity!.id, reason);
          if (res.error) return res;
          toast.success("Code revoked", "Generate codes again to issue a replacement.");
          return true;
        }}
      />

      <Drawer open={!!unmasking} onClose={() => setUnmasking(null)} title={unmasking?.booking.alias ?? ""} sub={unmasking?.temporaryIdentity?.temporaryCode ? `Code ${unmasking.temporaryIdentity.temporaryCode}` : "No code yet"}>
        {unmasking && <EmergencyIdentityPanel bookingId={unmasking.booking.id} sessionId={sessionId} />}
      </Drawer>
    </div>
  );

  function generateNow() {
    const res = doGenerate();
    if (res !== true) toast.error("Codes not generated", res.error);
  }
}
