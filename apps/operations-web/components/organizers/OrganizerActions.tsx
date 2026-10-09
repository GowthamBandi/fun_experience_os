"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Ban, Handshake, KeyRound, Lock, Pause, Play } from "lucide-react";
import { Button, Sheet, Tooltip, useToast } from "@/components/pulse";
import { ProposeTermsSheet } from "@/components/money/ProposeTermsSheet";
import { OrganizerCodeModal } from "@/components/governance/OrganizerCodeModal";
import { PhraseBox } from "@/components/governance/PhraseBox";
import { StatusSheet } from "@/components/governance/StatusSheet";
import { CONFIRM_PHRASES, RequestIdBook, isConfirmed } from "@/lib/console/actions";
import { ROLE_LABEL, can, type ConsoleRole } from "@/lib/console/capabilities";
import { rethrowForSheet } from "@/lib/console/errors";
import { canReissueOrganizerCode } from "@/lib/console/records";
import { reissueOrganizerCode } from "@/lib/governance-api";
import { statusActions, type StatusAction } from "@/lib/organizers";
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
  const [code, setCode] = useState<Code | null>(null);
  const book = useRef(new RequestIdBook("organizer"));
  // The live version at confirm time: versions move under us.
  const live = useRef(org);
  live.current = org;

  useEffect(() => setTyped(""), [open]);

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

      <StatusSheet
        action={statusOpen}
        entityType="organizer"
        entityId={orgId}
        noun="organizer"
        name={name}
        getVersion={() => live.current.version}
        onChanged={onChanged}
        onClose={() => setOpen(null)}
      />

      <ProposeTermsSheet open={open?.kind === "propose"} orgId={orgId} name={name} terms={() => ({ bps: currentBps, cadence: currentCadence })} onChanged={onChanged} onClose={() => setOpen(null)} />

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
