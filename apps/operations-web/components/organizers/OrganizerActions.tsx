"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Ban, Handshake, KeyRound, Lock, Pause, Play } from "lucide-react";
import { Button, Chip, Sheet, Tooltip, useToast } from "@/components/pulse";
import { OrganizerCodeModal } from "@/components/governance/OrganizerCodeModal";
import { PhraseBox } from "@/components/governance/PhraseBox";
import { CONFIRM_PHRASES, PAYOUT_CADENCES, RequestIdBook, commissionPercentToBps, isConfirmed, type PayoutCadence } from "@/lib/console/actions";
import { ROLE_LABEL, can, type ConsoleRole } from "@/lib/console/capabilities";
import { rethrowForSheet } from "@/lib/console/errors";
import { canReissueOrganizerCode } from "@/lib/console/records";
import { proposeCommercialAgreement, reissueOrganizerCode, setEntityStatus } from "@/lib/governance-api";
import { commissionLabel, entityVersion, statusActions, type StatusAction } from "@/lib/organizers";
import { useLiveDocument } from "@/lib/use-governance";

type Raw = Record<string, unknown>;
type Code = { code: string; orgId?: string | null; expiresAt?: string | null; subject: string };
type Open = { kind: "status"; action: StatusAction } | { kind: "propose" } | { kind: "reissue" } | null;

const ICON: Record<StatusAction["status"], ReactNode> = { active: <Play />, paused: <Pause />, blocked: <Ban /> };

export function OrganizerActions({
  orgId,
  org,
  name,
  role,
  currentBps,
  currentCadence,
  onChanged,
}: {
  orgId: string;
  /** The live organizers/{orgId} document. */
  org: Raw;
  name: string;
  role: ConsoleRole | null;
  currentBps: number | null;
  currentCadence: string | null;
  /** Called after a successful action so one-shot lists (agreements, audit) re-read. */
  onChanged: () => void;
}) {
  const toast = useToast();
  const permitted = can(role, "governance.decide");
  const status = typeof org.status === "string" ? org.status : null;
  const applicationId = typeof org.applicationId === "string" ? org.applicationId : null;
  const application = useLiveDocument(permitted ? "organizerApplications" : null, applicationId);
  const reissuable = !!application.data && canReissueOrganizerCode(application.data);

  const [open, setOpen] = useState<Open>(null);
  const [typed, setTyped] = useState("");
  const [percent, setPercent] = useState("");
  const [cadence, setCadence] = useState<PayoutCadence>("weekly");
  const [code, setCode] = useState<Code | null>(null);
  const book = useRef(new RequestIdBook("organizer"));
  // The live version at confirm time: versions move under us.
  const live = useRef(org);
  live.current = org;

  useEffect(() => {
    setTyped("");
    if (open?.kind === "propose") {
      setPercent(currentBps !== null ? commissionLabel(currentBps).replace("%", "") : "");
      setCadence((PAYOUT_CADENCES as readonly string[]).includes(currentCadence ?? "") ? (currentCadence as PayoutCadence) : "weekly");
    }
  }, [open, currentBps, currentCadence]);

  if (!permitted) {
    return (
      <Tooltip label={`${role ? ROLE_LABEL[role] : "Your role"} can view organizers but not change them.`}>
        <span tabIndex={0} className="focus-ring inline-flex h-10 items-center gap-2 rounded-pill border border-line px-4 text-[13px] font-semibold text-text-3" data-testid="actions-read-only">
          <Lock aria-hidden className="h-4 w-4" />
          Read-only
        </span>
      </Tooltip>
    );
  }

  const actions = statusActions(status);
  const reactivate = actions.find((a) => a.status === "active");

  const confirmStatus = async (action: StatusAction, reason: string) => {
    if (action.phrase && !isConfirmed(typed, action.phrase)) throw new Error(`Type ${action.phrase} to confirm.`);
    const version = live.current.version;
    try {
      const result = await setEntityStatus({
        requestId: book.current.idFor(`${orgId}-${action.status}`),
        entityType: "organizer",
        entityId: orgId,
        expectedVersion: entityVersion(version),
        status: action.status,
        reason,
      });
      book.current.reset();
      onChanged();
      toast.show({
        tone: action.status === "active" ? "ok" : "info",
        title: `${action.status === "active" ? "Reactivated" : action.status === "paused" ? "Paused" : "Blocked"} · ${name}`,
        body: result.replayed ? "This request had already been applied." : `Status is now ${result.status} (version ${result.version}).`,
      });
    } catch (cause) {
      rethrowForSheet(cause, book.current);
    }
  };

  const confirmPropose = async (note: string) => {
    try {
      const result = await proposeCommercialAgreement({ requestId: book.current.idFor(`${orgId}-propose`), orgId, commissionPercent: percent, payoutCadence: cadence, note });
      book.current.reset();
      onChanged();
      toast.show({
        tone: "ok",
        title: `Terms proposed · ${percent.trim()}% ${cadence}`,
        body: `Agreement ${result.agreementId} is ${result.status}. Another admin approves it in Commercials; it then applies to newly published events.`,
      });
    } catch (cause) {
      rethrowForSheet(cause, book.current);
    }
  };

  const confirmReissue = async (reason: string) => {
    if (!applicationId) throw new Error("This organizer has no application on record.");
    if (!isConfirmed(typed, CONFIRM_PHRASES.reissueCode)) throw new Error(`Type ${CONFIRM_PHRASES.reissueCode} to confirm.`);
    try {
      const result = await reissueOrganizerCode({ requestId: book.current.idFor(`${orgId}-reissue`), applicantUid: applicationId, reason });
      book.current.reset();
      onChanged();
      if (!result.organizerCode) {
        toast.show({ tone: "info", title: "Code already issued", body: "A code was already issued for this request and can't be shown again. Start a new re-issue if it wasn't delivered." });
        return;
      }
      // Never keep the one-time code anywhere but the modal's own props.
      setCode({ code: result.organizerCode, orgId: result.orgId, expiresAt: result.codeExpiresAt ?? null, subject: name });
    } catch (cause) {
      rethrowForSheet(cause, book.current);
    }
  };

  const statusOpen = open?.kind === "status" ? open.action : null;
  const proposePct = (() => {
    try {
      return commissionPercentToBps(percent) / 100;
    } catch {
      return null;
    }
  })();

  return (
    <>
      <div className="flex flex-wrap items-center gap-2" data-testid="organizer-actions">
        {actions
          .filter((a) => a.status !== "active")
          .map((a) => (
            <Button key={a.status} variant={a.status === "blocked" ? "danger" : "ghost"} icon={ICON[a.status]} onClick={() => setOpen({ kind: "status", action: a })}>
              {a.label}
            </Button>
          ))}
        {reissuable ? (
          <Button variant="ghost" icon={<KeyRound />} onClick={() => setOpen({ kind: "reissue" })}>
            Reissue code
          </Button>
        ) : null}
        <Button variant={reactivate ? "ghost" : "volt"} icon={<Handshake />} onClick={() => setOpen({ kind: "propose" })}>
          Propose terms
        </Button>
        {reactivate ? (
          <Button variant="volt" icon={ICON.active} onClick={() => setOpen({ kind: "status", action: reactivate })}>
            Reactivate
          </Button>
        ) : null}
      </div>

      <Sheet
        open={!!statusOpen}
        title={statusOpen ? `${statusOpen.label} ${name}?` : ""}
        description={statusOpen && !statusOpen.phrase ? statusOpen.consequence : undefined}
        confirmLabel={statusOpen ? `${statusOpen.label} organizer` : ""}
        tone={statusOpen?.tone ?? "danger"}
        requireReason
        minReason={10}
        reasonLabel="Reason (kept in the audit trail)"
        extra={statusOpen?.phrase ? <PhraseBox phrase={statusOpen.phrase} consequence={statusOpen.consequence} value={typed} onChange={setTyped} /> : undefined}
        onConfirm={(reason) => (statusOpen ? confirmStatus(statusOpen, reason) : Promise.resolve())}
        onClose={() => setOpen(null)}
      />

      <Sheet
        open={open?.kind === "propose"}
        title="Propose commercial terms"
        description={`New terms for ${name}. A different admin must approve them; approved terms apply to events published afterwards.`}
        confirmLabel="Propose terms"
        tone="volt"
        requireReason
        minReason={10}
        reasonLabel="Note for the approving admin"
        extra={
          <div className="flex flex-col gap-4">
            <label className="block">
              <span className="text-[12px] font-semibold text-text-3">Commission</span>
              <span className="field mt-1.5 flex h-12 items-center rounded-control px-3.5">
                <input
                  value={percent}
                  onChange={(e) => setPercent(e.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                  aria-label="Commission percent"
                  placeholder="10"
                  className="num h-full min-w-0 flex-1 bg-transparent text-[20px] font-bold text-text outline-none placeholder:text-text-3"
                />
                <span aria-hidden className="font-display text-[18px] font-bold text-text-3">
                  %
                </span>
              </span>
              <span className="mt-1.5 block text-[12px] text-text-3">
                {proposePct !== null
                  ? `PULSE keeps ₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(proposePct * 10)} of every ₹1,000 booked.`
                  : "0–50%, up to two decimals."}
                {currentBps !== null ? ` Now ${commissionLabel(currentBps)}.` : " No terms in force yet."}
              </span>
            </label>
            <fieldset>
              <legend className="text-[12px] font-semibold text-text-3">Payout cadence</legend>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {PAYOUT_CADENCES.map((c) => (
                  <Chip key={c} selected={cadence === c} onClick={() => setCadence(c)} className="capitalize">
                    {c}
                  </Chip>
                ))}
              </div>
            </fieldset>
          </div>
        }
        onConfirm={confirmPropose}
        onClose={() => setOpen(null)}
      />

      <Sheet
        open={open?.kind === "reissue"}
        title={`Reissue ${name}'s Organizer Code?`}
        confirmLabel="Reissue code"
        tone="danger"
        requireReason
        minReason={10}
        reasonLabel="Reason (kept in the audit trail)"
        extra={
          <PhraseBox
            phrase={CONFIRM_PHRASES.reissueCode}
            consequence="Generates a new one-time Organizer Code and immediately invalidates the previous one. Only do this after confirming the applicant's identity through their registered phone/email."
            value={typed}
            onChange={setTyped}
          />
        }
        onConfirm={confirmReissue}
        onClose={() => setOpen(null)}
      />

      {code && <OrganizerCodeModal code={code.code} orgId={code.orgId} expiresAt={code.expiresAt} subject={code.subject} onClose={() => setCode(null)} />}
    </>
  );
}
